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

## Tests

```bash
.venv\Scripts\python -m pytest -q
```

Uses a throwaway `test_<DB_NAME>` database (needs a Postgres role with CREATEDB). Includes the "a sale deducts stock exactly
once" test — the database trigger does the deduction, the API must never do it too.

## API (all under `/api`, JSON, `Authorization: Bearer <access>`)

| Endpoint | Who |
|---|---|
| `POST auth/login/`, `POST auth/refresh/`, `GET/PATCH auth/me/` | anyone / signed-in |
| `GET/POST inventory/`, `PUT/DELETE inventory/<id>/` | staff (own branch) / admin; delete = admin only |
| `GET/POST patients/` (`?status=`, `?branch=`), `GET/PUT/DELETE patients/<id>/`, `POST patients/<id>/consultations/`, `DELETE consultations/<id>/` | staff (own branch) / admin; deletes = admin only |
| `GET/POST sales/` (`?since=`, `?limit=`) | staff (own branch) / admin |
| `GET/POST staff-accounts/`, `PUT/DELETE staff-accounts/<id>/` | admin |
| `GET/POST events/posts/`, `DELETE events/posts/<id>/`, `GET/PUT events/availability/` | read: staff+admin, write: admin |
| `GET/POST requests/`, `POST requests/<id>/{approve,deny,dismiss}/` | staff raise, admin resolve |
| `GET/POST seen-followups/`, `GET branches/` | staff / admin |

Staff cannot hard-delete: they raise an approval request and the admin's approval performs the delete.

## Notes

- IDs keep the legacy string format (`INV-000123`, `PET-I00001`, `SL-I-000042`).
- Images (product photos, blood tests, waivers, avatars) are stored as base64 data URLs like the prototype did. Move to file
  storage (S3/Render disk) before production.
- Customer-portal login and the analytics endpoints (`v_branch_monthly_kpi`, `v_fast_movers`, ...) are the next milestone.
