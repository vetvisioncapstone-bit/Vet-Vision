"""Analytics accuracy tests. Expected values are worked out by hand, not read back from the code under test."""

from datetime import date, time

import pytest

from analytics import forecast as fc
from inventory.models import Inventory, Product, ProductBranchPrice
from sales.models import Sale, SaleDetail

from .conftest import client_for

# ------------------------------- pure maths -------------------------------


def test_moving_average_uses_last_six_months_only():
    assert fc.moving_average([1, 2, 3, 4, 5, 6, 7, 8]) == pytest.approx(5.5)  # mean(3..8)
    assert fc.moving_average([4, 6]) == 5  # fewer than six months: use what exists
    assert fc.moving_average([]) is None


def test_backtest_mae_and_mape():
    pairs = fc.backtest([10, 20, 30, 40, 50], window=3)
    assert pairs == [(20, 40), (30, 50)]
    assert fc.mae(pairs) == 20
    assert fc.mape(pairs) == pytest.approx(45.0)  # (20/40 + 20/50) / 2


def test_mape_skips_months_with_zero_actual():
    assert fc.mape([(5, 0), (10, 20)]) == pytest.approx(50.0)
    assert fc.mape([(5, 0)]) is None
    assert fc.mae([]) is None


def test_backtest_needs_a_full_window():
    assert fc.backtest([1, 2, 3], window=6) == []


def test_growth_rate():
    assert fc.growth_rate(110, 100) == pytest.approx(10.0)
    assert fc.growth_rate(50, 100) == pytest.approx(-50.0)
    assert fc.growth_rate(10, 0) is None


def _rows(n):
    return [{"name": f"P{i}", "avg_units": float(100 - i)} for i in range(n)]


def test_tercile_classification():
    six = {r["name"]: r["movement"] for r in fc.classify_movers(_rows(6))}
    assert [six[f"P{i}"] for i in range(6)] == ["fast", "fast", "moderate", "moderate", "slow", "slow"]
    three = fc.classify_movers(_rows(3))
    assert [r["movement"] for r in three] == ["fast", "moderate", "slow"]
    assert [r["movement"] for r in fc.classify_movers(_rows(2))] == ["moderate", "moderate"]


# ------------------------------- endpoints -------------------------------

PRICE, CAPITAL = 250, 180
QTY_BY_MONTH = {1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70, 8: 80}  # Jan..Aug 2026, Ibaan


def add_sale(branch, n, day, qty, product):
    s = Sale.objects.create(sale_id=f"SL-I-{n:06d}", branch=branch, sale_date=day, payment_status="Paid",
                            total_amount=qty * PRICE)
    SaleDetail.objects.create(sale_detail_id=f"SD-{n:07d}", sale=s, product=product, quantity=qty,
                              unit_price=PRICE, unit_capital=CAPITAL, line_total=qty * PRICE,
                              line_capital=qty * CAPITAL, line_profit=qty * (PRICE - CAPITAL))


@pytest.fixture
def history(branches, stocked):
    """Eight full months of one product's sales at Ibaan; the data ends on 31 Aug 2026."""
    product = stocked[0].product
    stocked[0].quantity_on_hand = 100000
    stocked[0].save()
    for month, qty in QTY_BY_MONTH.items():
        add_sale(branches[0], month, date(2026, month, 15), qty, product)
    add_sale(branches[0], 99, date(2026, 8, 31), 1, product)  # last day: August is complete
    return product


def get(admin, path):
    return client_for(admin).get(f"/api/analytics/{path}")


def test_only_admin_can_read_analytics(admin, staff_ibaan, history):
    for path in ("overview/", "live/", "sales/", "inventory/", "forecast/", "report/"):
        assert get(admin, path).status_code == 200, path
        assert get(staff_ibaan, path).status_code == 403, path
    assert client_for(admin).__class__ and __import__("rest_framework.test", fromlist=["APIClient"]).APIClient().get(
        "/api/analytics/overview/").status_code == 401


def test_overview_totals_growth_and_branch_filter(admin, history):
    r = get(admin, "overview/").data
    aug = 81 * PRICE  # 80 + the 1-unit sale on 31 Aug
    jul = 70 * PRICE
    assert r["asOf"]["month"] == "2026-08"
    assert r["kpis"]["totalSales"] == aug and r["kpis"]["previousTotalSales"] == jul
    assert r["kpis"]["growthRate"] == round((aug - jul) / jul * 100, 1)
    assert [b["branch"] for b in r["branchShare"]] == ["Ibaan"] and r["branchShare"][0]["total"] == aug
    assert len(r["trend"]) == 12 and r["trend"][-1]["total"] == aug and r["trend"][-2]["total"] == jul
    other = get(admin, "overview/?branch=San Jose").data
    assert other["kpis"]["totalSales"] == 0
    assert get(admin, "overview/?branch=Atlantis").status_code == 400


def test_running_month_is_month_to_date_against_the_same_days_last_month(admin, history, branches):
    add_sale(branches[0], 100, date(2026, 9, 20), 5, history)  # September is running: latest record is the 20th
    r = get(admin, "overview/").data
    assert r["asOf"]["month"] == "2026-09" and r["asOf"]["partial"] is True and r["asOf"]["latestDate"] == "2026-09-20"
    assert r["kpis"]["totalSales"] == 5 * PRICE  # September so far
    # Same days last month = 1-20 Aug: only the sale on the 15th (80 units). The 31 Aug sale is outside the range.
    assert r["kpis"]["previousTotalSales"] == 80 * PRICE
    assert r["kpis"]["growthRate"] == round((5 * PRICE - 80 * PRICE) / (80 * PRICE) * 100, 1)
    assert r["comparison"]["label"] == "same days last month" and r["comparison"]["to"] == "2026-08-20"
    assert r["trend"][-1]["month"] == "2026-09" and r["trend"][-1]["partial"] is True
    assert r["trend"][-2]["partial"] is False and r["trend"][-2]["total"] == 81 * PRICE
    assert r["branchShare"][0]["total"] == 5 * PRICE


def test_a_finished_month_is_compared_with_the_whole_previous_month(admin, history):
    r = get(admin, "overview/").data
    assert r["asOf"]["partial"] is False and r["comparison"]["label"] == "previous month"


def test_new_sale_shows_up_on_the_next_request(admin, history, branches):
    before = get(admin, "overview/").data["kpis"]["totalSales"]
    add_sale(branches[0], 101, date(2026, 9, 1), 4, history)
    after = get(admin, "overview/").data
    assert before == 81 * PRICE and after["kpis"]["totalSales"] == 4 * PRICE and after["asOf"]["month"] == "2026-09"


def test_forecast_uses_only_complete_months_and_targets_the_running_month(admin, history, branches):
    add_sale(branches[0], 100, date(2026, 9, 20), 500, history)  # huge, but September is not finished
    r = get(admin, "forecast/").data
    prod = next(p for p in r["products"] if p["id"] == history.product_id)
    assert r["method"]["forecastMonth"] == "2026-09"
    assert prod["forecast"] == pytest.approx((30 + 40 + 50 + 60 + 70 + 81) / 6, abs=0.01)  # 500 units not counted
    rev = r["overall"]["revenue"]
    assert rev["inProgress"] == {"soFar": 500 * PRICE, "dayOfMonth": 20, "daysInMonth": 30}


def test_a_month_with_no_records_is_skipped_not_counted_as_zero(admin, branches, stocked):
    product = stocked[0].product
    stocked[0].quantity_on_hand = 100000
    stocked[0].save()
    for month in (1, 2, 3, 4, 5, 6, 7):  # Jan-Jul recorded
        add_sale(branches[0], month, date(2026, month, 15), 60, product)
    add_sale(branches[0], 50, date(2026, 9, 3), 1, product)  # nobody recorded anything in August
    r = get(admin, "forecast/").data
    prod = next(p for p in r["products"] if p["id"] == product.product_id)
    assert [m["month"] for m in prod["recent"]] == ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]
    assert prod["forecast"] == 60  # an empty August did not drag it down to 50
    assert r["method"]["basedOn"]["to"] == "2026-07"


def test_live_panel_shows_todays_totals_and_latest_transactions(admin, staff_ibaan, history, branches):
    from clinic.models import Customer
    from sales.models import ServiceTransaction

    owner = Customer.objects.create(customer_id="CUS-I0001", branch=branches[0], customer_name="Ana Cruz")
    ServiceTransaction.objects.create(service_txn_id="SV-I-000001", branch=branches[0], customer=owner,
                                      txn_date=date(2026, 8, 31), txn_time=time(15, 45), total_amount=400,
                                      payment_status="Paid")
    r = get(admin, "live/").data
    assert r["today"] == "2026-08-31" and r["isToday"] is False
    assert r["totals"]["sales"] == 1 * PRICE and r["totals"]["services"] == 0  # the 1-unit sale made on the 31st
    assert r["totals"]["saleTxns"] == 1 and r["byBranch"]["Ibaan"]["saleTxns"] == 1
    top = r["recent"][0]
    assert (top["kind"], top["id"], top["time"], top["customer"], top["amount"]) == ("Visit", "SV-I-000001", "15:45", "Ana Cruz", 400)
    assert {x["kind"] for x in r["recent"]} == {"Visit", "Sale"} and len(r["recent"]) <= 10
    assert get(admin, "live/?branch=San Jose").data["recent"] == []
    assert get(staff_ibaan, "live/").status_code == 403


def test_forecast_moving_average_and_accuracy(admin, history):
    r = get(admin, "forecast/").data
    prod = next(p for p in r["products"] if p["id"] == history.product_id)
    series = [10, 20, 30, 40, 50, 60, 70, 81]  # August includes the extra unit
    assert prod["forecast"] == pytest.approx(sum(series[-6:]) / 6, abs=0.01)  # mean of Mar..Aug = 55.17
    assert prod["avgPerMonth"] == prod["forecast"]
    assert [m["units"] for m in prod["recent"]] == series[-6:]
    # Back-test: Jul forecast = mean(Jan..Jun) = 35 vs 70; Aug forecast = mean(Feb..Jul) = 45 vs 81.
    assert prod["accuracy"]["months"] == 2
    assert prod["accuracy"]["mae"] == pytest.approx((35 + 36) / 2, abs=0.01)
    assert prod["accuracy"]["mape"] == pytest.approx((35 / 70 + 36 / 81) / 2 * 100, abs=0.01)
    assert r["method"]["forecastMonth"] == "2026-09"
    revenue = r["overall"]["revenue"]
    assert revenue["forecast"] == pytest.approx(sum(s * PRICE for s in series[-6:]) / 6, abs=0.01)


def test_forecast_order_suggestion(admin, history, stocked):
    inv = stocked[0]
    inv.quantity_on_hand = 20
    inv.save()
    prod = next(p for p in get(admin, "forecast/?branch=Ibaan").data["products"] if p["id"] == history.product_id)
    assert prod["stock"] == 20
    assert prod["toOrder"] == 36  # ceil(55.17 - 20)
    assert prod["stockAfterOrder"] == 56


def test_inventory_movement_uses_tercile_rule_per_category(admin, branches, history):
    ibaan = branches[0]
    made = []
    for i, (pid, qty) in enumerate([("PRD-0002", 60), ("PRD-0003", 6)], start=1):
        p = Product.objects.create(product_id=pid, product_name=f"Item {pid}", category="Food")
        ProductBranchPrice.objects.create(product=p, branch=ibaan, unit_price=PRICE, unit_capital=CAPITAL)
        Inventory.objects.create(inventory_id=f"INV-9{i:05d}", product=p, branch=ibaan, quantity_on_hand=1000)
        add_sale(ibaan, 200 + i, date(2026, 8, 10), qty, p)
        made.append(p)
    r = get(admin, "inventory/?branch=Ibaan").data
    by_id = {i["productId"]: i for i in r["items"]}
    # "Food" holds Dog Food 5kg (history, about 55 sold / month) and the two new items.
    assert by_id["PRD-0001"]["category"] == "Food"
    assert by_id["PRD-0001"]["movement"] == "fast"
    assert by_id["PRD-0002"]["movement"] == "moderate"
    assert by_id["PRD-0003"]["movement"] == "slow"
    assert by_id["PRD-0003"]["avgMonthlyUnits"] == 1.0  # 6 units in the six-month window / 6


def test_sales_analytics_year_and_kpis(admin, history):
    r = get(admin, "sales/?year=2026").data
    assert r["year"] == 2026 and 2026 in r["years"]
    aug = next(m for m in r["monthly"] if m["month"] == "2026-08")
    assert aug["total"] == 81 * PRICE
    assert aug["growthRate"] == round((81 * PRICE - 70 * PRICE) / (70 * PRICE) * 100, 1)
    ibaan = r["perBranch"]["Ibaan"]
    assert ibaan["total"] == sum(QTY_BY_MONTH.values()) * PRICE + PRICE  # every month plus the extra unit
    assert ibaan["profit"] == (sum(QTY_BY_MONTH.values()) + 1) * (PRICE - CAPITAL)
    cur = (60 + 70 + 81) * PRICE  # Jun-Aug
    prev = (30 + 40 + 50) * PRICE  # Mar-May
    assert r["kpis"]["revenue"] == cur and r["kpis"]["previousRevenue"] == prev
    assert r["kpis"]["revenueGrowth"] == round((cur - prev) / prev * 100, 1)
    assert r["kpis"]["avgDailyTransactions"] == round(4 / 92, 2)  # 4 sales in Jun 1 - Aug 31 (92 days)
    assert r["topItems"][0]["item"] == "Dog Food 5kg" and r["topItems"][0]["revenue"] == cur


def test_report_data_for_a_month(admin, history):
    r = get(admin, "report/?year=2026&month=8").data
    assert r["period"] == {"month": "2026-08", "label": "August 2026", "partial": False}
    assert r["sales"]["branches"][0]["total"] == 81 * PRICE
    assert r["sales"]["topProducts"][0]["units"] == 81


def test_empty_database_returns_empty_flag(admin):
    for path in ("overview/", "live/", "sales/", "inventory/", "forecast/", "report/"):
        r = get(admin, path)
        assert r.status_code == 200 and r.data["empty"] is True, path


def test_wape_weighs_by_volume_and_mape_does_not():
    pairs = [(10, 1), (100, 100)]  # a slow month of 1 unit badly missed, a big month nailed
    assert fc.wape(pairs) == pytest.approx(9 / 101 * 100)
    assert fc.mape(pairs) > 400
    assert fc.wape([(5, 0)]) is None
