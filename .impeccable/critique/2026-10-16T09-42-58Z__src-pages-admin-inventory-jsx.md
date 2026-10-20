---
target: critique src/pages/admin/Inventory.jsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Jomar Ichiro\\Desktop\\VET_Vision_Main\\src\\pages\\admin\\Inventory.jsx"
target_fingerprint: "sha256:b397514d9276e0c8de466530393fd9250018d7a8d2e7b0942467b40c08e50f32"
target_path: "C:\\Users\\Jomar Ichiro\\Desktop\\VET_Vision_Main\\src\\pages\\admin\\Inventory.jsx"
timestamp: 2026-10-16T09-42-58Z
slug: src-pages-admin-inventory-jsx
closed: true
---
Method: DEGRADED single-context (sub-agents only on explicit user request in this session)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Page 1 shows ten "Ok" rows while 24 items need reordering |
| 2 | Match with the real world | 3 | "Total SKUs" jargon; title promises a forecast not on the page |
| 3 | User control and freedom | 3 | No undo on a wrong delivery |
| 4 | Consistency and standards | 2 | Product split per branch; status casing; one stat card not clickable; admin lacks reorder column |
| 5 | Error prevention | 3 | A delivery can still be recorded twice |
| 6 | Recognition rather than recall | 3 | Quantity shown without its reorder point |
| 7 | Flexibility and efficiency | 1 | No sorting, 74 pages of 10, no multi-item delivery |
| 8 | Aesthetic and minimalist design | 2 | 30 action buttons per page, red Delete on every row, empty photo column |
| 9 | Error recovery | 3 | Plain errors, forms keep input |
| 10 | Help and documentation | 3 | Guide line and field hints in context |
| Total | | 26/40 | Acceptable |

## Design Specificity
Standard admin table pattern; clinic-specific only in details (expiry statuses, receive vs correction, branch). Missed: the Clinic Ledger idea; the stock movement history is never shown. Detector: code scan clean; live overlay 7 findings (4 sidebar layout-transition, 1 stat card top border = false positive per DESIGN.md, 1 line-length ~109 chars, 1 sidebar).

## Priority Issues
- [P1] Problems buried in 74 pages, near-alphabetical order. Fix: urgency sort by default, sortable headers, 25 per page. /impeccable layout
- [P1] One product split into a row per branch; branches cannot be compared. Fix: one row per product with Ibaan and San Jose columns under All branches. /impeccable shape
- [P1] Actions column is 27% of the table, 30 buttons per page, Delete on every row, empty photo column. Fix: keep Receive + Edit, Delete only in the detail popup, hide photo column when no photos. /impeccable distill
- [P2] Quantity has no context (no reorder point in admin table). Fix: "6 · reorder at 3" or a small bar. /impeccable clarify
- [P2] Phone: first row at 892px, actions off-screen, 28px buttons. Fix: compact stat row, card layout under 600px, 44px buttons. /impeccable adapt

## Persona Red Flags
- Alex: no sorting, 74 pages, one Receive form per item for a 15-line invoice, no "/" search shortcut.
- Sam: about 40 tab stops per page (focusable row plus 3 buttons); row purpose not announced.
- Owner: deciding what to order needs this page, the Forecasting page and memory in between.

## Minor Observations
- Title mentions demand forecast; "Total SKUs" jargon and not clickable; status casing; lines ~109 chars; Category column 309px.

## Questions
- Open on "Needs attention"? One row per product? Receive a whole invoice at once? Show each product's stock ledger in its popup?
