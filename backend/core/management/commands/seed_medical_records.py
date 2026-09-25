from django.core.management import BaseCommand
from django.db import connection, transaction

# One medical record per clinic visit. The legacy data has no consultation records, but every visit was billed as a
# service transaction that names the pet, the date, the weight, the services and the staff remarks. Turning those
# into records fills the patient history the app shows. Nothing is invented: fields the data does not hold
# (diagnosis) stay empty.
#
# Products bought for the same pet on the same day are attached to the visit as availed items. Product purchases
# with no visit that day stay in the sales history only, because buying food is not a consultation.

SEED_SQL = """
WITH todo AS (
    SELECT t.*,
           row_number() OVER (PARTITION BY t.pet_id, t.txn_date ORDER BY t.service_txn_id) AS rn
    FROM service_transaction t
    WHERE t.pet_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM medical_record m WHERE m.source_txn_id = t.service_txn_id)
),
svc AS (
    SELECT d.service_txn_id,
           string_agg(s.service_name || CASE WHEN d.quantity > 1 THEN ' x' || d.quantity ELSE '' END,
                      ', ' ORDER BY d.service_detail_id) AS names,
           string_agg('Service: ' || s.service_name || ' — ₱' || to_char(d.line_total, 'FM999999990.00'),
                      ', ' ORDER BY d.service_detail_id) AS text,
           jsonb_agg(jsonb_build_object('type', 'Service', 'name', s.service_name, 'price', d.line_total,
                                        'quantity', d.quantity) ORDER BY d.service_detail_id) AS items,
           string_agg(d.remarks, '; ' ORDER BY d.service_detail_id) FILTER (WHERE d.remarks IS NOT NULL) AS remarks,
           (array_agg(d.staff_id ORDER BY d.service_detail_id) FILTER (WHERE d.staff_id IS NOT NULL))[1] AS staff_id,
           (array_agg(d.remarks ORDER BY d.service_detail_id)
                FILTER (WHERE d.remarks ILIKE 'follow-up%'))[1] AS follow_up_note,
           bool_or(s.category = 'SURGERY') AS surgery,
           bool_or(s.category = 'CONFINEMENT') AS confinement,
           bool_or(s.category = 'VACCINES') AS vaccine,
           bool_or(s.category IN ('CBC/BLOOD CHEM', 'TEST KITS')) AS lab,
           bool_or(s.category = 'INJECTABLES') AS injectable,
           bool_or(s.category = 'GROOMING') AS grooming
    FROM service_detail d
    JOIN service s ON s.service_id = d.service_id
    GROUP BY d.service_txn_id
),
prod AS (
    SELECT t.service_txn_id,
           string_agg('Product: ' || p.product_name || ' — ₱' || to_char(sd.line_total, 'FM999999990.00'),
                      ', ' ORDER BY sd.sale_detail_id) AS text,
           jsonb_agg(jsonb_build_object('type', 'Product', 'name', p.product_name, 'price', sd.line_total,
                                        'quantity', sd.quantity) ORDER BY sd.sale_detail_id) AS items,
           sum(sd.line_total) AS total
    FROM todo t
    JOIN sale sa ON sa.sale_date = t.txn_date
    JOIN sale_detail sd ON sd.sale_id = sa.sale_id AND sd.pet_id = t.pet_id
    JOIN product p ON p.product_id = sd.product_id
    WHERE t.rn = 1
    GROUP BY t.service_txn_id
),
base AS (
    SELECT COALESCE(max(substring(record_id FROM 4)::int), 0) AS n FROM medical_record WHERE record_id ~ '^MR-[0-9]+$'
)
INSERT INTO medical_record (
    record_id, pet_id, branch_id, staff_id, record_date, record_type, diagnosis, treatment, remarks, created_at,
    weight, services, availed_items, total_price, follow_up, follow_up_note, source_txn_id
)
SELECT 'MR-' || lpad((base.n + row_number() OVER (ORDER BY t.txn_date, t.service_txn_id))::text, 8, '0'),
       t.pet_id,
       t.branch_id,
       svc.staff_id,
       t.txn_date,
       CASE WHEN svc.surgery THEN 'Surgery'
            WHEN svc.confinement THEN 'Confinement'
            WHEN svc.vaccine THEN 'Vaccination'
            WHEN svc.lab THEN 'Laboratory'
            WHEN svc.injectable THEN 'Treatment'
            WHEN svc.grooming THEN 'Grooming'
            ELSE 'Consultation' END,
       NULL,
       svc.names,
       svc.remarks,
       (t.txn_date + COALESCE(t.txn_time, TIME '00:00'))::timestamptz,
       CASE WHEN t.weight_kg IS NULL THEN NULL
            ELSE trim(trailing '.' FROM trim(trailing '0' FROM t.weight_kg::text)) || ' kg' END,
       concat_ws(', ', svc.text, prod.text),
       COALESCE(svc.items, '[]'::jsonb) || COALESCE(prod.items, '[]'::jsonb),
       COALESCE(t.total_amount, 0) + COALESCE(prod.total, 0),
       svc.follow_up_note IS NOT NULL,
       svc.follow_up_note,
       t.service_txn_id
FROM todo t
CROSS JOIN base
JOIN svc ON svc.service_txn_id = t.service_txn_id
LEFT JOIN prod ON prod.service_txn_id = t.service_txn_id
"""

COUNT_SQL = """
SELECT count(*) FROM service_transaction t
WHERE t.pet_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM service_detail d WHERE d.service_txn_id = t.service_txn_id)
  AND NOT EXISTS (SELECT 1 FROM medical_record m WHERE m.source_txn_id = t.service_txn_id)
"""


class Command(BaseCommand):
    help = (
        "Create a medical record for every legacy service transaction that has a pet. Safe to re-run: transactions "
        "that already have a record are skipped. Back up the database first."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only report how many records would be created.")

    def handle(self, *args, dry_run, **opts):
        with connection.cursor() as cur:
            cur.execute(COUNT_SQL)
            pending = cur.fetchone()[0]
        if dry_run or not pending:
            self.stdout.write(f"{pending} service transactions have no medical record yet.")
            return
        with transaction.atomic(), connection.cursor() as cur:
            cur.execute(SEED_SQL)
            created = cur.rowcount
        # Refresh planner statistics after the bulk insert so list queries stay fast straight away.
        with connection.cursor() as cur:
            cur.execute("ANALYZE medical_record")
        self.stdout.write(self.style.SUCCESS(f"Created {created} medical records."))
