# VET Vision backend

Django 5.2 + Django REST Framework + PostgreSQL 18. JWT auth (email + password), roles `admin` / `staff` / `customer`.
The schema is the original `vetvisiondb.sql` (17 tables, 5 analytics views, stock-deduction triggers) plus a few additive
columns/tables the UI needs. See `*/models.py` and the migrations.

## First-time setup (Windows, from `backend/`)

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt

copy .env.example .env         # then edit .env: set DB_PASSWORD (your postgres password) and DJANGO_SECRET_KEY
```

Create the database (psql lives in `C:\Program Files\PostgreSQL\18\bin`):

```bash
psql -U postgres -c "CREATE DATABASE vetvision"
```

Build the schema, load the historical data from the dump, create the owner account:

```bash
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py load_legacy_data "C:\path\to\vetvisiondb.sql"   # 17k sales, 24k service txns, ...
.venv\Scripts\python manage.py create_admin --email you@ecovet.ph --name "Your Name"   # prompts for a password
.venv\Scripts\python manage.py runserver 8000
```

`load_legacy_data` refuses to run on a database that already has data. It disables the stock triggers while loading (history
must not move stock) and validates every foreign key before re-enabling them.

Staff logins are created from the admin UI (User Management): pick the staff member, their position and a password.
A staff record without a login cannot sign in.

## Using an existing database

If the schema and data are already in PostgreSQL (for example restored from `vetvisiondb.sql` in pgAdmin), skip
`load_legacy_data` and run `python manage.py adopt_existing_db` once (back up first). It adds only the columns and tables
the backend needs and marks the migrations as applied. `python manage.py fill_customer_fields` fills empty customer
names. It invents no emails or passwords: customer accounts come only from pet owners registering on the
sign-in page (or test accounts).

## Tests

The test tools live in `requirements-dev.txt` (production installs only `requirements.txt`).

```bash
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m pytest -q
```

Uses a throwaway `test_<DB_NAME>` database (needs a Postgres role with CREATEDB). Includes the "a sale deducts stock exactly
once" test — the database trigger does the deduction, the API must never do it too.

## API (all under `/api`, JSON, `Authorization: Bearer <access>`)

| Endpoint | Who |
|---|---|
| `POST auth/login/`, `POST auth/register/` (owner self sign-up), `POST auth/refresh/`, `POST auth/logout/` | anyone |
| `GET/PATCH auth/me/` | signed-in |
| `GET auth/audit/` (`?q=`, paged) | admin |
| `GET health/` | anyone (host health check) |
| `GET/POST inventory/`, `PUT/DELETE inventory/<id>/` | staff (own branch) / admin; delete = admin only; only the admin changes `quantity` |
| `POST inventory/<id>/receive/` `{quantity, delivery?, expiration?, confirmRepeat?}` | staff (own branch) / admin: a delivery, logged as a restock. The same item received again within 10 minutes returns a warning first; resend with `confirmRepeat: true` |
| `GET/POST patients/` (`?status=`, `?branch=`), `GET/PUT/DELETE patients/<id>/`, `POST patients/<id>/consultations/`, `DELETE consultations/<id>/` | staff (own branch) / admin; deletes = admin only |
| `GET/POST sales/` (`?since=`, `?limit=`), body `{items: [{inventoryId, quantity, price}], customerId?}` (blank = walk-in; the owner must be on that branch) | staff (own branch) / admin |
| `GET services/` (each branch's price), `POST services/`, `PUT/DELETE services/<id>/` | read: staff+admin; write: admin. A service used by past visits is retired (hidden), not deleted |
| `GET/POST staff-accounts/`, `PUT/DELETE staff-accounts/<id>/` | admin |
| `GET/POST events/posts/`, `DELETE events/posts/<id>/`, `GET/PUT events/availability/` | read: staff+admin, write: admin |
| `GET/POST requests/`, `POST requests/<id>/{approve,deny,dismiss}/` | staff raise, admin resolve |
| `GET/POST seen-followups/`, `GET branches/` | staff / admin |
| `GET analytics/{overview,live,sales,inventory,forecast,report}/` (`?branch=`, `?year=`, `?month=`), `POST analytics/assistant/` | admin |
| `GET/POST me/pets/`, `GET me/reminders/`, `GET events/posts/` | pet owner (own pets, registration, follow-up and vaccine reminders, announcements) |
| `GET clinic/calendar/?from=&to=` | any signed-in user (open / half day / closed per date) |

Analytics follow the thesis: KPIs from the `v_*` views, fast/moderate/slow movers by the tercile rule, and Moving Average
forecasts (previous 6 months -> next month) with MAE/MAPE from a 12-month back-test. Figures are anchored on the latest
complete month of recorded data and every response carries `asOf`.

The forecast page also shows, without changing the forecast itself:

- **Order advice** per product, worked out branch by branch and added up (one branch's surplus never hides the
  other's shortage): `need = forecast + safety stock - stock on hand`, rounded up, never below 0. The safety stock is
  the item's reorder point at that branch (about ten days of demand), covering the 3-8 day delivery time.
- **Seasonal note:** last year's same month against the six months before it, and the trend of the latest three
  months against the three before them (`analytics/forecast.py` `seasonal_check`).
- **Stock-outs:** days a branch's shelf closed at zero and the units it probably could not sell, rebuilt from the
  stock ledger.

Prices are per branch (`product_branch_price`, `service_branch_price`); the admin sets them on the Inventory and
Services pages. Product and service costs are shown to the admin only.

### Consultations

`POST patients/<id>/consultations/` takes `{date, weight?, notes, availedItems?, remarks?, labResults?, waivers?,
followUp?, followUpNote?, prescription?}`:

- `availedItems`: `[{type: "Service", serviceId, quantity, price}]` or `[{type: "Product", inventoryId, quantity,
  price}]`. Services are billed as a service visit; products become a sale to the pet's owner (the trigger deducts
  stock), so the visit shows up once on the dashboard, in forecasts, reports and the owner's history.
- `labResults`, `waivers`: up to 10 files each, `[{name, image}]` (base64 data URLs, images downscaled in the browser).
- `prescription`: `{diagnosis?, rx, nextAppointment?, veterinarian?, licenseNo?, ptr?}`, printed from the patient
  page on the Rx pad.
- `followUp: true` needs a `followUpNote`.

## Staff positions (RBAC)

The role (`admin` / `staff` / `customer`) decides the portal; for staff, the **position** on their staff record
decides what they can change. `core/permissions.py` maps each position to abilities:

| Ability | Allows | Positions |
|---|---|---|
| `patients.edit` | register and edit pets and owners | Owner, Veterinarian, Secretary, Receptionist |
| `consult` | log a consultation (services) | Owner, Veterinarian, Groomer, Groomer / Vet Assistant, Veterinary Assistant, Veterinary Technician |
| `clinical` | prescriptions and lab results on a consultation | Owner, Veterinarian |
| `sales` | sell products (Sales page, products on a consultation) | Owner, Veterinarian, Secretary, Receptionist |
| `inventory` | add products, receive deliveries, edit product details | Owner, Veterinarian, Secretary, Receptionist, Inventory Clerk |

- The admin has every ability. A position not in the map (for example "Driver") is **view-only**.
- Each write endpoint checks its ability with `require(user, ability, message)` and answers 403 with a plain message.
- `GET auth/me/` returns `abilities`; the frontend (`useEmployeeContext().can(...)`) hides what a position cannot use
  and sends a direct visit to `/employee/sales` back to the dashboard. The pages only hide; the server enforces.
- **Stock count:** only the admin changes `quantity` (a correction). Staff add a product with quantity 0 (anything
  else is a 400) and record deliveries with Receive; a staff `PUT` that changes the quantity is a 403.
- Tests: `tests/test_positions.py`.
- To change who can do what, edit `POSITION_ABILITIES` and the hint in `src/pages/admin/UserManagement.jsx`
  (`POSITION_ACCESS`), which shows under the Position field.

Staff cannot hard-delete: they raise an approval request and the admin's approval performs the delete.

## Security

- Passwords are hashed (PBKDF2) and validated (length, common, all-numeric). Imported customer records have no login
  (the old starter-password hashes on the customer table are never checked); a sign-up cannot use an email that is
  already on a clinic record, so nobody can claim someone else's pets.
- Access tokens last 15 minutes; refresh tokens 1 day, **rotate on every use** and the old one is blacklisted. Sign-out
  blacklists the token; changing (or an admin resetting) a password ends every other session; deactivating a user stops
  them at once.
- 5 wrong passwords lock that account for 15 minutes (`accounts/audit.py`), on top of the per-IP rate limits (login
  10/min, refresh 30/min, sign-up 5/min, 1500/min per user).
- **Google reCAPTCHA v2** ("I'm not a robot") guards sign-in and sign-up (`core/recaptcha.py`): the page sends a
  one-time token, the server verifies it with Google before looking at the password, and a missing/rejected token or
  Google being unreachable is refused (400, logged as `captcha_failed`, not counted towards the lockout). Keys:
  `RECAPTCHA_SECRET_KEY` in `backend/.env`, `VITE_RECAPTCHA_SITE_KEY` in the frontend `.env.local`. Both example files
  hold Google's public test keys (always pass). Production refuses to start without a secret key.
- Every sign-in, failure, lockout, password change, sign-up and destructive action is written to `AuditLog`
  (`GET /api/auth/audit/`, shown on the admin System Settings page).
- With `DJANGO_DEBUG=False`: HTTPS redirect, secure cookies, HSTS, JSON-only API; the Django admin site is off unless
  `DJANGO_ENABLE_ADMIN=True`. Check with `python manage.py check --deploy`.
- `tests/test_security.py` walks every API route and asserts anonymous callers get 401, customers 403 on clinic routes and
  staff 403 on admin routes.

## AI assistant (admin only, thesis section 3.6)

`POST /api/analytics/assistant/` with `{message, history?, page?}` returns `{reply}` from Google Gemini (free tier),
code in `analytics/assistant.py`.

- **Setup:** create a key at <https://aistudio.google.com> in a project **without billing** (that keeps it on the
  free tier: going over the limits returns "busy", never a bill). Put it in `backend/.env` as `GEMINI_API_KEY=...`.
  `GEMINI_MODEL` (default `gemini-3.6-flash`) and `GEMINI_FALLBACK_MODEL` (comma-separated, default
  `gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest`) switch models without code
  changes. See your limits in AI Studio.
- **Staying available:** free-tier models are often "high demand" (503) or out of quota (429). Each question tries the
  models in order until one answers; each has its own quota. A model that was busy, out of quota, retired (404) or
  unreachable is skipped for 60 seconds, so the next questions go straight to one that works. Tries stop after
  45 seconds (the web server allows 60). A connection dropped before Google answers (some networks reset many TLS
  handshakes) is retried at once on the same model, up to 4 times.
- **Daily reports (function calling):** the monthly context does not break figures down by day, so Gemini is given
  one function, `get_daily_report(start_date, end_date)`. When a question is about particular days or a week ("July
  14", "kahapon", "first week of July"), Gemini asks for it, `daily_report()` runs the query and returns per day and
  per branch: product sales, sale count, units sold, service revenue, visits, gross profit, stock received and
  adjusted, plus period totals, the top 10 products and services and visits by species. At most 31 days per call
  and 3 lookups per question. Only totals and product/service names; no customer, pet, staff or transaction detail.
  Today's date goes in the prompt so "yesterday" resolves; days without records are reported as such.
- **What Gemini sees:** the dashboard's aggregated figures for both branches (sales, services, inventory movement,
  KPIs, forecasts, product/service names), about 5,500 tokens, built fresh for each question. Never customer names or
  contact details, pets or medical records (`tests/test_assistant.py` checks this). Google may use free-tier prompts
  to improve its products, which is another reason only aggregates are sent.
- **Behaviour:** answers from those figures only, explains (does not redo) the forecasts and fast/slow classification,
  frames recommendations as suggestions, replies in English, Filipino or Taglish, declines off-topic and veterinary
  medical questions.
- **Privacy and limits:** the conversation lives in the browser for the session; the server keeps only an `ai_query`
  audit entry (who, when; not the question). 10 questions a minute per admin.

## Backup and recovery

```bash
python manage.py backup_db            # backups/<db>_<timestamp>.dump, keeps the newest 14
pg_restore --clean --if-exists -d <database> backups\<file>.dump
```

The file name starts with the database name, so a backup of the hosted (Railway) database is
`railway_<timestamp>.dump`. It needs `pg_dump` (PostgreSQL client tools; set `PG_DUMP` if it is not on the PATH), the
same major version as the server or newer.

Run it weekly. On Windows, register the task once from PowerShell (replace `<project>` with the project folder):

```powershell
Register-ScheduledTask -TaskName "VET Vision weekly backup" -Action (New-ScheduledTaskAction -Execute "<project>\backend\.venv\Scripts\python.exe" -Argument "manage.py backup_db" -WorkingDirectory "<project>\backend") -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 8pm) -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries)
```

`-StartWhenAvailable` runs a missed backup the next time the computer is on. Check it with
`Get-ScheduledTask "VET Vision weekly backup"`, and copy the dumps off the computer now and then.

## Data tools

| Command | What it does |
|---|---|
| `reshape_transactions [--dry-run]` | Thins history to 13-20 transactions a day with closed Sundays/holidays and half days |
| `seed_stock [--dry-run]` | Realistic stock, reorder points and an inventory movement history (feeds the stock-out KPI); refuses to run if movements already exist |
| `extend_history --from 2026-08 --to 2026-09 [--dry-run]` | Adds whole months of demo transactions resampled from the same weekday a year earlier (the imported data ends 2026-07-31); back up first |
| `seed_prescriptions [--dry-run]` | Gives past consultations a diagnosis and prescription, rule-based on the visit; never overwrites what a vet typed; leaves License No./PTR blank |
| `seed_medical_records`, `fill_customer_fields`, `adopt_existing_db` | See above |
| `forecast_report [--out file]` | Forecast accuracy (MAE / MAPE) per branch as Markdown for the thesis |
| `python qa/load_test.py ...` | Response-time and concurrent-user check against a running server |

## Deploying (Railway)

1. **Database:** the clinic data is on **Railway** PostgreSQL (`DATABASE_URL` in `backend/.env`). Any hosted
   PostgreSQL works (Supabase too): restore a `backup_db` dump with `pg_restore` and copy its connection string.
2. **API**, either host:
   - **Railway (always on, next to the database):** in the database's project, New -> GitHub Repo -> this repo, then
     in the service's Settings set Root Directory `backend` and Healthcheck Path `/api/health/`. No config file is
     needed: Railway detects Django and runs `python manage.py migrate && gunicorn config.wsgi:application`;
     `.python-version` picks Python 3.10 and `gunicorn.conf.py` sets the port, one worker and the 60 s timeout.
     Variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}` (private network), `DJANGO_DEBUG=False`,
     `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS=<your-api-host>,healthcheck.railway.app`, `CORS_ALLOWED_ORIGINS`
     (your website URL), `RECAPTCHA_SECRET_KEY`, `GEMINI_API_KEY`. Then Settings -> Networking -> Generate Domain (or
     add `api.<your-domain>`).
   - **Render (free, sleeps after 15 idle minutes):** New -> Blueprint from this repo (`render.yaml`). Set
     `DATABASE_URL` (the string above), `CORS_ALLOWED_ORIGINS` (your website URL), `DJANGO_ALLOWED_HOSTS` and
     `RECAPTCHA_SECRET_KEY`. The build runs the migrations.
3. **Web app (Railway):** in the same project, New -> GitHub Repo -> this repo again. Leave Root Directory empty and
   set Healthcheck Path `/health`. Variables (read at build time): `VITE_API_URL=https://<your-api-host>/api` and
   `VITE_RECAPTCHA_SITE_KEY`. Railway builds `npm run build`; the `Caddyfile` at the repo root serves `dist`, sends deep
   links to the app and adds the security headers. Then Settings -> Networking -> Generate Domain, and put that
   address in the API's `CORS_ALLOWED_ORIGINS`. At https://www.google.com/recaptcha/admin create a v2 "I'm
   not a robot" key with the site's domain to get the real site and secret keys.
4. If the API host changes, update `connect-src` in the `Caddyfile` and redeploy: the browser blocks any other origin.
5. Create the admin login (`python manage.py create_admin --email ... --name "..."`, run from your computer with `DATABASE_URL` set), then delete the test accounts
   (`test.*@ecovet.ph`) and their staff records.

Customer records are personal data (Data Privacy Act): use the real clinic data only on a host you control.

## Troubleshooting

- **Sign-in says "request failed" / the API stops with a database timeout:** the API cannot reach the hosted
  database. Some routers' DNS return a wrong address for `*.proxy.rlwy.net`. Set the network adapter's DNS to
  `1.1.1.1` and `8.8.8.8`, run `ipconfig /flushdns` and restart the API. Compare `nslookup <host> 1.1.1.1` with plain
  `nslookup <host>` to confirm.

## Notes

- IDs keep the legacy string format (`INV-000123`, `PET-I00001`, `SL-I-000042`).
- Images (product photos, blood tests, waivers, avatars) are stored as base64 data URLs like the prototype did. Move to file
  storage (S3/Render disk) before production.
