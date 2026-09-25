# VET Vision — Quality Assurance Plan and Results

Follows thesis section 3.8 (Testing and Evaluation) and 3.9 (Evaluation Methods). Automated evidence is recorded here as
it was measured; items that need people (usability, user acceptance) have a ready procedure and questionnaire
(`Questionnaire.md`) and an empty results column for the team to fill in.

## 1. Testing methods and where each is covered

| Thesis method (3.8) | How it is done | Status |
|---|---|---|
| Functional testing | 158 automated backend tests (pytest) + 21 frontend tests (vitest) + the manual checklist in section 4 | Automated done; manual checklist ready |
| Integration testing | Backend tests call the real REST API against a real PostgreSQL database (no mocks): auth, RBAC, sales → stock deduction by DB trigger, requests → approvals, analytics from DB views | Done |
| Usability testing | Task-based session with clinic staff and management, section 6 | Ready — needs participants |
| User acceptance testing (UAT) | Owner and authorised users run the scenarios in section 5 and answer the questionnaire | Ready — needs participants |
| Performance testing | `backend/qa/load_test.py` (response time + concurrent users), results in section 7 | Done (dev server); repeat on the hosted server |
| Forecasting accuracy testing | `python manage.py forecast_report` → `forecast_accuracy.md` (MAE, MAPE, WAPE), independent of user opinion | Done |
| Security testing | `tests/test_security.py`: every API route × anonymous / customer / staff, lockout, token rotation and revocation, audit log | Done |

Run everything:

```
cd backend && python -m pytest          # 158 backend tests
cd .. && npm test                       # 21 frontend tests
cd backend && python manage.py forecast_report --out ../docs/qa/forecast_accuracy.md
cd backend && python qa/load_test.py --url http://127.0.0.1:8000 --email <admin> --password <pw> --users 5 --seconds 15
```

## 2. Requirement traceability

| Requirement (thesis) | Evidence |
|---|---|
| Central database for both branches (1.2 obj. 1, 3.3) | PostgreSQL `vetvision`; `test_patients`, `test_inventory`, `test_sales` |
| RBAC: admin / staff (own branch) / customer (own pets) (3.2.5 Security, 3.10) | `test_security` (route matrix: 30+ routes × roles), `test_customer_portal`, branch-scope tests in `test_inventory` / `test_patients` |
| Secure login, encrypted credentials (Security) | Django password hashing (PBKDF2), 15-min access tokens, rotating refresh tokens, lockout after 5 failures, `test_security`, `test_token_refresh` |
| Audit / system logs (3.3 Data layer) | `AuditLog` table, `GET /api/auth/audit/`, shown on System Settings; `test_security` |
| KPI monitoring and the 8 KPIs (3.4) | `test_analytics`: sales per branch, growth rate, service transactions, most/least availed, inventory movement, stock-out frequency (`InventoryAnalytics.stockOuts`), fast/slow movers, forecast vs actual |
| Moving Average over previous 6 months, MAE/MAPE (1.2 obj. 3, 3.6) | `analytics/forecast.py` (Pandas + scikit-learn metrics); `test_analytics` checks hand-computed values; `forecast_accuracy.md` |
| Fast / moderate / slow by tercile per category (3.6) | `classify_movers`; `test_analytics` |
| Real-time monitoring (abstract, 1.1) | `/api/analytics/live/` polled every 10 s; verified end to end with a live insert |
| Report generation (3.2.4) | `/api/analytics/report/` + print / PDF / CSV in the Reports page; `test_analytics` |
| Charts with Chart.js (3.5) | `src/components/shared/charts.jsx` |
| Customer portal: account, pets, own history, notifications (1.3, 3.2.4) | `test_portal_extras`, `test_customer_portal`: self-registration, pet registration, own pets only, follow-up and vaccine-booster reminders, announcements, real clinic calendar |
| Backup and recovery (3.2.5) | `python manage.py backup_db` (pg_dump, keeps newest 14); restore with `pg_restore`; `test_backup` |
| Performance (3.2.5) | Section 7 |
| Data integrity (3.2.5) | DB constraints and triggers; stock deducted exactly once per sale (`test_sales`); validation tests |
| Compatibility: Chrome, Edge, Firefox (3.2.5) | Manual — section 4, case C-30 |
| AI assistant (3.6) | Not built yet |

## 3. Automated test evidence

| Suite | Count | Result |
|---|---|---|
| Backend (pytest) | 158 | all pass |
| Frontend (vitest) | 21 | all pass |
| Production build (`npm run build`) | – | passes |
| Django `check --deploy` | – | only the SECRET_KEY-strength and HSTS-preload advisories, both environment settings |

## 4. Manual functional checklist

Tester fills the last column: Pass / Fail / note. Use a staff and an admin account.

| ID | Module | Steps | Expected | Result |
|---|---|---|---|---|
| C-01 | Login | Sign in with a wrong password 5 times | Message after each; the 5th failure locks the account 15 minutes | |
| C-02 | Login | Sign in as admin / staff / customer on the one login page | Lands on the matching home; opening another role's URL redirects back; signing out returns to the login page | |
| C-03 | Login | Sign out, press browser Back | Cannot see any data | |
| C-04 | Dashboard | Open as admin | KPI cards, branch chart, live panel with today's figures | |
| C-05 | Dashboard | Ring up a sale as staff; watch the admin dashboard | Sales-today updates within ~10 s | |
| C-06 | Inventory | Add, edit, and (admin) delete a product | Saved; list updates; delete records an audit-log entry | |
| C-07 | Inventory | As staff, request a delete | Admin sees the request; approve removes the item | |
| C-08 | Sales | Complete a sale with 2 products | Stock drops once per item; sale appears in latest transactions | |
| C-09 | Sales | Try to sell more than the stock | Refused with a clear message | |
| C-10 | Patients | Add a patient, add a consultation with follow-up | Shows in the table; status "Follow-up needed" | |
| C-11 | Patients | Filter by year, search by name, page through | Correct rows; fast | |
| C-12 | Patients | Print one receipt and the full history | Letterhead, fields, table, totals | |
| C-13 | Events | Post an announcement; mark a date unavailable | Customer notification bell and calendar show it | |
| C-14 | Sales analytics | Change year; check branch bars, KPIs, growth table | Numbers match the Reports page | |
| C-15 | Sales analytics | Inventory analytics section | Stock-outs, fast and slow movers per branch | |
| C-16 | Forecasting | Pick a product and a service | 6 months + forecast, MAE/MAPE, "need to order" | |
| C-17 | Forecasting | Switch branch | Figures and accuracy change | |
| C-18 | Reports | Generate sales, inventory, patient reports; Print / CSV | Content matches the period picked | |
| C-19 | User management | Create, edit, deactivate a staff account | Deactivated user is signed out and cannot sign in | |
| C-20 | System settings | Change own password | Other sessions end; this one continues; activity log records it | |
| C-21 | System settings | Open the activity log, search an email | Sign-ins, failures and deletions listed | |
| C-22 | Customer portal | On the login page choose "Create an account" and register | Signed in to the portal; empty pets list | |
| C-23 | Customer portal | Register a pet; open its record page | Pet listed; "No visits yet" | |
| C-24 | Customer portal | Legacy owner signs in with the starter password | Forced to choose a new password | |
| C-25 | Customer portal | Open the bell | Reminders (follow-up, vaccine booster) and announcements | |
| C-26 | Customer portal | Open Calendar, click a Sunday and a holiday | Shown closed with the reason; half days marked | |
| C-27 | Customer portal | Try to open another owner's pet URL / API | Not found or forbidden | |
| C-28 | Backup | Run `manage.py backup_db`; restore into a scratch DB | Restored database opens and row counts match | |
| C-29 | Print | Print a report and a patient sheet | Only the sheet prints, no menus | |
| C-30 | Compatibility | Repeat C-02, C-04, C-16 in Chrome, Edge, Firefox | Same behaviour | |
| C-31 | Keyboard | Using only the keyboard: press Tab on any page, open a "New" dialog, Tab around, press Escape | First Tab offers "Skip to main content"; focus moves into the dialog, stays inside it, and returns to the button on Escape; table rows open with Enter | |
| C-32 | Screen reader | Sign in with a wrong password; open a form in a dialog | The error is announced; the dialog and every field are read with their labels | |

## 5. User acceptance testing (UAT)

Participants: the clinic owner, 2–3 staff (both branches), plus a small group of pet owners for the customer portal
(3.9). Scenario per role (about 30 minutes):

- **Owner / admin:** review yesterday's sales per branch, find the fast-moving products, read next month's forecast for
  one product and one service, generate a monthly sales report, approve a delete request, add an announcement.
- **Staff:** record a sale, add a patient with a consultation, request a stock restock, look up a pet's history.
- **Pet owner:** register, add a pet, read the pet's history, open the notification bell, check the calendar.

Record any failure or confusion as an issue, fix, and retest before the final evaluation (3.8 Testing Procedure).

## 6. Usability testing

Same tasks, observed. Measure per task: completed (yes/no), time, number of wrong clicks. Afterwards each participant
answers the questionnaire in `Questionnaire.md` (Likert 1–5, Table 1 of the thesis). Compute the weighted mean per
criterion and interpret with Table 2 (4.21–5.00 Highly Acceptable … 1.00–1.80 Not Acceptable).

## 7. Performance results

Measured with `qa/load_test.py` on the development server (Django `runserver`, debug on, PostgreSQL 18, same
laptop), against 28,901 transactions. Full output: `performance_run.txt`. Repeat on the hosted server for the thesis.

| Measurement | Result |
|---|---|
| Login (includes password hashing) | median 723 ms |
| Live dashboard panel | median 109 ms |
| Overview | median 209 ms |
| Patients page (25 rows) | median 143 ms |
| Inventory list (740 rows) | median 476 ms |
| Sales analytics | median 617 ms |
| Forecast (cached / first calculation) | median 157 ms / about 1.9 s once per data change |
| 5 users at once, 15 s | 217 requests (14.5/s), 0 errors, median 309 ms, 95th percentile 749 ms |

Reading: pages answer within about a second, well inside "acceptable" for the dashboard. The forecast is cached and
recomputed only when a sale, visit or stock change makes it stale.

## 8. Forecast accuracy (independent of user opinion)

See `forecast_accuracy.md` (generated). Headline, all branches: total revenue MAPE 7.1 %, service transactions MAPE
10.5 %. Item level is much higher (products 72 % MAPE, 79 % WAPE) because 70 % of product-months sell five units or
fewer, so one sale moves the percentage. San Jose is weaker (about 33 %) because the branch opened in July 2025 and its
history is still ramping up, which a simple Moving Average lags behind. Report both honestly; WAPE is the fair
item-level measure.

## 9. Known limitations to state in the thesis

- The data is a simulated set shaped to a clinic's pace (13–20 transactions a day, closed Sundays and holidays); it
  is not the clinic's real records.
- Moving Average lags trends and steps by design (the thesis method); item-level results are rough guides.
- Performance figures come from a development laptop, not the hosted server.
- The AI assistant (Gemini) is the remaining feature.
