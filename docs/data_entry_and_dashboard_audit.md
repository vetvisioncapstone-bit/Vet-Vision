# How data gets into VET Vision, and how it reaches the dashboard

Audit of the running system, traced through the code and checked against the local database on 28 September 2026
(branch `backend-integration`). **Update, same day:** gaps G1 to G5 are fixed (consultations billed as visits,
the customer on counter sales, product prices, a Services page, receiving stock); sections 3 to 5 describe the
fixed behaviour. G6 (the data is imported) goes away only by recording real activity. It answers two questions: **how does the admin (and staff) put data into the system,**
and **where does every number on the dashboard come from.** Section 5 lists what cannot be entered yet.

---

## 1. The short answer

- The dashboard is **never typed in**. Every card, chart and table is calculated live from the clinic's records each
  time the page loads (and again every 10-30 seconds while it is open).
- It reads exactly **two kinds of records**: **product sales** (`sale` + `sale_detail`) and **service visits**
  (`service_transaction` + `service_detail`). Stock cards read the **inventory** table.
- Staff put new sales in through the **Sales** page (the counter). A sale shows on the admin dashboard within about
  10 seconds and deducts the stock automatically.
- A clinic visit saved through **Patients > Add consultation** (admin or staff) now also becomes a **service visit**
  for the services billed and a **sale to the owner** for the products handed out, so it reaches the dashboard the
  same way and the products leave the shelf (G1, fixed 28 Sept).
- Everything on the dashboard today comes from the **imported history** (12,197 sales and 16,704 visits up to
  31 July 2026, with recent months shaped as sample data). **No sale or consultation has been entered through the app
  yet** (0 of each in the database).

---

## 2. Where every dashboard number comes from

The database keeps five read-only views over the raw tables (`v_sale_lines`, `v_service_lines`,
`v_branch_monthly_kpi`, `v_fast_movers`, `v_slow_movers`). The analytics endpoints (`backend/analytics/views.py`)
read those views, and the pages draw the results with Chart.js.

| On screen | Calculated from | Filled by |
|---|---|---|
| **Dashboard: Total Sales, growth %** | Sum of product sale lines + service visit lines for the month (`v_sale_lines`, `v_service_lines`) | Staff Sales page; imported history |
| **Dashboard: Clients served** | Distinct customers on sales and service visits that month | Same (see G2: counter sales carry no customer) |
| **Dashboard: Low stock items** | Inventory rows at or below their reorder point, **right now** | Inventory page (admin/staff); every sale lowers stock |
| **Dashboard: Ibaan vs San Jose** | Each branch's share of the month's total | Same as Total Sales |
| **Dashboard: Today / Latest transactions** | Sales and visits on the latest recorded day | Staff Sales page; imported history |
| **Dashboard: Monthly trend, Branch share, Most availed services** | `v_branch_monthly_kpi` and service visit lines | Same as Total Sales |
| **Sales Analytics** (branch comparison, top items, most/least availed services) | Same sale and visit lines, by year | Same |
| **Inventory analytics** (fast / moderate / slow, stock-outs) | Units sold per product per month (tercile rule); stock-outs rebuilt from `inventory_transaction` | Sales (automatic stock log), Inventory edits (adjustment log) |
| **Forecasting** (Moving Average, MAE / MAPE / WAPE, suggested orders) | Monthly revenue and units from the sale and visit lines, previous 6 complete months | Same |
| **Reports** (monthly sales, services, low stock, patients by species) | Same lines for one month; pets counted from service visits | Same |
| **AI assistant** answers | The figures above, aggregated | Same |

**The month filter** on the dashboard (added 28 Sept) only changes *which month* is calculated; it reads the same
records. Stock is always today's, because the system does not keep monthly stock snapshots.

---

## 3. Who can enter what

### 3.1 Admin (owner)

| Screen | What the admin enters | Stored in | What happens automatically |
|---|---|---|---|
| **Inventory** | New product (name, category, branch, quantity, reorder point, **selling price and cost**, delivery and expiry dates, photo); edit any of these; **Receive stock** (quantity, delivery date, new expiry); delete a product | `product`, `inventory`, `product_branch_price`, `inventory_transaction` | A quantity edit is logged as an **adjustment**, a delivery as a **restock**; delete is written to the activity log |
| **Services** | New service or edit one: name, category, price and cost per branch, and the supplies one service uses up | `service`, `service_branch_price`, `service_product_usage` | The consultation picker offers it at once; each time it is billed the trigger deducts its supplies from that branch's stock |
| **Patients** | New owner + pet; edit; delete; **add consultation** (notes, weight, services from the catalog and products from the branch's stock with quantity and price, blood test and waiver files, follow-up) | `customer`, `pet`, `medical_record`, `service_transaction` + `service_detail`, `sale` + `sale_detail` | Billed services count as a service visit and products as a sale to the owner (stock deducted by the trigger); a follow-up flags the pet and shows in the notification bell |
| **Events** | Announcements (text, photo); clinic closed / half days per branch | `event_post`, `branch_availability` | Announcements appear in the customer portal and staff feed; closures appear on the customer calendar |
| **User Management** | Staff accounts (name, @ecovet.ph email, password, branch, role, photo); deactivate | `staff`, `accounts_user` | Deactivating stops the person's access at once; an admin password reset signs them out everywhere |
| **System Settings** | Own name, email, photo, password | `accounts_user` | A password change signs out every other session; everything is in the activity log |
| **Notification bell** | Approve / deny staff delete requests; dismiss restock requests | `approval_request` | Approving deletes the product, patient or consultation |

The admin portal has **no Sales page**: counter sales are entered by staff.

### 3.2 Staff (employee, own branch only)

| Screen | What staff enter | Stored in | What happens automatically |
|---|---|---|---|
| **Sales** | Optional customer (search by owner or pet name; empty = walk-in); product, quantity, unit price per line (pre-filled from the admin's price); complete the sale | `sale`, `sale_detail` | Database trigger deducts stock and logs a **sale** movement; the dashboard updates within ~10 s and counts the customer in "Clients served" |
| **Inventory** | Add / edit products (always their own branch; prices are the admin's); **Receive stock** when a delivery arrives; **request** delete; **request** restock | `inventory`, `inventory_transaction`, `approval_request` | Deliveries logged as restocks, quantity edits as adjustments; requests go to the admin's bell |
| **Patients** | New owner + pet; edit; add consultation with services and products (same picker as the admin); **request** delete | `customer`, `pet`, `medical_record`, `service_transaction`, `sale`, `approval_request` | Same as the admin's consultation |
| **Feed** | Reads announcements | - | - |

Staff cannot delete anything directly; the server refuses and asks for a request.

### 3.3 Pet owners (customer portal)

| Screen | What they enter | Stored in |
|---|---|---|
| **Sign-up** (login page) | Name, email, mobile, nearest branch, password | `customer`, `accounts_user` |
| **Register a pet** | Pet name, species, breed, sex, birth date, markings | `pet` |

They **read** their pets' history (consultations **and** service visits merged), vaccine and follow-up reminders,
announcements and the clinic calendar. Imported customers have no login (removed 28 Sept).

### 3.4 Automatic (nobody types these)

- **Stock deduction:** an `AFTER INSERT` trigger on `sale_detail` lowers `inventory.quantity_on_hand` and writes an
  `inventory_transaction` of type `sale`. A second trigger does the same for service visits using
  `service_product_usage` (supplies a service consumes).
- **Activity log** (`accounts_auditlog`): sign-ins, failures, lockouts, sign-ups, password changes, deletes, sales,
  approvals, AI questions.
- **Dashboard refresh:** the Today panel polls every 10 s, the rest every 30 s.

---

## 4. The main flows, step by step

**A. A product sale at the counter (reaches the dashboard)**
1. Staff opens **Sales**, optionally picks the customer (search by owner or pet name), picks a product (its price
   fills in from the admin's price), sets quantity, adds more lines, presses **Complete sale**.
2. The server locks those stock rows and refuses the sale if any line exceeds the stock on hand.
3. It writes one `sale` (branch, staff, date, time, total) and one `sale_detail` per line (price, capital, profit).
4. The trigger deducts stock and logs each line as a `sale` movement.
5. Within ~10 seconds the admin dashboard's **Today**, **Total Sales**, **Latest transactions** and **Low stock**
   reflect it; forecasts and movers use it from the next complete month.

**B. A clinic visit / consultation (reaches the dashboard)**
1. Admin or staff opens **Patients**, selects the pet, fills the consultation: notes, weight, and the items billed:
   **services** chosen from the clinic's catalog (109 services, grouped by category, price pre-filled from the
   branch price) and **products** from the patient's branch stock (price pre-filled, quantity), all editable.
2. In one database transaction the server writes:
   - a `service_transaction` + one `service_detail` per service (price as entered, cost from the catalog, the staff
     member who saved it), dated the consultation date;
   - a `sale` + `sale_detail` lines to the pet's owner for the products (stock checked first; the trigger deducts it);
   - the `medical_record`, linked to that service transaction.
   If any item is wrong (unknown service, product from another branch, not enough stock) nothing is saved.
3. Within ~10 seconds the dashboard, and from the next complete month the forecasts, movers and reports, include
   it. The owner's portal lists the visit once, and vaccinations now feed the booster reminders.
4. **Deleting** the consultation (admin, or an approved staff request) removes the visit and the sale too and puts
   the products back on the shelf (logged as a `return` movement).

**C. Stock arrives or is counted**
1. A delivery: staff (own branch) or admin press **Receive stock** on the product, enter the quantity (delivery date
   defaults to today; a new expiry date is optional). The stock goes up and a `restock` movement is logged.
2. A count that does not match: edit the quantity; the difference is logged as an `adjustment`.
3. A staff **restock request** still notifies the admin, who orders; when it arrives, step 1.

**D. A new product** - Inventory > New: creates `product` (id `PRD-…`), its `inventory` row for the branch with an
opening adjustment, and (admin) its selling price and cost for that branch.

**D2. A new or changed service** - Services > New / edit (admin): name, category, price and cost per branch, and the
supplies it uses. Consultations can bill it immediately.

**E. A new patient** - Patients > New: always creates a new `customer` (owner) and `pet`. Owner email is
optional (most imported owners have none).

**F. Deleting** - Admin deletes directly (logged). Staff raise a request; the admin approves (the row is deleted) or
denies.

**G. Announcements and closures** - Events: posts go to the staff feed and customer portal; per-date closures and half
days override the regular schedule (closed Sundays and Philippine holidays) on the customer calendar.

---

## 5. What cannot be entered today (gaps), most important first

| # | Gap | Effect | Suggested fix |
|---|---|---|---|
| ~~G1~~ | **Fixed 28 Sept.** Consultations used to write only `medical_record` (12 fixed service names), so visits never reached revenue, service counts, forecasts, reports, the AI assistant or vaccine reminders, and products handed out stayed on the shelf. | - | Now a consultation also creates the service visit (from the 109-service catalog) and the product sale; see flow B. Code: `ConsultationCreate` / `remove_consultation` in `backend/clinic/views.py`, `create_sale` / `undo_sale` in `backend/sales/views.py`, `src/components/shared/AvailedItemsPicker.jsx`; tests in `backend/tests/test_patients.py`. Note: no service lists the supplies it uses yet (`service_product_usage` is empty), so services themselves deduct nothing until those are filled in (part of G4). |
| ~~G2~~ | **Fixed.** Counter sales recorded no customer. | - | Optional customer search on the Sales page (branch's owners only; empty = walk-in). |
| ~~G3~~ | **Fixed.** No screen for product prices. | - | Admin-only Selling price and Cost on the Inventory form (per branch; staff are refused). The Sales page and the consultation picker pre-fill the price, which staff can still change for a discount, so the server keeps the price as entered. |
| ~~G4~~ | **Fixed.** No screen to manage services. | - | Admin **Services** page: add or edit a service, its price and cost per branch, and its supplies (then deducted by the trigger each time it is billed). Services are not deleted: past visits refer to them. The supply lists start empty; the clinic fills them in. |
| ~~G5~~ | **Fixed.** Deliveries were logged as generic adjustments. | - | **Receive stock** on both Inventory pages logs a `restock` movement and updates the delivery (and optionally expiry) date. |
| **G6** | **All current figures are imported or sample data** ending 31 July 2026. | The dashboard shows July 2026 as the latest month and "no records yet today" until real entries start. | Start recording through the app (Sales now; consultations after G1), and describe the data as sample data in the thesis. |

---

## 6. Day-to-day routine once the gaps are closed

1. **Every sale** at the counter goes through **Sales** (staff).
2. **Every visit** goes through **Patients > Add consultation**, choosing services from the catalog (after G1).
3. **Deliveries** go through Inventory (Receive stock after G5, or quantity edit today).
4. The admin checks the **dashboard** daily (Today, Low stock), **Forecasting** monthly before ordering, and the
   **Reports** page at month end; the **AI assistant** can summarise any of these.
5. Staff raise delete and restock requests; the admin clears the bell.
6. Run `python manage.py backup_db` daily (see `backend/README.md`).

---

## 7. Reference: endpoints that write data

| Endpoint | Who | Writes |
|---|---|---|
| `POST /api/sales/` (optional `customerId`) | staff, admin | `sale`, `sale_detail` (+ trigger: `inventory`, `inventory_transaction`) |
| `POST/PUT/DELETE /api/inventory/…` | staff (no delete, no prices), admin | `product`, `inventory`, `product_branch_price`, `inventory_transaction` (adjustment) |
| `POST /api/inventory/<id>/receive/` | staff (own branch), admin | `inventory`, `inventory_transaction` (restock) |
| `POST /api/services/`, `PUT /api/services/<id>/` | admin | `service`, `service_branch_price`, `service_product_usage` |
| `POST/PUT/DELETE /api/patients/…` | staff (no delete), admin | `customer`, `pet` |
| `POST /api/patients/<id>/consultations/`, `DELETE /api/consultations/<id>/` | staff, admin (delete: admin) | `medical_record`, `service_transaction` + `service_detail`, `sale` + `sale_detail` (+ trigger); delete reverses them and returns stock |
| `GET /api/services/` | staff, admin | reads the service catalog with branch prices (admin also costs and supplies) |
| `POST/PUT/DELETE /api/staff-accounts/…` | admin | `staff`, `accounts_user` |
| `POST/PUT/DELETE /api/events/posts/…`, `PUT /api/events/availability/` | admin | `event_post`, `branch_availability` |
| `POST /api/requests/`, `…/approve|deny|dismiss/` | staff raise, admin act | `approval_request` (+ the approved delete) |
| `PATCH /api/auth/me/` | everyone | own profile / password |
| `POST /api/auth/register/`, `POST /api/me/pets/` | pet owners | `customer`, `accounts_user`, `pet` |

Counts checked on 28 Sept 2026: sales 12,197 (0 entered in the app), service visits 16,704, medical records 16,704
(all copied from the imported visits, 0 entered in the app), stock movements: 19,401 sale, 6,088 restock,
1,424 adjustment, 740 opening.
