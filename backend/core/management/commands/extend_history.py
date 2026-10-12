"""Extend the transaction history by whole months, for demos when the real records stop (the imported clinic data
ends 2026-07-31).

    python manage.py extend_history --from 2026-08 --to 2026-09 [--dry-run]

Each new day is filled with transactions resampled from the same weekday one year earlier (same customers, pets,
products, services, staff and times of day), at the 2026 pace of about 19 transactions per calendar day, following
the clinic calendar (closed Sundays and holidays, half days on eves). Prices are today's branch prices. Product
sales go through the stock trigger like real ones; restocks arrive 3-8 days after a product reaches its reorder
point, and a sale larger than the shelf is covered by an emergency 'adjustment' first (a stock-out), as seed_stock
does. Medical records for the new visits come from seed_medical_records afterwards.

Seeded and repeatable. Refuses a month that already has more than a handful of transactions. Back up first.
"""
import random
from collections import defaultdict
from datetime import date, timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from core.clinic_calendar import opening_weight

PER_DAY = 19          # average transactions per calendar day in 2026 (closed days count as zero)
LEAD_DAYS = (3, 8)    # supplier lead time
SALE_COLS = "branch_id, staff_id, customer_id, sale_time, payment_method, payment_status, created_by"
SVC_COLS = "branch_id, customer_id, pet_id, txn_time, weight_kg, payment_method, payment_status, created_by"


def month(text):
    y, m = map(int, text.split("-"))
    return date(y, m, 1)


def rows(sql, params=()):
    with connection.cursor() as c:
        c.execute(sql, params)
        cols = [d[0] for d in c.description]
        return [dict(zip(cols, r)) for r in c.fetchall()]


def next_number(table, column, prefix):
    """Next free number after `prefix` (e.g. SL-I-), from the existing ids."""
    r = rows(f"SELECT max(substring({column} FROM %s)::int) AS n FROM {table} WHERE {column} LIKE %s",
             (f"^{prefix}([0-9]+)$", prefix + "%"))
    return (r[0]["n"] or 0) + 1


class Command(BaseCommand):
    help = "Add months of transactions resampled from the same weeks a year earlier."

    def add_arguments(self, parser):
        parser.add_argument("--from", dest="start", required=True, help="First month, YYYY-MM.")
        parser.add_argument("--to", dest="end", required=True, help="Last month, YYYY-MM.")
        parser.add_argument("--seed", type=int, default=2026)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, start, end, seed, dry_run, **_):
        rng = random.Random(seed)
        first = month(start)
        nxt = month(end).replace(day=28) + timedelta(days=4)
        last = nxt - timedelta(days=nxt.day)
        days = [first + timedelta(n) for n in range((last - first).days + 1)]
        busy = rows("SELECT count(*) AS n FROM (SELECT sale_id FROM sale WHERE sale_date BETWEEN %s AND %s UNION ALL "
                    "SELECT service_txn_id FROM service_transaction WHERE txn_date BETWEEN %s AND %s) x",
                    (first, last, first, last))[0]["n"]
        if busy > 5:  # a few hand-entered test rows are fine; a filled month is not
            raise CommandError(f"{busy} transactions already fall in {start}..{end}; refusing to add more.")

        # The pool: last year's transactions in the same window, by weekday.
        src_from, src_to = first.replace(year=first.year - 1), last.replace(year=last.year - 1)
        pool = defaultdict(list)
        for r in rows(f"SELECT 'sale' AS kind, sale_id AS id, sale_date AS d FROM sale WHERE sale_date BETWEEN %s AND %s "
                      f"UNION ALL SELECT 'svc', service_txn_id, txn_date FROM service_transaction "
                      f"WHERE txn_date BETWEEN %s AND %s", (src_from, src_to, src_from, src_to)):
            pool[r["d"].weekday()].append((r["kind"], r["id"]))
        if not pool:
            raise CommandError(f"No transactions between {src_from} and {src_to} to resample.")

        scale = PER_DAY * len(days) / sum(opening_weight(d) for d in days)
        plan = {d: rng.sample(pool[d.weekday()], min(len(pool[d.weekday()]),
                                                     round(scale * opening_weight(d) * rng.uniform(0.8, 1.2))))
                for d in days}
        picked = [t for ts in plan.values() for t in ts]
        sale_ids = [i for k, i in picked if k == "sale"]
        svc_ids = [i for k, i in picked if k == "svc"]
        self.stdout.write(f"{len(days)} days, {sum(1 for d in days if not opening_weight(d))} closed, "
                          f"{len(sale_ids)} sales + {len(svc_ids)} service visits "
                          f"({len(picked) / len(days):.1f} a day), resampled from {src_from}..{src_to}")
        if dry_run:
            return

        heads = {r["sale_id"]: r for r in rows(f"SELECT sale_id, {SALE_COLS} FROM sale WHERE sale_id = ANY(%s)", [sale_ids])}
        heads |= {r["service_txn_id"]: r for r in rows(
            f"SELECT service_txn_id, {SVC_COLS} FROM service_transaction WHERE service_txn_id = ANY(%s)", [svc_ids])}
        sale_lines = defaultdict(list)
        for r in rows("SELECT sale_id, product_id, pet_id, quantity, unit_price, unit_capital FROM sale_detail "
                      "WHERE sale_id = ANY(%s) ORDER BY sale_detail_id", [sale_ids]):
            sale_lines[r["sale_id"]].append(r)
        svc_lines = defaultdict(list)
        for r in rows("SELECT service_txn_id, service_id, staff_id, quantity, unit_price, unit_capital, remarks "
                      "FROM service_detail WHERE service_txn_id = ANY(%s) ORDER BY service_detail_id", [svc_ids]):
            svc_lines[r["service_txn_id"]].append(r)
        price = {(r["product_id"], r["branch_id"]): (r["unit_price"], r["unit_capital"])
                 for r in rows("SELECT product_id, branch_id, unit_price, unit_capital FROM product_branch_price")}
        price |= {(r["service_id"], r["branch_id"]): (r["unit_price"], r["unit_capital"])
                  for r in rows("SELECT service_id, branch_id, unit_price, unit_capital FROM service_branch_price")}
        stock = {(r["product_id"], r["branch_id"]): r for r in rows(
            "SELECT product_id, branch_id, quantity_on_hand AS qty, reorder_point AS rp, reorder_qty AS rq "
            "FROM inventory")}

        letter = {b: rows("SELECT town FROM branch WHERE branch_id = %s", [b])[0]["town"][0]
                  for b in {h["branch_id"] for h in heads.values()}}
        counters = {}

        def new_id(table, column, prefix, width):
            if prefix not in counters:
                counters[prefix] = next_number(table, column, prefix)
            counters[prefix] += 1
            return f"{prefix}{counters[prefix] - 1:0{width}d}"

        def line(src, key, branch):
            unit, capital = price.get((key, branch), (src["unit_price"], src["unit_capital"]))
            qty = src["quantity"]
            return unit, capital, qty * unit, qty * capital, qty * (unit - capital)

        moves, pending, made = [], {}, {"sale": 0, "svc": 0}
        with transaction.atomic(), connection.cursor() as c:
            c.execute("SELECT last_value FROM seq_inv_txn_id")
            itx_before = c.fetchone()[0]
            for d in days:
                for key, (arrive, qty) in list(pending.items()):  # deliveries due today
                    if arrive <= d:
                        moves.append((key, d, "restock", qty, None, "Supplier delivery"))
                        stock[key]["qty"] += qty
                        del pending[key]
                for kind, src_id in sorted(plan[d], key=lambda t: str(heads[t[1]].get("sale_time") or heads[t[1]].get("txn_time"))):
                    h, branch = heads[src_id], heads[src_id]["branch_id"]
                    if kind == "sale":
                        sid = new_id("sale", "sale_id", f"SL-{letter[branch]}-", 6)
                        lines = [(src, *line(src, src["product_id"], branch)) for src in sale_lines[src_id]]
                        c.execute(f"INSERT INTO sale (sale_id, sale_date, total_amount, {SALE_COLS}) "
                                  f"VALUES (%s, %s, %s, {', '.join(['%s'] * 7)})",
                                  [sid, d, sum(x[3] for x in lines), *(h[k] for k in SALE_COLS.split(", "))])
                        for src, unit, capital, total, cap_total, profit in lines:
                            key = (src["product_id"], branch)
                            s = stock.get(key)
                            if s is not None:
                                if s["qty"] < src["quantity"]:  # empty shelf: emergency purchase first
                                    short = src["quantity"] - s["qty"]
                                    moves.append((key, d, "adjustment", short, sid, "Emergency purchase to cover the shortfall"))
                                    s["qty"] += short
                                s["qty"] -= src["quantity"]
                                if s["qty"] <= (s["rp"] or 0) and key not in pending:
                                    pending[key] = (d + timedelta(days=rng.randint(*LEAD_DAYS)), s["rq"] or 6)
                            c.execute("INSERT INTO sale_detail (sale_detail_id, sale_id, product_id, pet_id, quantity, "
                                      "unit_price, unit_capital, line_total, line_capital, line_profit) "
                                      "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                                      [new_id("sale_detail", "sale_detail_id", "SD-", 7), sid, src["product_id"],
                                       src["pet_id"], src["quantity"], unit, capital, total, cap_total, profit])
                    else:
                        vid = new_id("service_transaction", "service_txn_id", f"SV-{letter[branch]}-", 6)
                        lines = [(src, *line(src, src["service_id"], branch)) for src in svc_lines[src_id]]
                        c.execute(f"INSERT INTO service_transaction (service_txn_id, txn_date, total_amount, {SVC_COLS}) "
                                  f"VALUES (%s, %s, %s, {', '.join(['%s'] * 8)})",
                                  [vid, d, sum(x[3] for x in lines), *(h[k] for k in SVC_COLS.split(", "))])
                        for src, unit, capital, total, cap_total, profit in lines:
                            c.execute("INSERT INTO service_detail (service_detail_id, service_txn_id, service_id, "
                                      "staff_id, quantity, unit_price, unit_capital, line_total, line_capital, "
                                      "line_profit, remarks) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                                      [new_id("service_detail", "service_detail_id", "VD-", 7), vid, src["service_id"],
                                       src["staff_id"], src["quantity"], unit, capital, total, cap_total, profit,
                                       src["remarks"]])
                    made[kind] += 1

            # The stock trigger stamps its movements with today's date; give them the sale's date instead.
            c.execute("UPDATE inventory_transaction t SET txn_date = s.sale_date FROM sale s "
                      "WHERE t.reference_id = s.sale_id AND t.txn_id > %s", [f"ITX-{itx_before:08d}"])
            for (product, branch), d, kind, qty, ref, note in moves:
                c.execute("INSERT INTO inventory_transaction (txn_id, product_id, branch_id, txn_date, txn_type, "
                          "quantity_change, reference_id, remarks) VALUES "
                          "('ITX-' || lpad(nextval('seq_inv_txn_id')::text, 8, '0'), %s, %s, %s, %s, %s, %s, %s)",
                          [product, branch, d, kind, qty, ref, note])
                c.execute("UPDATE inventory SET quantity_on_hand = quantity_on_hand + %s"
                          + (", delivery_date = %s" if kind == "restock" else "") + " WHERE product_id = %s AND branch_id = %s",
                          [qty, *([d] if kind == "restock" else []), product, branch])
            c.execute("UPDATE inventory SET last_counted = %s", [last])

        restocks = sum(1 for m in moves if m[2] == "restock")
        self.stdout.write(f"added {made['sale']} sales and {made['svc']} service visits; "
                          f"{restocks} deliveries, {len(moves) - restocks} stock-outs")
        call_command("seed_medical_records", stdout=self.stdout)
        with connection.cursor() as c:
            for t in ("sale", "sale_detail", "service_transaction", "service_detail", "inventory_transaction",
                      "inventory", "medical_record"):
                c.execute(f"ANALYZE {t}")
        self.stdout.write(self.style.SUCCESS("done"))
