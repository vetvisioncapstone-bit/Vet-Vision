from django.db import migrations

# The stock-ledger ids came from two places: the sale triggers (the seq_inv_txn_id sequence) and the app (highest id
# + 1). When the app wrote ids past the sequence, the next sale's trigger reused one and the sale failed. The app now
# uses the sequences too (core.ids.seq_id), for ledger rows and inventory rows; this moves both sequences past
# every id already taken.
RESYNC = """
SELECT setval('seq_inv_txn_id', GREATEST(
    (SELECT COALESCE(max(substring(txn_id FROM 5)::bigint), 0) FROM inventory_transaction WHERE txn_id ~ '^ITX-[0-9]+$'),
    1));
SELECT setval('seq_inventory_id', GREATEST(
    (SELECT COALESCE(max(substring(inventory_id FROM 5)::bigint), 0) FROM inventory WHERE inventory_id ~ '^INV-[0-9]+$'),
    1));
"""


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0002_service_is_active'),
        ('sales', '0002_triggers_and_views'),
    ]

    operations = [migrations.RunSQL(RESYNC, migrations.RunSQL.noop)]
