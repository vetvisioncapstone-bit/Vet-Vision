# Thesis (Chapters 1–3) vs the system — status and suggested wording

Checked against `VetVision_Chapter_1_to_3_Revised_v2.docx`. The document itself was not edited.

## Now matches the thesis

| Thesis says | System |
|---|---|
| Moving Average of the previous 6 months, computed with Pandas; MAE and MAPE from scikit-learn's metrics module (2.2, 3.5, 3.6) | `backend/analytics/forecast.py` |
| Charts drawn with Chart.js (2.2, 3.5) | `src/components/shared/charts.jsx` |
| KPI 6, stock-out frequency (3.4) | Inventory analytics section on the Sales analytics page, from `inventory_transaction` |
| KPI 7, fast/slow movers by tercile within a category (3.4, 3.6) | Same section; also the pills on the Forecasting page |
| System logs in the data layer (3.3) | `AuditLog`, shown on System Settings |
| Backup and recovery (3.2.5) | `manage.py backup_db` + restore steps in `backend/README.md` |
| Customer portal: create an account, register pets, own history, notifications about services, appointments and vaccinations (1.3, 3.2.4) | Self-registration, pet registration, follow-up and vaccine-booster reminders, announcements, real clinic calendar |
| Secure login, RBAC, encrypted credentials (3.2.5) | Hashed passwords, rotating tokens, lockout, route-level RBAC tests |
| Testing methods (3.8) | `docs/qa/` (plan, checklist, questionnaire, measured results) |

## Still open

- **AI chatbot with the Google Gemini API** (objectives 2–3, 3.2, 3.6): not built.
- **Cloud deployment** (3.3, 3.5): prepared (`render.yaml`, `DATABASE_URL`, `public/_redirects`, production settings) but not deployed; needs your database and hosting accounts (the plan is Supabase and Render for the data and API, and any static host for the web app).
- **Images** are still stored as base64 in the database; move to file storage when deploying.
- **Usability and UAT** need real participants (procedure and questionnaire are ready).

## Small differences you may want to mention or reword

- SQLite "may be used" in development (3.5): PostgreSQL was used throughout, so no change needed.
- The forecasting page also reports **WAPE** next to MAE and MAPE, because MAPE is inflated for items that sell a few units a
  month. Suggested sentence for 3.8: "Because item-level demand is low and intermittent, the Weighted Absolute Percentage
  Error (WAPE) is reported alongside MAE and MAPE."
- The customer portal has no appointment booking; "appointments" are covered by follow-up reminders set by the vet.
- The demo data is simulated (about 13–20 transactions a day, closed Sundays and holidays). State it as sample data in 3.9
  or the limitations, not as the clinic's records.

## Inconsistencies inside the document

- 3.3 says the design has **three layers** (presentation, application, data), but the Figure 3-5 paragraph says **five layers**.
- 3.2.6 lists the entities "Administrator, Staff/Employee, **User/Employee**"; it should read User/Customer.
- The Chapter 2 heading reads "Literature Review" while the table of contents says "Review of Related Literature".
- The list of tables and figures gives page numbers that no longer match after the revision.
