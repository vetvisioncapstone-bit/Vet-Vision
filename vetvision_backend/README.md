# VetVision Backend (Django + DRF)

Built directly against `vetvisiondb.sql` — a real pg_dump with 17 tables,
2 triggers, 5 analytics views, and a seeded dataset (17,483 sales, 24,065
service transactions, 1,860 customers, 2,980 pets, July 2021–2026). That
dump was loaded into a scratch Postgres instance and verified end-to-end
(row counts, triggers, views all checked) before this code was written —
see "How this was verified" below.

**This code has not been run against a live Django install.** The sandbox
this was built in blocks PyPI and apt (org network policy — see below), so
`pip install` couldn't happen here. Every file was hand-written directly
from the verified DDL and syntax-checked (`python -m py_compile`), but you
need to actually run `migrate`/`runserver` yourself to catch anything a
compiler can't (typos in a field name that only blows up at query time,
etc.). Treat the first `python manage.py check` you run as part of this
build, not as optional.

## Setup

```bash
python -m venv venv
source venv/bin/activate        # venv\Scripts\activate on Windows
pip install -r requirements.txt

cp .env.example .env
# edit .env: point DB_* at the same Postgres server pgAdmin connects to
```

Django never creates or alters any of the 17 real tables (every model in
`branches/`, `accounts/`, `catalog/`, `inventory/`, `sales/`, `service_ops/`,
`patients/`, `communications/` is `managed = False` — see each app's
`models.py` for why). So there's no `migrate` step for your actual data;
just point `.env` at the database that already has `vetvisiondb.sql`
loaded into it and run:

```bash
python manage.py check          # catches import/config mistakes fast
python manage.py seed_admin     # creates your first login (see below)
python manage.py runserver
```

### Creating the first login

Every `staff`/`customer` row in the seeded dataset has `username`/`email`/
`password_hash` = NULL — nobody has an account yet, because this dataset
was generated for analytics, not from real sign-ups. `seed_admin` uses
`SEED_ADMIN_STAFF_ID` / `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` from
`.env` to turn one existing `staff` row into the first admin login (it also
forces that row's `role` into `settings.ADMIN_JOB_ROLES` so it actually has
admin permissions — see "RBAC" below for why that's necessary). Pick a
`staff_id` from `SELECT staff_id, staff_name FROM staff;` in pgAdmin first.

## API shape

| Area | Base path | Notes |
|---|---|---|
| Auth | `/api/auth/` | `staff/login/`, `customer/login/`, `token/refresh/`, `staff/me/`, `customer/me/`, `change-password/` |
| Branches | `/api/branches/` | read-only, 2 rows |
| Catalog | `/api/catalog/products/`, `/services/`, `/service-product-usage/` | prices nested per-branch |
| Inventory | `/api/inventory/stock/`, `/transactions/` | `POST stock/{id}/adjust/` for manual corrections |
| Sales | `/api/sales/` | `POST` with `{lines: [{product_id, quantity, pet_id?}]}` — prices/totals/inventory all handled server-side |
| Services | `/api/services/` | same shape, for grooming/consultation/vaccination visits |
| Patients | `/api/patients/pets/`, `/medical-records/` | |
| Notifications | `/api/notifications/` | staff create, customers read/mark-read their own |
| Analytics | `/api/analytics/kpi/monthly/`, `/kpi/growth-rate/`, `/fast-movers/`, `/slow-movers/`, `/forecast/` | wraps the SQL views + the Moving Average forecast (thesis §3.6) |

All endpoints except login require `Authorization: Bearer <access token>`.

## Design decisions worth knowing before you extend this

**No schema changes.** Every table from `vetvisiondb.sql` is mapped as-is
(`managed = False`). Nothing was added or altered, so the database you
verified in pgAdmin stays exactly what Django talks to.

**Auth is fully custom, not `django.contrib.auth`.** There's no
`auth_user` table in this schema — login checks `staff.password_hash` or
`customer.password_hash` directly (via Django's own password hashers, so
they're stored securely once set). JWTs are issued by hand with custom
claims (`user_type`, `staff_id`/`customer_id`, `role`, `branch_id`) rather
than through `simplejwt`'s default `TokenObtainPairView`, because that view
assumes a single `AUTH_USER_MODEL` and this schema has two different login
tables. See `accounts/tokens.py` and `accounts/authentication.py`.

**RBAC is config, not schema.** `staff.role` holds job titles
("Veterinarian", "Secretary", "Groomer / Vet Assistant") from the seeded
dataset — not the thesis's system permission levels (Administrator, Owner,
Branch Manager, Staff). Rather than add a column to a schema you already
verified, `settings.ADMIN_JOB_ROLES` decides which job-title values count
as "admin" for API purposes (`accounts/permissions.py::IsAdminStaff`). If
you want real separation between "Veterinarian" the job and "Branch
Manager" the permission level, that's the one place worth reconsidering —
either broaden `ADMIN_JOB_ROLES`, or add a dedicated permission-level column
later (an additive migration, not a rewrite).

**IDs mostly aren't database sequences.** Only `inventory` and
`inventory_transaction` have real Postgres `SEQUENCE`s behind them (used
in `inventory/views.py::_next_txn_id`). Everything else (`sale_id`,
`pet_id`, `customer_id`, etc.) was populated by whatever script built the
seed data, using patterns like `SL-I-000001` (branch-letter-scoped) or
`SD-0000001` (globally sequential). `common/id_generators.py` replicates
that by reading the current max and incrementing — correct, but a
read-then-write pattern, not an atomic DB sequence. Fine for a clinic POS's
write volume; revisit if this ever needs to survive heavy concurrent writes.

**Inventory deduction happens in the database, not in Django.** Inserting
a `SaleDetail` or `ServiceDetail` row fires a trigger
(`trg_sale_detail_inventory` / `trg_service_detail_inventory`) that
decrements `inventory.quantity_on_hand` automatically. `sales/serializers.py`
and `service_ops/serializers.py` both call this out in comments at the
exact line where it matters — don't add a second manual deduction next to
those `.create()` calls, or stock will be deducted twice.

**Analytics leans on the DB, not pandas, wherever possible.** The KPI
math from thesis §3.4 (sales per branch, service transactions per branch,
gross/profit) is already computed by `v_branch_monthly_kpi`,
`v_fast_movers`, `v_slow_movers` — SQL views that shipped in the dump.
`analytics/views.py` just serializes them. Only the Moving Average demand
forecast (thesis §3.6) actually uses Pandas + Scikit-learn in Python
(`analytics/forecasting.py`) — and per the thesis's own scope, Scikit-learn
is used only for `mean_absolute_error`/`mean_absolute_percentage_error`,
never for training a model.

## How this was verified (without a working Django install)

1. `vetvisiondb.sql` was loaded into a scratch PostgreSQL 16 instance.
2. Row counts were diffed against the dump's own `COPY` blocks for every
   table (17,483/17,483 sales, 24,065/24,065 service transactions, etc.)
   — all matched exactly.
3. Both triggers and all 5 views were queried directly and returned
   correct-looking data (e.g. `v_branch_monthly_kpi` for BR-001 July 2021:
   96 sale txns, ₱70,965 gross — spot-checked against raw `sale` rows).
4. Every `.py` file in this project was run through `python -m py_compile`
   (syntax only — no Django-specific validation, since Django itself
   couldn't be installed here).
5. `pip install django` and `apt-get update` both returned `403 Forbidden`
   from this sandbox's network policy (PyPI and the Ubuntu archive are
   both outside its egress allowlist here) — that's a property of this
   particular sandboxed session, not of your own machine. Steps 1–4 are as
   far as verification could go from here; step 5 onward is on you, with
   real internet access.

## Next steps

1. `pip install -r requirements.txt`, then `python manage.py check` —
   fix anything it flags before going further.
2. `python manage.py seed_admin`, confirm you can `POST /api/auth/staff/login/`.
3. Smoke-test one write path end-to-end (e.g. `POST /api/sales/` with one
   line item) and confirm in pgAdmin that `inventory.quantity_on_hand`
   actually dropped — that's the trigger-interaction path most worth
   double-checking with real Django running.
4. Wire the React admin/employee panels' `fetch`/`localStorage` calls over
   to these endpoints, module by module.
