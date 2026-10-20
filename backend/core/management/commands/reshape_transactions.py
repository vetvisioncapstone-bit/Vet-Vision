"""Thin the transaction history to a realistic clinic pace: 13-20 transactions per calendar day on average
(growing year by year), closed on Sundays and public holidays, half days on the eves and Black Saturday.

Only ever deletes (a day cannot get busier than it was), so every remaining record is still a real row with its
customer, pet and price. Deletes the dependent sale_detail / service_detail / seeded medical_record rows first.
Seeded, so the same run always keeps the same rows.  Use --dry-run to preview.
"""
import random
from collections import defaultdict
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from core.clinic_calendar import opening_weight

# Average transactions per CALENDAR day (closed days count as zero), per year.
YEAR_TARGET = {2021: 12, 2022: 13, 2023: 15, 2024: 17, 2025: 18.5, 2026: 19}


def keep_counts(days, have, target, rng):
    """{date: rows to keep}. Scales the open-day pace until the calendar-day average lands on `target`."""
    noise = {d: rng.uniform(0.75, 1.25) for d in days}
    scale = target * len(days) / max(1, sum(opening_weight(d) for d in days))
    for _ in range(40):
        kept = {d: min(have.get(d, 0), round(scale * opening_weight(d) * noise[d])) for d in days}
        avg = sum(kept.values()) / len(days)
        if abs(avg - target) < 0.02:
            break
        scale *= target / max(avg, 0.01)
    return kept


class Command(BaseCommand):
    help = "Thin sales and service transactions to 13-20 a day with closed days, holidays and half days."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--seed", type=int, default=2026)

    def handle(self, *args, dry_run, seed, **_):
        rng = random.Random(seed)
        with connection.cursor() as c:
            c.execute("select 'sale', sale_id, sale_date from sale union all "
                      "select 'svc', service_txn_id, txn_date from service_transaction")
            rows = c.fetchall()
        by_date = defaultdict(list)
        for kind, tid, d in rows:
            by_date[d].append((kind, tid))

        drop, report = [], []
        for year in sorted({d.year for d in by_date}):
            dates = [d for d in by_date if d.year == year]
            first, last = min(dates), max(dates)
            days = [first + timedelta(n) for n in range((last - first).days + 1)]
            have = {d: len(by_date[d]) for d in dates}
            kept = keep_counts(days, have, YEAR_TARGET.get(year, 18), rng)
            for d in dates:
                ids = sorted(by_date[d])
                rng.shuffle(ids)
                drop += ids[kept[d]:]
            vals = list(kept.values())
            report.append((year, sum(have.values()) / len(days), sum(vals) / len(days),
                           sum(1 for d in days if opening_weight(d) == 0), max(vals)))

        self.stdout.write("year  before/day  after/day  closed days  busiest day")
        for y, b, a, z, m in report:
            self.stdout.write(f"{y}  {b:10.1f}  {a:9.1f}  {z:11d}  {m:11d}")
        self.stdout.write(f"delete {len(drop)} of {len(rows)} transactions")
        if dry_run:
            return

        sales = [t for k, t in drop if k == "sale"]
        svcs = [t for k, t in drop if k == "svc"]
        with transaction.atomic(), connection.cursor() as c:
            c.execute("delete from medical_record where source_txn_id = any(%s)", [svcs])
            c.execute("delete from sale_detail where sale_id = any(%s)", [sales])
            c.execute("delete from sale where sale_id = any(%s)", [sales])
            c.execute("delete from service_detail where service_txn_id = any(%s)", [svcs])
            c.execute("delete from service_transaction where service_txn_id = any(%s)", [svcs])
        with connection.cursor() as c:
            for t in ("sale", "sale_detail", "service_transaction", "service_detail", "medical_record"):
                c.execute(f"ANALYZE {t}")
        self.stdout.write(self.style.SUCCESS("done"))
