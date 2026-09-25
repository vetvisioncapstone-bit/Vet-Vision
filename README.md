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

Open http://localhost:5173. The dev server proxies `/api` to the backend on port 8000
(set `VITE_PROXY_TARGET` to point somewhere else).

| Where | Who |
|---|---|
| `/` | One login for everyone (admin, staff, pet owners) and owner sign-up; each role lands on its own home |
| `/admin`, `/employee`, `/customer` | The three portals; a signed-out visitor or the wrong role is sent back to `/` or to their own home |

Production build: `npm run build` (output in `dist/`). Frontend tests: `npm test`. Backend tests: see
`backend/README.md`. Quality-assurance plan, checklist, questionnaire and measured results: `docs/qa/`.
