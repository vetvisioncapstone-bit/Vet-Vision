# VET Vision

Web-based business analytics dashboard for EcoVet Animal Clinic (two branches): sales, inventory, patients,
demand forecasting and a customer portal.

- **Frontend:** React 18 + Vite (`src/`)
- **Backend:** Django 5 + Django REST Framework + PostgreSQL (`backend/`, see [backend/README.md](backend/README.md))

## Run it locally

Backend (first time: follow the setup steps in `backend/README.md`, which create the database and the admin login):

```bash
cd backend
.venv\Scripts\python manage.py runserver 8000
```

Frontend, in a second terminal from the project root:

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173 (not localhost: the reCAPTCHA key does not accept that name). The dev server proxies `/api` to the backend on port 8000
(set `VITE_PROXY_TARGET` to point somewhere else).

| Where | Who |
|---|---|
| `/` | One login for everyone (admin, staff, pet owners) and owner sign-up; each role lands on its own home |
| `/admin`, `/employee`, `/customer` | The three portals; a signed-out visitor or the wrong role is sent back to `/` or to their own home |

Production build: `npm run build` (output in `dist/`). Frontend tests: `npm test`. Backend tests: see
`backend/README.md`. `public/_headers` sets the security headers (Content-Security-Policy, nosniff, Referrer-Policy,
Permissions-Policy) on Cloudflare Pages or Netlify.

## Roles and staff positions

Three roles: **admin** (everything, both branches), **staff** (own branch only) and **customer** (pet owners, own
pets only). A staff member's **position** (set in User Management) decides what they can do:

| Position | Register / edit patients | Log visits | Prescriptions, lab results | Sell products | Stock (add, receive, edit) |
|---|---|---|---|---|---|
| Owner, Veterinarian | yes | yes | yes | yes | yes |
| Secretary, Receptionist | yes | | | yes | yes |
| Groomer, Groomer / Vet Assistant, Veterinary Assistant, Veterinary Technician | | services only | | | |
| Inventory Clerk | | | | | yes |
| Any other position | view only | | | | |

The server enforces this (`backend/core/permissions.py`); the pages only hide what a position cannot use. Only the
admin corrects a stock count; staff add a product with 0 stock and use Receive for deliveries. Details:
[backend/README.md](backend/README.md#staff-positions-rbac).

**Test logins:** one veterinarian, secretary and assistant per branch (`test.vet@ecovet.ph`, `test.vet.sj@ecovet.ph`,
...). The shared password is in `backend/.env` (`TEST_STAFF_PASSWORD`, git-ignored). Delete these accounts before
going live.
