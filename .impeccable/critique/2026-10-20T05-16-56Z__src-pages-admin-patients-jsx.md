---
target: src/pages/admin/Patients.jsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Jomar Ichiro\\Desktop\\VET_Vision_Main\\src\\pages\\admin\\Patients.jsx"
target_fingerprint: "sha256:6aa81c4280fe649ac8367dbf749e7a39bade9784a7b8288e6cc0833bdb605aa1"
target_path: "C:\\Users\\Jomar Ichiro\\Desktop\\VET_Vision_Main\\src\\pages\\admin\\Patients.jsx"
timestamp: 2026-10-20T05-16-56Z
slug: src-pages-admin-patients-jsx
---
# Critique: src/pages/admin/Patients.jsx

Degraded run: single context, source + data only. Live view blocked (sign-in needs reCAPTCHA). Detector: 0 hits in JSX; patients.css has side-tab (L951), border accent on rounded (L914), Arial fallback (L911/956/970, print styles).

Score 26/40.
1 Visibility of status 3 | 2 Match real world 3 | 3 User control 3 | 4 Consistency 2 | 5 Error prevention 3 | 6 Recognition over recall 3 | 7 Flexibility/efficiency 2 | 8 Minimal design 2 | 9 Error recovery 3 | 10 Help 2

P1
- Dead selection: row checkboxes + select-all (L126, L601) feed no action. Remove, or add a real bulk action.
- Owner email column (L582): 1,860 of 1,861 owners have none. Swap for phone.
- History hidden while writing a consultation: past visits sit in a second modal. Vet needs last weight/findings while typing.
P2
- Status pill mostly "Active"; follow-up already has its own stat card. Show only follow-up flag.
- Stat cards not clickable (Inventory cards filter). Make "Follow-up needed" filter the table.
- ℞ text glyph as icon button (L835, L912).
- Copy: lowercase placeholder (L530), "New" (L536), title case headings (L645, L674).
P3
- patients.css side-tab stripe L951, Arial in print styles.
