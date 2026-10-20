import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

# Dependency order (parents before children).
TABLES = [
    "branch", "staff", "customer", "pet", "product", "service",
    "product_branch_price", "service_branch_price", "service_product_usage",
    "inventory", "inventory_transaction", "medical_record", "notification",
    "sale", "sale_detail", "service_transaction", "service_detail",
]
# Loading history must not fire the stock-deduction triggers (the dump created them after the data).
TRIGGERED = ["sale_detail", "service_detail"]

COPY_RE = re.compile(r"^COPY public\.(\w+) \(([^)]*)\) FROM stdin;\n(.*?)^\\.\n", re.S | re.M)
SETVAL_RE = re.compile(r"setval\('public\.(seq_\w+)', (\d+), (true|false)\)")


class Command(BaseCommand):
    help = "Load the historical data from a pg_dump of the original vetvisiondb schema into the Django-managed tables."

    def add_arguments(self, parser):
        parser.add_argument("dump", help="Path to vetvisiondb.sql")

    def handle(self, *args, dump, **opts):
        path = Path(dump)
        if not path.exists():
            raise CommandError(f"{path} not found")
        text = path.read_text(encoding="utf-8")
        blocks = {m.group(1): (m.group(2), m.group(3)) for m in COPY_RE.finditer(text)}
        missing = [t for t in TABLES if t not in blocks]
        if missing:
            raise CommandError(f"Dump is missing data blocks for: {', '.join(missing)}")

        with connection.cursor() as cur:
            cur.execute("SELECT count(*) FROM branch")
            if cur.fetchone()[0]:
                raise CommandError("The database already contains data (branch is not empty); refusing to load.")

        with transaction.atomic(), connection.cursor() as cur:
            for t in TRIGGERED:
                cur.execute(f"ALTER TABLE {t} DISABLE TRIGGER USER")
            for table in TABLES:
                cols, body = blocks[table]
                with cur.cursor.copy(f"COPY {table} ({cols}) FROM STDIN") as copy:
                    copy.write(body.encode("utf-8"))
                cur.execute(f"SELECT count(*) FROM {table}")
                self.stdout.write(f"{table}: {cur.fetchone()[0]} rows")
            # Validate every deferred FK now (also flushes pending trigger events).
            cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
            for t in TRIGGERED:
                cur.execute(f"ALTER TABLE {t} ENABLE TRIGGER USER")
            for seq, value, is_called in SETVAL_RE.findall(text):
                cur.execute("SELECT setval(%s, %s, %s)", [f"public.{seq}", int(value), is_called == "true"])
        self.stdout.write(self.style.SUCCESS("Legacy data loaded."))
