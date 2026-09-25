# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Clinic owner / admin (primary, wins design conflicts).** Reviews sales, inventory and demand across the EcoVet branches (Ibaan and San Jose) to decide what to stock and where.
- **Branch staff (shown as "employee").** Work at the counter: complete sales, manage inventory for their own branch, keep patient records. Staff cannot delete directly; they raise a request that the admin approves.
- **Pet owners (customers).** Sign up on the login page, register pets, see health history, vaccination reminders and the clinic calendar.

## Product Purpose

VET Vision is a centralized web-based business analytics dashboard for multi-branch sales, inventory and demand analysis for EcoVet Animal Clinic. It is a capstone thesis project. Success: the owner sees one trustworthy view of both branches, forecasts demand with a moving-average model, and spots low stock and stock-outs early.

## Positioning

One system for the clinic's clinical records, point of sale, inventory and demand forecasting across branches, built on the clinic's own transaction history, not a generic retail tool.

## Operating Context

- One login page at `/` serves admin, staff and customers; each role lands in its own portal.
- Data comes from a PostgreSQL database seeded from the clinic's legacy schema; recent volume was reshaped to about 13 to 20 transactions per day with closures (Sundays, Philippine holidays) and half days. Treat the data as sample data.
- Forecast: Moving Average of the previous 6 complete months, with MAE, MAPE and WAPE; products and services are ranked fast, moderate or slow by tercile.
- Stack in place: React 18 + Vite frontend, Django + DRF + PostgreSQL backend, JWT auth.

## Capabilities and Constraints

- Admin: dashboard, sales analytics, forecasting, inventory, patients, events, reports, user management, system settings with an activity log.
- Staff: dashboard, sales, inventory, patients, feed.
- Customer: home, pets, reminders, clinic calendar, pet registration.
- Not built yet: the AI chatbot (Gemini), real password reset (no mail service), deployment.
- Password recovery is handled by an admin resetting the account in User Management.
- Images are stored as base64 in the database.

## Brand Commitments

- Keep the EcoVet Animal Clinic logo and the VET Vision wordmark.
- Green is the brand color (currently #2d7a4d and #4caf50).
- Voice: friendly, plain and short, not clinical.

## Evidence on Hand

- Real clinic transaction history in the database; the recent months are simulated.
- No testimonials, customer quotes or measured business results exist. Do not invent any.
- Usability and user-acceptance results are not collected yet.

## Product Principles

1. Show the numbers a branch owner needs to decide, and say when data is thin or stale.
2. The role decides what a person sees. Never show a control the role cannot use.
3. Keep daily counter tasks fast and keyboard-friendly.
4. Say plainly what the system knows and what it does not, such as low-volume forecasts.

## Accessibility & Inclusion

Target WCAG 2.1 AA. Already in place: labelled dialogs with focus management, visible focus rings, skip links, labelled form fields and reduced-motion support.
