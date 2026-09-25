"""Read-only analytics endpoints for the admin dashboard.

All figures come straight from the database (the v_* views built on the legacy schema plus inventory) on every
request, so a sale recorded a moment ago is already in them.

The current period is the month of the latest recorded date. While that month is still running it is shown as
month-to-date and compared with the same days of the previous month. Forecasts and movers only use COMPLETE months,
and skip months in which nothing was recorded at all (a gap in the data is not a month of zero demand).
Every response says which period it covers under "asOf".
"""

import calendar
import hashlib
import math
from collections import namedtuple
from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdmin, branch_by_town

from . import forecast as fc

ALL = "All Branches"


# ------------------------------- helpers -------------------------------


def rows(sql, params=()):
    with connection.cursor() as cur:
        cur.execute(sql, params)
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def num(x, places=2):
    if x is None:
        return None
    if isinstance(x, Decimal):
        x = float(x)
    return round(x, places) if isinstance(x, float) else x


def add_months(d, n):
    idx = d.year * 12 + (d.month - 1) + n
    return date(idx // 12, idx % 12 + 1, 1)


def month_key(d):
    return d.strftime("%Y-%m")


def month_range(end, count):
    """`count` first-of-month dates ending at `end`, oldest first."""
    return [add_months(end, -i) for i in range(count - 1, -1, -1)]


Window = namedtuple("Window", "latest cur complete base_end")


def data_window():
    """Where the data stands. `cur` is the first day of the latest recorded month; `complete` says whether that
    month has been fully recorded (latest date is its last day); `base_end` is the last COMPLETE month.
    Returns None when nothing has been recorded."""
    latest = rows(
        "SELECT GREATEST((SELECT max(sale_date) FROM sale), (SELECT max(txn_date) FROM service_transaction)) AS d"
    )[0]["d"]
    if latest is None:
        return None
    cur = latest.replace(day=1)
    complete = latest.day == calendar.monthrange(latest.year, latest.month)[1]
    return Window(latest, cur, complete, cur if complete else add_months(cur, -1))


def recent_months(end, count):
    """The last `count` months up to `end` in which anything was recorded, oldest first. Months with no activity
    at all are skipped, so a stretch when nobody used the system does not read as zero demand."""
    found = rows(
        "SELECT month FROM v_branch_monthly_kpi WHERE month <= %s GROUP BY month "
        "HAVING sum(sale_txns + service_txns) > 0 ORDER BY month DESC LIMIT %s",
        (end, count),
    )
    return sorted(r["month"] for r in found)


def days_in(month):
    return calendar.monthrange(month.year, month.month)[1]


def period_totals(start, end, bsql, bparams):
    """Revenue and transaction counts between two dates, straight from the line views."""
    sale = rows(
        "SELECT COALESCE(sum(line_total), 0) AS gross, COALESCE(sum(line_profit), 0) AS profit, "
        "count(DISTINCT sale_id) AS txns FROM v_sale_lines WHERE sale_date BETWEEN %s AND %s" + bsql,
        (start, end, *bparams),
    )[0]
    svc = rows(
        "SELECT COALESCE(sum(line_total), 0) AS gross, COALESCE(sum(line_profit), 0) AS profit, "
        "count(DISTINCT service_txn_id) AS txns FROM v_service_lines WHERE txn_date BETWEEN %s AND %s" + bsql,
        (start, end, *bparams),
    )[0]
    return {
        "sales": float(sale["gross"]), "services": float(svc["gross"]),
        "total": float(sale["gross"]) + float(svc["gross"]),
        "profit": float(sale["profit"]) + float(svc["profit"]),
        "saleTxns": sale["txns"], "serviceTxns": svc["txns"],
    }


def branch_filter(request):
    """(branch row or None, sql fragment, params). The UI names branches by town."""
    town = (request.query_params.get("branch") or "").strip()
    if not town or town == ALL:
        return None, "", ()
    branch = branch_by_town(town)
    return branch, " AND branch_id = %s", (branch.branch_id,)


def as_of(win, month=None):
    """`month` defaults to the current (latest) month; `partial` is true while that month is still running."""
    month = month or win.cur
    return {
        "latestDate": win.latest.isoformat(),
        "month": month_key(month),
        "partial": (month == win.cur and not win.complete),
    }


def empty():
    return Response({"asOf": {"latestDate": None, "month": None}, "empty": True})


def kpi_rows(start, end, extra="", params=()):
    return rows(
        "SELECT branch_id, branch_name, month, sale_txns, service_txns, sales_gross, service_gross, total_gross, "
        "total_profit FROM v_branch_monthly_kpi WHERE month BETWEEN %s AND %s" + extra + " ORDER BY month",
        (start, end, *params),
    )


def sum_by_month(kpi, field):
    out = {}
    for r in kpi:
        out[r["month"]] = out.get(r["month"], 0) + float(r[field] or 0)
    return out


def branch_towns():
    return {r["branch_id"]: r["town"] for r in rows("SELECT branch_id, town FROM branch")}


# ------------------------------- overview -------------------------------


class Overview(APIView):
    """Dashboard cards, 12-month trend, branch share and most availed services for the current month.
    While the month is running the cards are month-to-date and compare with the same days of the last month."""

    permission_classes = [IsAdmin]

    def get(self, request):
        win = data_window()
        if not win:
            return empty()
        _, bsql, bparams = branch_filter(request)
        cur, latest = win.cur, win.latest
        prev = add_months(cur, -1)
        prev_end = prev.replace(day=min(latest.day, days_in(prev)))  # same number of days as this month so far
        towns = branch_towns()

        now = period_totals(cur, latest, bsql, bparams)
        before = period_totals(prev, prev_end, bsql, bparams)

        kpi = kpi_rows(add_months(cur, -11), cur, bsql, bparams)
        total_by_month = sum_by_month(kpi, "total_gross")
        trend = []
        for m in month_range(cur, 12):
            per_branch = {towns.get(r["branch_id"], r["branch_name"]): num(r["total_gross"]) for r in kpi if r["month"] == m}
            trend.append({"month": month_key(m), "total": num(total_by_month.get(m, 0)), "branches": per_branch,
                          "partial": m == cur and not win.complete})

        share = [{
            "branch": towns.get(r["branch_id"], r["branch_name"]), "total": num(r["total_gross"]),
            "transactions": r["sale_txns"] + r["service_txns"],
        } for r in kpi if r["month"] == cur]

        clients = rows(
            "SELECT count(DISTINCT customer_id) AS n FROM ("
            " SELECT customer_id FROM sale WHERE sale_date BETWEEN %s AND %s" + bsql +
            " UNION SELECT customer_id FROM service_transaction WHERE txn_date BETWEEN %s AND %s" + bsql +
            ") t WHERE customer_id IS NOT NULL",
            (cur, latest, *bparams, cur, latest, *bparams),
        )[0]["n"]

        stock = rows(
            "SELECT count(*) FILTER (WHERE quantity_on_hand <= COALESCE(reorder_point, 0)) AS low, "
            "count(*) FILTER (WHERE quantity_on_hand = 0) AS out_of_stock, count(*) AS tracked "
            "FROM inventory WHERE TRUE" + bsql,
            bparams,
        )[0]

        svc = {}
        for (start, end), key in (((cur, latest), "current"), ((prev, prev_end), "previous")):
            for r in rows(
                "SELECT service_name, branch_id, count(DISTINCT service_txn_id) AS txns FROM v_service_lines "
                "WHERE txn_date BETWEEN %s AND %s" + bsql + " GROUP BY service_name, branch_id",
                (start, end, *bparams),
            ):
                svc.setdefault((r["service_name"], r["branch_id"]), {"current": 0, "previous": 0})[key] = r["txns"]
        top_services = [
            {"service": name, "branch": towns.get(bid, bid), "count": v["current"],
             "changePct": num(fc.growth_rate(v["current"], v["previous"]), 1)}
            for (name, bid), v in sorted(svc.items(), key=lambda kv: -kv[1]["current"])[:8]
        ]

        return Response({
            "asOf": as_of(win),
            "comparison": {"to": prev_end.isoformat(),
                           "label": "same days last month" if not win.complete else "previous month"},
            "kpis": {
                "totalSales": num(now["total"]),
                "previousTotalSales": num(before["total"]),
                "growthRate": num(fc.growth_rate(now["total"], before["total"]), 1),
                "clientsServed": clients,
                "lowStockItems": stock["low"],
                "outOfStockItems": stock["out_of_stock"],
                "trackedItems": stock["tracked"],
            },
            "trend": trend,
            "branchShare": share,
            "topServices": top_services,
        })


class Live(APIView):
    """Today's activity: cheap enough to poll every few seconds. `today` is the latest date with records, which is
    the real current day whenever the clinic is recording."""

    permission_classes = [IsAdmin]

    def get(self, request):
        win = data_window()
        if not win:
            return empty()
        branch, bsql, bparams = branch_filter(request)
        towns = branch_towns()
        day = win.latest
        totals = {
            town: {"sales": 0.0, "services": 0.0, "total": 0.0, "saleTxns": 0, "serviceTxns": 0}
            for bid, town in towns.items() if not branch or bid == branch.branch_id
        }
        for view, date_col, id_col, money, count in (
            ("v_sale_lines", "sale_date", "sale_id", "sales", "saleTxns"),
            ("v_service_lines", "txn_date", "service_txn_id", "services", "serviceTxns"),
        ):
            for r in rows(
                f"SELECT branch_id, sum(line_total) AS gross, count(DISTINCT {id_col}) AS txns FROM {view} "
                f"WHERE {date_col} = %s" + bsql + " GROUP BY branch_id",
                (day, *bparams),
            ):
                t = totals[towns[r["branch_id"]]]
                t[money], t[count] = float(r["gross"]), r["txns"]
                t["total"] += float(r["gross"])
        overall = {k: sum(v[k] for v in totals.values()) for k in ("sales", "services", "total", "saleTxns", "serviceTxns")}
        recent = rows(
            "SELECT kind, id, d, t, branch_id, customer, amount FROM ("
            " SELECT 'Sale' AS kind, s.sale_id AS id, s.sale_date AS d, s.sale_time AS t, s.branch_id, "
            "  COALESCE(c.customer_name, 'Walk-in') AS customer, s.total_amount AS amount "
            "  FROM sale s LEFT JOIN customer c ON c.customer_id = s.customer_id "
            " UNION ALL SELECT 'Visit', x.service_txn_id, x.txn_date, x.txn_time, x.branch_id, "
            "  COALESCE(c.customer_name, 'Walk-in'), x.total_amount "
            "  FROM service_transaction x LEFT JOIN customer c ON c.customer_id = x.customer_id"
            ") u WHERE TRUE" + bsql + " ORDER BY d DESC, t DESC NULLS LAST, id DESC LIMIT 10",
            bparams,
        )
        return Response({
            "asOf": as_of(win),
            "today": day.isoformat(),
            "isToday": day == timezone.localdate(),
            "totals": overall,
            "byBranch": totals,
            "recent": [{
                "kind": r["kind"], "id": r["id"], "date": r["d"].isoformat(),
                "time": r["t"].strftime("%H:%M") if r["t"] else None,
                "branch": towns.get(r["branch_id"], r["branch_id"]), "customer": r["customer"], "amount": num(r["amount"]),
            } for r in recent],
        })


# ------------------------------- sales analytics -------------------------------


class SalesAnalytics(APIView):
    """Branch comparison for one year plus KPIs for the latest three complete months. The running month, if
    any, is listed in the monthly chart (marked partial) but kept out of the KPIs so they compare whole months."""

    permission_classes = [IsAdmin]

    def get(self, request):
        win = data_window()
        if not win:
            return empty()
        month = win.cur  # last month shown in the chart
        _, bsql, bparams = branch_filter(request)
        towns = branch_towns()

        years = [int(r["y"]) for r in rows("SELECT DISTINCT extract(year FROM month) AS y FROM v_branch_monthly_kpi ORDER BY 1 DESC")]
        try:
            year = int(request.query_params.get("year") or month.year)
        except ValueError:
            year = month.year
        if year not in years:
            year = month.year

        # December of the previous year is fetched so January's growth rate has something to compare with.
        kpi = kpi_rows(date(year - 1, 12, 1), date(year, 12, 1), bsql, bparams)
        monthly, by_month_total = [], sum_by_month(kpi, "total_gross")
        for m in month_range(date(year, 12, 1), 12):
            if m > month:
                break
            entry = {"month": month_key(m), "branches": {}, "partial": m == win.cur and not win.complete}
            for r in kpi:
                if r["month"] == m:
                    entry["branches"][towns.get(r["branch_id"], r["branch_name"])] = {
                        "sales": num(r["sales_gross"]), "services": num(r["service_gross"]),
                        "total": num(r["total_gross"]), "profit": num(r["total_profit"]),
                        "saleTxns": r["sale_txns"], "serviceTxns": r["service_txns"],
                    }
            entry["total"] = num(by_month_total.get(m, 0))
            entry["growthRate"] = num(fc.growth_rate(by_month_total.get(m, 0), by_month_total.get(add_months(m, -1), 0)), 1)
            monthly.append(entry)

        per_branch = {}
        for r in kpi:
            if r["month"].year != year:
                continue
            b = per_branch.setdefault(towns.get(r["branch_id"], r["branch_name"]),
                                      {"sales": 0.0, "services": 0.0, "total": 0.0, "profit": 0.0, "serviceTxns": 0, "saleTxns": 0})
            b["sales"] += float(r["sales_gross"]); b["services"] += float(r["service_gross"])
            b["total"] += float(r["total_gross"]); b["profit"] += float(r["total_profit"])
            b["serviceTxns"] += r["service_txns"]; b["saleTxns"] += r["sale_txns"]
        per_branch = {k: {kk: num(vv) for kk, vv in v.items()} for k, v in per_branch.items()}

        # KPI window: the latest three complete months versus the three complete months before them.
        w_months = recent_months(win.base_end, 3)
        p_months = recent_months(add_months(w_months[0], -1), 3) if w_months else []
        if not w_months:
            return empty()
        w_start, w_end = w_months[0], w_months[-1]

        def in_months(months):
            return rows(
                "SELECT sale_txns, service_txns, total_gross FROM v_branch_monthly_kpi WHERE month = ANY(%s)" + bsql,
                (months, *bparams),
            ) if months else []

        cur, prv = in_months(w_months), in_months(p_months)
        cur_total = sum(float(r["total_gross"]) for r in cur)
        prv_total = sum(float(r["total_gross"]) for r in prv)
        days = sum(days_in(m) for m in w_months)
        txns = sum(r["sale_txns"] + r["service_txns"] for r in cur)

        cat = rows(
            "SELECT category, sum(line_total) AS revenue FROM v_service_lines WHERE month = ANY(%s)" + bsql +
            " GROUP BY category ORDER BY revenue DESC LIMIT 1",
            (w_months, *bparams),
        )

        def item_revenue(months):
            if not months:
                return []
            return rows(
                "SELECT 'Product' AS kind, product_name AS name, category, branch_id, sum(line_total) AS revenue "
                "FROM v_sale_lines WHERE month = ANY(%s)" + bsql + " GROUP BY product_name, category, branch_id "
                "UNION ALL SELECT 'Service', service_name, category, branch_id, sum(line_total) "
                "FROM v_service_lines WHERE month = ANY(%s)" + bsql + " GROUP BY service_name, category, branch_id",
                (months, *bparams, months, *bparams),
            )

        before = {(r["kind"], r["name"], r["branch_id"]): float(r["revenue"] or 0) for r in item_revenue(p_months)}
        top_items = []
        for r in sorted(item_revenue(w_months), key=lambda r: -float(r["revenue"] or 0))[:12]:
            rev = float(r["revenue"] or 0)
            top_items.append({
                "item": r["name"], "kind": r["kind"], "category": r["category"],
                "branch": towns.get(r["branch_id"], r["branch_id"]), "revenue": num(rev),
                "trendPct": num(fc.growth_rate(rev, before.get((r["kind"], r["name"], r["branch_id"]), 0)), 1),
            })

        year_start, year_end = date(year, 1, 1), date(year, 12, 31)
        ranking = rows(
            "SELECT service_name, category, count(DISTINCT service_txn_id) AS txns, sum(quantity) AS units, "
            "sum(line_total) AS revenue FROM v_service_lines WHERE txn_date BETWEEN %s AND %s" + bsql +
            " GROUP BY service_name, category HAVING count(*) > 0 ORDER BY txns DESC, service_name",
            (year_start, year_end, *bparams),
        )
        fmt = lambda r: {"service": r["service_name"], "category": r["category"], "transactions": r["txns"],
                         "revenue": num(r["revenue"])}

        return Response({
            "asOf": as_of(win),
            "year": year,
            "years": years,
            "monthly": monthly,
            "perBranch": per_branch,
            "kpis": {
                "window": {"from": month_key(w_start), "to": month_key(w_end)},
                "avgDailyTransactions": num(txns / days if days else 0),
                "topServiceCategory": cat[0]["category"] if cat else None,
                "revenue": num(cur_total),
                "previousRevenue": num(prv_total),
                "revenueGrowth": num(fc.growth_rate(cur_total, prv_total), 1),
            },
            "topItems": top_items,
            "mostAvailedServices": [fmt(r) for r in ranking[:5]],
            "leastAvailedServices": [fmt(r) for r in ranking[::-1][:5]],
        })


# ------------------------------- inventory -------------------------------


STOCK_OUT_MONTHS = 12


def stock_outs(win, bsql, bparams, towns):
    """Stock-out frequency (thesis KPI 6): how many times a product's stock level reached zero. The running balance
    is rebuilt from inventory_transaction; an instance is a day that ends at 0 after a day that did not."""
    months = recent_months(win.base_end, STOCK_OUT_MONTHS)
    if not months:
        return {"monthly": [], "total": {}, "worst": []}
    events = rows(
        "WITH bal AS (SELECT product_id, branch_id, txn_date, txn_id, "
        "  sum(quantity_change) OVER (PARTITION BY product_id, branch_id ORDER BY txn_date, txn_id) AS bal "
        "  FROM inventory_transaction WHERE txn_date <= %s), "
        "eod AS (SELECT DISTINCT ON (product_id, branch_id, txn_date) product_id, branch_id, txn_date, bal FROM bal "
        "  ORDER BY product_id, branch_id, txn_date, txn_id DESC), "
        "flag AS (SELECT *, lag(bal) OVER (PARTITION BY product_id, branch_id ORDER BY txn_date) AS prev FROM eod) "
        "SELECT f.branch_id, f.product_id, p.product_name AS name, date_trunc('month', f.txn_date)::date AS month "
        "FROM flag f JOIN product p ON p.product_id = f.product_id "
        "WHERE f.bal <= 0 AND COALESCE(f.prev, 1) > 0 AND f.txn_date >= %s" + bsql.replace("branch_id", "f.branch_id"),
        (win.latest, months[0], *bparams),
    )
    wanted = set(months)
    monthly = {m: {t: 0 for t in towns.values()} for m in months}
    per_item, total = {}, {t: 0 for t in towns.values()}
    for e in events:
        if e["month"] not in wanted:
            continue
        town = towns.get(e["branch_id"], e["branch_id"])
        monthly[e["month"]][town] = monthly[e["month"]].get(town, 0) + 1
        total[town] = total.get(town, 0) + 1
        key = (town, e["name"])
        per_item[key] = per_item.get(key, 0) + 1
    worst = sorted(({"branch": b, "name": n, "times": t} for (b, n), t in per_item.items()),
                   key=lambda r: (-r["times"], r["name"]))[:8]
    return {"months": STOCK_OUT_MONTHS,
            "monthly": [{"month": month_key(m), "branches": monthly[m]} for m in months],
            "total": total, "worst": worst}


class InventoryAnalytics(APIView):
    """Inventory movement, fast/slow-moving classification (tercile rule) and stock-out counts."""

    permission_classes = [IsAdmin]

    def get(self, request):
        win = data_window()
        if not win:
            return empty()
        _, bsql, bparams = branch_filter(request)
        towns = branch_towns()
        months = recent_months(win.base_end, fc.WINDOW)  # complete months with activity only
        if not months:
            return empty()
        start, month = months[0], months[-1]

        sold = {
            (r["branch_id"], r["product_id"]): float(r["units"] or 0)
            for r in rows(
                "SELECT branch_id, product_id, sum(quantity) AS units FROM v_sale_lines "
                "WHERE month = ANY(%s)" + bsql + " GROUP BY branch_id, product_id",
                (months, *bparams),
            )
        }
        inv = rows(
            "SELECT i.branch_id, i.product_id, p.product_name AS name, p.category, i.quantity_on_hand, i.reorder_point "
            "FROM inventory i JOIN product p ON p.product_id = i.product_id WHERE TRUE" + bsql.replace("branch_id", "i.branch_id"),
            bparams,
        )
        groups = {}
        for r in inv:
            units = sold.get((r["branch_id"], r["product_id"]), 0.0)
            groups.setdefault((r["branch_id"], r["category"]), []).append({
                "productId": r["product_id"], "name": r["name"], "category": r["category"],
                "branch": towns.get(r["branch_id"], r["branch_id"]),
                "unitsSold": num(units), "avg_units": units / len(months),
                "stock": num(r["quantity_on_hand"]), "reorderPoint": num(r["reorder_point"]),
            })
        items = []
        for group in groups.values():
            for row in fc.classify_movers(group):
                row["avgMonthlyUnits"] = num(row.pop("avg_units"))
                items.append(row)
        items.sort(key=lambda r: (-r["avgMonthlyUnits"], r["name"]))

        summary = {}
        for r in items:
            s = summary.setdefault(r["branch"], {"fast": 0, "moderate": 0, "slow": 0, "outOfStock": 0, "lowStock": 0})
            s[r["movement"]] += 1
            s["outOfStock"] += 1 if (r["stock"] or 0) == 0 else 0
            s["lowStock"] += 1 if (r["stock"] or 0) <= (r["reorderPoint"] or 0) else 0

        return Response({
            "asOf": as_of(win),
            "window": {"from": month_key(start), "to": month_key(month), "months": len(months)},
            "summary": summary,
            "stockOuts": stock_outs(win, bsql, bparams, towns),
            "items": items,
        })


# ------------------------------- forecasting -------------------------------

HISTORY_MONTHS = 18  # 6 to forecast from + 12 back-tested months


def _series(by_month, months):
    return [float(by_month.get(m, 0)) for m in months]


def _demand_rows(sql_source, id_col, months, bsql, bparams):
    data = {}
    for r in rows(
        f"SELECT {id_col} AS id, month, sum(quantity) AS units FROM {sql_source} "
        "WHERE month BETWEEN %s AND %s" + bsql + f" GROUP BY {id_col}, month",
        (months[0], months[-1], *bparams),
    ):
        data.setdefault(r["id"], {})[r["month"]] = float(r["units"] or 0)
    return data


class Forecast(APIView):
    """Moving Average forecasts (previous six months -> next month) with MAE / MAPE from back-testing."""

    permission_classes = [IsAdmin]

    def get(self, request):
        """The maths takes about a second, so the answer is kept for a few minutes and dropped as soon as a sale,
        visit or stock change makes it stale (the stamp below changes with the data)."""
        stamp = rows(
            "SELECT (SELECT max(sale_date) FROM sale) AS a, (SELECT count(*) FROM sale) AS b, "
            "(SELECT max(txn_date) FROM service_transaction) AS c, (SELECT count(*) FROM service_transaction) AS d, "
            "(SELECT sum(quantity_on_hand) FROM inventory) AS e"
        )[0]
        raw = f"{request.query_params.get('branch', '')}|{'|'.join(str(v) for v in stamp.values())}"
        key = "forecast:" + hashlib.md5(raw.encode()).hexdigest()  # cache keys must not contain spaces
        body = cache.get(key)
        if body is None:
            response = self.compute(request)
            if response.status_code == 200:
                cache.set(key, response.data, 300)
            return response
        return Response(body)

    def compute(self, request):
        win = data_window()
        if not win:
            return empty()
        _, bsql, bparams = branch_filter(request)
        months = recent_months(win.base_end, HISTORY_MONTHS)  # complete months with activity, gaps skipped
        if not months:
            return empty()
        month = months[-1]
        # Forecast the month that is running now, or the next one when the latest month is already complete.
        next_month = add_months(win.cur, 1) if win.complete else win.cur
        recent = months[-fc.WINDOW:]  # fewer than six when the data is younger than that

        pooled = {}  # group -> [total absolute error, total actual] over every item-month back-tested

        def build(meta, demand, group, stock=None):
            out = []
            for pid, info in meta.items():
                series = _series(demand.get(pid, {}), months)
                if not any(series) and not (stock or {}).get(pid):
                    continue
                predicted = fc.moving_average(series)
                acc = pooled.setdefault(group, [0.0, 0.0])
                pairs = fc.backtest(series)
                for f, a in pairs:
                    acc[0] += abs(f - a)
                    acc[1] += a
                s = None if stock is None else float(stock.get(pid, 0))
                need = None if s is None else max(0, math.ceil(predicted - s))
                out.append({
                    "id": pid, "name": info["name"], "category": info["category"],
                    "recent": [{"month": month_key(m), "units": num(v)} for m, v in zip(recent, series[-fc.WINDOW:])],
                    "avgPerMonth": num(sum(series[-fc.WINDOW:]) / len(series[-fc.WINDOW:])),
                    "forecast": num(predicted),
                    "stock": None if s is None else num(s),
                    "toOrder": need,
                    "stockAfterOrder": None if s is None else num(s + need),
                    "accuracy": fc.accuracy(series, pairs=pairs),
                    "avg_units": sum(series[-fc.WINDOW:]) / len(series[-fc.WINDOW:]),
                })
            return out

        def with_movement(items):
            groups = {}
            for it in items:
                groups.setdefault(it["category"], []).append(it)
            for g in groups.values():
                fc.classify_movers(g)
            for it in items:
                it.pop("avg_units", None)
            return sorted(items, key=lambda r: r["name"])

        products_meta = {r["product_id"]: {"name": r["product_name"], "category": r["category"]}
                         for r in rows("SELECT product_id, product_name, category FROM product")}
        stock = {r["product_id"]: r["qty"] for r in rows(
            "SELECT product_id, sum(quantity_on_hand) AS qty FROM inventory WHERE TRUE" + bsql + " GROUP BY product_id", bparams)}
        products = with_movement(build(products_meta, _demand_rows("v_sale_lines", "product_id", months, bsql, bparams), "products", stock))

        services_meta = {r["service_id"]: {"name": r["service_name"], "category": r["category"]}
                         for r in rows("SELECT service_id, service_name, category FROM service")}
        services = with_movement(build(services_meta, _demand_rows("v_service_lines", "service_id", months, bsql, bparams), "services"))

        kpi = kpi_rows(months[0], month, bsql, bparams)
        kpi = [r for r in kpi if r["month"] in set(months)]
        so_far = period_totals(win.cur, win.latest, bsql, bparams) if not win.complete else None
        so_far_field = {"total_gross": "total", "sales_gross": "sales", "service_gross": "services",
                        "service_txns": "serviceTxns"}

        def summary(field, label):
            by_month = sum_by_month(kpi, field)
            series = _series(by_month, months)
            predicted = fc.moving_average(series)
            out = {
                "label": label,
                "history": [{"month": month_key(m), "actual": num(v)} for m, v in zip(months[-12:], series[-12:])],
                "forecast": num(predicted), "forecastMonth": month_key(next_month),
                "accuracy": fc.accuracy(series),
            }
            if so_far is not None:  # the forecast month is running: how far along is it?
                out["inProgress"] = {
                    "soFar": num(so_far[so_far_field[field]]),
                    "dayOfMonth": win.latest.day,
                    "daysInMonth": days_in(win.cur),
                }
            return out

        # Service demand counts transactions (a visit), the natural unit for staffing and scheduling.
        for r in kpi:
            r["all_txns"] = r["sale_txns"] + r["service_txns"]
        overall = {
            "revenue": summary("total_gross", "Total revenue (PHP)"),
            "salesRevenue": summary("sales_gross", "Product sales (PHP)"),
            "serviceRevenue": summary("service_gross", "Service revenue (PHP)"),
            "serviceDemand": summary("service_txns", "Service transactions"),
        }

        def mean_of(items, key):
            vals = [i["accuracy"][key] for i in items if i["accuracy"][key] is not None]
            return num(sum(vals) / len(vals)) if vals else None

        def pooled_wape(group):
            err, actual = pooled.get(group, (0, 0))
            return num(err / actual * 100) if actual else None

        return Response({
            "asOf": as_of(win),
            "method": {"name": "Moving Average", "windowMonths": fc.WINDOW, "backtestMonths": fc.BACKTEST_MONTHS,
                       "forecastMonth": month_key(next_month),
                       "basedOn": {"from": month_key(months[0]), "to": month_key(months[-1]), "months": len(months)}},
            "overall": overall,
            "products": products,
            "services": services,
            "accuracy": {
                "products": {"mae": mean_of(products, "mae"), "mape": mean_of(products, "mape"),
                             "wape": pooled_wape("products"), "count": len(products)},
                "services": {"mae": mean_of(services, "mae"), "mape": mean_of(services, "mape"),
                             "wape": pooled_wape("services"), "count": len(services)},
            },
        })


# ------------------------------- reports -------------------------------


class ReportData(APIView):
    """One month of figures for the printable Sales / Inventory / Patient reports."""

    permission_classes = [IsAdmin]

    def get(self, request):
        win = data_window()
        if not win:
            return empty()
        try:
            month = date(int(request.query_params["year"]), int(request.query_params["month"]), 1)
        except (KeyError, ValueError):
            month = win.cur
        _, bsql, bparams = branch_filter(request)
        towns = branch_towns()
        end = add_months(month, 1) - timedelta(days=1)

        kpi = kpi_rows(month, month, bsql, bparams)
        branches = [{
            "branch": towns.get(r["branch_id"], r["branch_name"]), "saleTxns": r["sale_txns"], "serviceTxns": r["service_txns"],
            "sales": num(r["sales_gross"]), "services": num(r["service_gross"]), "total": num(r["total_gross"]),
            "profit": num(r["total_profit"]),
        } for r in kpi]

        top_products = rows(
            "SELECT product_name AS name, category, sum(quantity) AS units, sum(line_total) AS revenue FROM v_sale_lines "
            "WHERE month = %s" + bsql + " GROUP BY product_name, category ORDER BY revenue DESC LIMIT 15", (month, *bparams))
        top_services = rows(
            "SELECT service_name AS name, category, count(DISTINCT service_txn_id) AS visits, sum(line_total) AS revenue "
            "FROM v_service_lines WHERE month = %s" + bsql + " GROUP BY service_name, category ORDER BY visits DESC LIMIT 15",
            (month, *bparams))
        inv = rows(
            "SELECT p.product_name AS name, p.category, b.town AS branch, i.quantity_on_hand AS stock, i.reorder_point "
            "FROM inventory i JOIN product p ON p.product_id = i.product_id JOIN branch b ON b.branch_id = i.branch_id "
            "WHERE i.quantity_on_hand <= COALESCE(i.reorder_point, 0)" + bsql.replace("branch_id", "i.branch_id") +
            " ORDER BY p.product_name LIMIT 200", bparams)
        patients = rows(
            "SELECT species, count(DISTINCT pet_id) AS pets, count(DISTINCT service_txn_id) AS visits FROM v_service_lines "
            "WHERE month = %s" + bsql + " GROUP BY species ORDER BY visits DESC", (month, *bparams))
        new_pets = rows(
            "SELECT count(*) AS n FROM pet p JOIN customer c ON c.customer_id = p.customer_id "
            "WHERE p.created_at::date BETWEEN %s AND %s" + bsql.replace("branch_id", "c.branch_id"), (month, end, *bparams))[0]["n"]

        return Response({
            "asOf": as_of(win),
            "period": {"month": month_key(month), "label": month.strftime("%B %Y"),
                       "partial": month == win.cur and not win.complete},
            "sales": {"branches": branches,
                      "topProducts": [{**r, "units": num(r["units"]), "revenue": num(r["revenue"])} for r in top_products]},
            "services": [{**r, "revenue": num(r["revenue"])} for r in top_services],
            "inventory": [{**r, "stock": num(r["stock"]), "reorder_point": num(r["reorder_point"])} for r in inv],
            "patients": {"bySpecies": [{"species": r["species"] or "Unknown", "pets": r["pets"], "visits": r["visits"]} for r in patients],
                         "newPets": new_pets},
        })
