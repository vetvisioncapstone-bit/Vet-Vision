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

Staff logins are created from the admin UI (User Management). The 7 seeded staff have no login until an admin sets one.

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
| `GET/POST inventory/`, `PUT/DELETE inventory/<id>/` | staff (own branch) / admin; delete = admin only |
| `GET/POST patients/` (`?status=`, `?branch=`), `GET/PUT/DELETE patients/<id>/`, `POST patients/<id>/consultations/`, `DELETE consultations/<id>/` | staff (own branch) / admin; deletes = admin only |
| `GET/POST sales/` (`?since=`, `?limit=`) | staff (own branch) / admin |
| `GET/POST staff-accounts/`, `PUT/DELETE staff-accounts/<id>/` | admin |
| `GET/POST events/posts/`, `DELETE events/posts/<id>/`, `GET/PUT events/availability/` | read: staff+admin, write: admin |
| `GET/POST requests/`, `POST requests/<id>/{approve,deny,dismiss}/` | staff raise, admin resolve |
| `GET/POST seen-followups/`, `GET branches/` | staff / admin |

| `GET analytics/{overview,live,sales,inventory,forecast,report}/` (`?branch=`, `?year=`, `?month=`) | admin |
| `GET/POST me/pets/`, `GET me/reminders/`, `GET events/posts/` | pet owner (own pets, registration, follow-up and vaccine reminders, announcements) |
| `GET clinic/calendar/?from=&to=` | any signed-in user (open / half day / closed per date) |

Analytics follow the thesis: KPIs from the `v_*` views, fast/moderate/slow movers by the tercile rule, and Moving Average
forecasts (previous 6 months -> next month) with MAE/MAPE from a 12-month back-test. Figures are anchored on the latest
complete month of recorded data and every response carries `asOf`.

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
- **Cloudflare Turnstile** guards sign-in and sign-up (`core/turnstile.py`): the page sends a one-time token, the server
  verifies it with Cloudflare before looking at the password, and a missing/rejected token or Cloudflare being
  unreachable is refused (400, logged as `captcha_failed`, not counted towards the lockout). Keys: `TURNSTILE_SECRET_KEY`
  in `backend/.env`, `VITE_TURNSTILE_SITE_KEY` in the frontend `.env.local`. Both example files hold Cloudflare's public
  test keys (always pass). Production refuses to start without a secret key.
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
  `GEMINI_MODEL` (default `gemini-3.6-flash`) and `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`, used when
  the first is overloaded or out of free quota) switch models without code changes. See your limits in AI Studio.
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

Schedule `backup_db` daily (Windows Task Scheduler or cron). It needs `pg_dump` (PostgreSQL client tools; set `PG_DUMP`
if it is not on the PATH).

## Data tools

| Command | What it does |
|---|---|
| `reshape_transactions [--dry-run]` | Thins history to 13-20 transactions a day with closed Sundays/holidays and half days |
| `seed_stock [--dry-run]` | Realistic stock, reorder points and an inventory movement history (feeds the stock-out KPI); refuses to run if movements already exist |
| `seed_medical_records`, `fill_customer_fields`, `adopt_existing_db` | See above |
| `forecast_report [--out file]` | Forecast accuracy (MAE / MAPE / WAPE) per branch as Markdown for the thesis |
| `python qa/load_test.py ...` | Response-time and concurrent-user check against a running server |

## Deploying (Supabase + Render + a static host)

1. **Database (Supabase):** create a project, restore your data (`pg_restore` a `backup_db` dump), copy the connection
   string (Project settings -> Database -> URI).
2. **API (Render):** New -> Blueprint from this repo (`render.yaml`). Set `DATABASE_URL` (the string above),
   `CORS_ALLOWED_ORIGINS` (your Pages URL), `DJANGO_ALLOWED_HOSTS` and `TURNSTILE_SECRET_KEY`. The build runs the
   migrations.
3. **Web app (any static host, for example Cloudflare Pages, Netlify or Vercel):** build command `npm run build`, output `dist`, environment variables
   `VITE_API_URL=https://<your-api>.onrender.com/api` and `VITE_TURNSTILE_SITE_KEY`. `public/_redirects` makes deep links
   work. In the Cloudflare dashboard (Turnstile -> Add widget) add the site's hostname to get the real site and secret keys.
4. Create the admin login (`python manage.py createsuperuser` in the Render shell), then delete any test accounts.

Customer records are personal data (Data Privacy Act): use the real clinic data only on a host you control.

## Notes

- IDs keep the legacy string format (`INV-000123`, `PET-I00001`, `SL-I-000042`).
- Images (product photos, blood tests, waivers, avatars) are stored as base64 data URLs like the prototype did. Move to file
  storage (S3/Render disk) before production.
