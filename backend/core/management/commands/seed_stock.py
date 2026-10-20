"""Give every branch/product realistic stock and an inventory movement history.

The imported clinic data has every quantity at 0 and an empty inventory_transaction table, so low-stock alerts,
"you need to order" advice and the stock-out KPI (thesis KPI 6) had nothing to work on. This replays the real sale
history per product and branch:

  * an opening count when the branch opened, enough for about a month of that product's demand;
  * every sale line becomes a 'sale' movement (what the stock trigger would have written);
  * when stock falls to the reorder point a restock order arrives 3-8 days later ('restock');
  * demand that outruns stock empties the shelf: the shortfall is covered by an emergency 'adjustment', so the
    balance hits exactly 0 - that is a stock-out.

Then it sets inventory.quantity_on_hand / reorder_point / reorder_qty from the replay. Seeded and repeatable.
Refuses to run when inventory_transaction already has rows, so it can never overwrite real movements.
--dry-run previews.
"""
import math
import random
from collections import defaultdict
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

LEAD_DAYS = (3, 8)          # supplier lead time
COVER_DAYS_REORDER = 10     # reorder point = this many days of average demand
COVER_DAYS_ORDER = 30       # each restock covers this many days
COVER_DAYS_OPENING = 30


def replay(lines, opening_date, end, rng):
    """lines: [(date, qty, ref)] sorted by date. Returns (movements, final_stock, reorder_point, reorder_qty, last_delivery)."""
    total = sum(q for _, q, _ in lines)
    days = max(1, (end - opening_date).days)
    daily = total / days
    reorder_point = max(3, math.ceil(daily * COVER_DAYS_REORDER))
    reorder_qty = max(6, math.ceil(daily * COVER_DAYS_ORDER))
    stock = reorder_point + max(6, math.ceil(daily * COVER_DAYS_OPENING))
    moves = [(opening_date, "opening", stock, None, "Opening count")]
    pending = None  # (arrival date, qty)
    last_delivery = opening_date

    def deliver(upto):
        nonlocal stock, pending, last_delivery
        if pending and pending[0] <= upto:
            moves.append((pending[0], "restock", pending[1], None, "Supplier delivery"))
            stock += pending[1]
            last_delivery = pending[0]
            pending = None

    for d, qty, ref in lines:
        deliver(d)
        short = max(0, qty - stock)
        if short:  # bought in first, so the balance never dips below zero
            moves.append((d, "adjustment", short, ref, "Emergency purchase to cover the shortfall"))
        moves.append((d, "sale", -qty, ref, "Sold"))
        stock = max(0, stock - qty)
        if stock <= reorder_point and pending is None:
            pending = (d + timedelta(days=rng.randint(*LEAD_DAYS)), reorder_qty)
    deliver(end)
    return moves, stock, reorder_point, reorder_qty, last_delivery


class Command(BaseCommand):
    help = "Seed realistic stock levels and inventory movements from the sale history."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--seed", type=int, default=2026)

    def handle(self, *args, dry_run, seed, **_):
        rng = random.Random(seed)
        with connection.cursor() as c:
            c.execute("SELECT count(*) FROM inventory_transaction")
            if c.fetchone()[0]:
                raise CommandError("inventory_transaction already has rows; refusing to overwrite real movements.")
            c.execute("SELECT branch_id, date_opened FROM branch")
            opened = dict(c.fetchall())
            c.execute("SELECT max(sale_date) FROM sale")
            end = c.fetchone()[0] or date.today()
            c.execute(
                "SELECT s.branch_id, d.product_id, s.sale_date, d.quantity, d.sale_id FROM sale_detail d "
                "JOIN sale s ON s.sale_id = d.sale_id ORDER BY s.branch_id, d.product_id, s.sale_date, d.sale_id"
            )
            sold = defaultdict(list)
            for branch, product, day, qty, ref in c.fetchall():
                sold[(branch, product)].append((day, float(qty), ref))
            c.execute("SELECT inventory_id, branch_id, product_id FROM inventory ORDER BY inventory_id")
            inventory = c.fetchall()

        txns, updates, stockouts = [], [], 0
        for inv_id, branch, product in inventory:
            lines = sold.get((branch, product), [])
            first = min(opened[branch], lines[0][0]) if lines else opened[branch]
            if lines:
                moves, stock, rp, rq, delivered = replay(lines, first, end, rng)
            else:  # never sold: a small shelf of stock that just sits there
                stock = rng.randint(4, 20)
                rp, rq, delivered = 3, 6, first
                moves = [(first, "opening", stock, None, "Opening count")]
            stockouts += sum(1 for m in moves if m[1] == "adjustment")
            txns += [(product, branch, *m) for m in moves]
            updates.append((stock, rp, rq, end, delivered, inv_id))

        self.stdout.write(f"{len(inventory)} stock rows, {len(txns)} movements, {stockouts} stock-out events, "
                          f"{sum(1 for u in updates if u[0] == 0)} rows at zero now")
        if dry_run:
            return

        txns.sort(key=lambda t: (t[2], t[3] != "opening"))  # by date, opening counts first
        with transaction.atomic(), connection.cursor() as c:
            c.executemany(
                "INSERT INTO inventory_transaction (txn_id, product_id, branch_id, txn_date, txn_type, quantity_change, "
                "reference_id, remarks) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                [(f"ITX-{i:08d}", p, b, d, kind, qty, ref, note) for i, (p, b, d, kind, qty, ref, note) in enumerate(txns, 1)],
            )
            c.execute("SELECT setval('seq_inv_txn_id', %s)", [len(txns)])
            c.executemany(
                "UPDATE inventory SET quantity_on_hand = %s, reorder_point = %s, reorder_qty = %s, last_counted = %s, "
                "delivery_date = %s WHERE inventory_id = %s",
                updates,
            )
            c.execute("ANALYZE inventory_transaction")
            c.execute("ANALYZE inventory")
        self.stdout.write(self.style.SUCCESS("done"))
