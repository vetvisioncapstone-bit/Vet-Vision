---
target: critique src/pages/admin/Inventory.jsx
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:C:\\Users\\Jomar Ichiro\\Desktop\\VET_Vision_Main\\src\\pages\\admin\\Inventory.jsx"
target_fingerprint: "sha256:d97553861fea27e0019a3feb3a7730c8b7b6757d3b39f4b133956a66ddfa3aed"
target_path: "C:\\Users\\Jomar Ichiro\\Desktop\\VET_Vision_Main\\src\\pages\\admin\\Inventory.jsx"
timestamp: 2026-10-16T12-52-23Z
slug: src-pages-admin-inventory-jsx
---
Method: DEGRADED single-context (sub-agents only on explicit user request in this session)

## Design Health Score (run 2)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Needs action heading, per-branch status, receive preview |
| 2 | Match with the real world | 4 | "7 · reorder at 3", "Not stocked", plain title |
| 3 | User control and freedom | 3 | No undo on a wrong delivery |
| 4 | Consistency and standards | 3 | Edit form Branch dropdown ignored on save; staff page uses old rules |
| 5 | Error prevention | 3 | A delivery can still be entered twice |
| 6 | Recognition rather than recall | 4 | Count next to reorder point, both branches in one row |
| 7 | Flexibility and efficiency | 2 | One Receive form per item, no shortcuts |
| 8 | Aesthetic and minimalist design | 3 | 50 Receive buttons per page, 26 on OK branches |
| 9 | Error recovery | 3 | Plain errors, forms keep input |
| 10 | Help and documentation | 3 | Foldable guide; "reorder at" unexplained |
| Total | | 32/40 | Good (was 26/40) |

## Design Specificity
Now product-specific: branches side by side, only the problem branch marked, Needs action grouping. Missed: stock movement history in the popup. Detector: code scan clean; live overlay 6 findings (5 shared sidebar animation, 1 stat card top border = false positive); line-length finding gone.

## Priority Issues
- [P2] Receive on OK branches adds noise (50 buttons/page) and 78 tab stops. Fix: quiet text link on OK branches; product name as the popup button instead of a focusable row. /impeccable quieter
- [P2] Edit form shows a Branch dropdown the server ignores. Fix: read-only branch when editing. /impeccable harden
- [P2] Staff Inventory page still uses old status labels, order and 10 per page. Fix: reuse stockOrder rules. /impeccable polish src/pages/employee/Inventory.jsx
- [P3] "Not stocked" is a dead end. Fix: "Add to <branch>" opens New product prefilled. /impeccable onboard

## Persona Red Flags
- Alex: one Receive form per invoice line (deferred by user), no "/" shortcut.
- Sam: 78 tab stops per page; focus outline and row names are good.
- Owner: restock answered on page 1; order amount still on Forecasting.

## Minor Observations
- "Products tracked" card does nothing; "reorder at" unexplained; sidebar animation findings belong to the shared sidebar.
