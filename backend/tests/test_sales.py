from inventory.models import InventoryTransaction

from .conftest import client_for


def sale(c, inv, qty, price=250):
    return c.post("/api/sales/", {"items": [{"inventoryId": inv.inventory_id, "quantity": qty, "price": price}]})


def test_sale_deducts_stock_exactly_once_via_trigger(staff_ibaan, stocked):
    a, _ = stocked
    r = sale(client_for(staff_ibaan), a, 3)
    assert r.status_code == 201 and r.data["total"] == 750
    assert r.data["items"][0]["quantity"] == 3 and r.data["staffName"] == staff_ibaan.staff.staff_name
    a.refresh_from_db()
    assert a.quantity_on_hand == 7  # 10 - 3, not 10 - 6
    txn = InventoryTransaction.objects.get(txn_type="sale")
    assert txn.quantity_change == -3 and txn.reference_id == r.data["id"]


def test_cannot_oversell(staff_ibaan, stocked):
    a, _ = stocked
    r = sale(client_for(staff_ibaan), a, 11)
    assert r.status_code == 400
    a.refresh_from_db()
    assert a.quantity_on_hand == 10


def test_staff_cannot_sell_other_branch_stock(staff_ibaan, stocked):
    _, b = stocked
    assert sale(client_for(staff_ibaan), b, 1).status_code == 400
    b.refresh_from_db()
    assert b.quantity_on_hand == 5


def test_duplicate_lines_are_summed_for_the_stock_check(staff_ibaan, stocked):
    a, _ = stocked
    items = [{"inventoryId": a.inventory_id, "quantity": 6, "price": 1}] * 2
    assert client_for(staff_ibaan).post("/api/sales/", {"items": items}).status_code == 400


def test_sales_list_is_branch_scoped(staff_ibaan, staff_sanjose, stocked):
    a, b = stocked
    sale(client_for(staff_ibaan), a, 1)
    sale(client_for(staff_sanjose), b, 1)
    rows = client_for(staff_ibaan).get("/api/sales/").data
    assert [s["branch"] for s in rows] == ["Ibaan"]
