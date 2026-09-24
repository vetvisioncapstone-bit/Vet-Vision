from inventory.models import Inventory, InventoryTransaction

from .conftest import client_for

NEW = {"name": "Cat Litter", "category": "Supplies", "quantity": 20, "reorderPoint": 5,
       "delivery": "2026-09-01", "expiration": "2027-09-01"}


def test_staff_only_sees_and_creates_in_own_branch(staff_ibaan, stocked):
    c = client_for(staff_ibaan)
    rows = c.get("/api/inventory/").data
    assert [r["branch"] for r in rows] == ["Ibaan"]
    created = c.post("/api/inventory/", {**NEW, "branch": "San Jose"})
    assert created.status_code == 201 and created.data["branch"] == "Ibaan"  # branch input is ignored for staff


def test_admin_sees_all_and_can_filter(admin, stocked):
    c = client_for(admin)
    assert len(c.get("/api/inventory/").data) == 2
    assert len(c.get("/api/inventory/?branch=San Jose").data) == 1


def test_update_logs_adjustment(admin, stocked):
    c = client_for(admin)
    a, _ = stocked
    r = c.put(f"/api/inventory/{a.inventory_id}/", {**NEW, "name": "Dog Food 5kg", "category": "Food", "quantity": 12})
    assert r.status_code == 200 and r.data["quantity"] == 12
    t = InventoryTransaction.objects.get(txn_type="adjustment")
    assert t.quantity_change == 2


def test_staff_cannot_edit_other_branch_or_delete(staff_ibaan, stocked):
    c = client_for(staff_ibaan)
    a, b = stocked
    assert c.put(f"/api/inventory/{b.inventory_id}/", {**NEW, "quantity": 1}).status_code == 404
    assert c.delete(f"/api/inventory/{a.inventory_id}/").status_code == 403
    assert Inventory.objects.filter(pk=a.pk).exists()


def test_admin_delete_and_validation(admin, stocked):
    c = client_for(admin)
    a, _ = stocked
    assert c.post("/api/inventory/", {**NEW, "quantity": -1, "branch": "Ibaan"}).status_code == 400
    assert c.delete(f"/api/inventory/{a.inventory_id}/").status_code == 204
