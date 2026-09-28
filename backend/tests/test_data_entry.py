"""The data-entry gaps from docs/data_entry_and_dashboard_audit.md: prices (G3), receiving stock (G5), the customer on
a counter sale (G2) and managing services with their supplies (G4)."""
from decimal import Decimal

from clinic.models import Customer
from inventory.models import InventoryTransaction, ProductBranchPrice, Service, ServiceProductUsage
from sales.models import Sale

from .conftest import client_for

PRODUCT = {"name": "Cat Litter 10L", "category": "Supplies", "branch": "Ibaan", "quantity": 5, "reorderPoint": 2}


# ------------------------------------------------------------------ G3 product prices


def test_admin_sets_price_and_cost_staff_cannot(admin, staff_ibaan, branches):
    r = client_for(admin).post("/api/inventory/", {**PRODUCT, "unitPrice": 320, "unitCost": 250}, format="json")
    assert r.status_code == 201 and r.data["unitPrice"] == 320 and r.data["unitCost"] == 250
    staff = client_for(staff_ibaan)
    body = {**PRODUCT, "quantity": 6}
    assert staff.put(f"/api/inventory/{r.data['id']}/", {**body, "unitPrice": 1}, format="json").status_code == 403
    edited = staff.put(f"/api/inventory/{r.data['id']}/", body, format="json")  # no price fields: allowed
    assert edited.status_code == 200 and edited.data["unitPrice"] == 320
    again = client_for(admin).put(f"/api/inventory/{r.data['id']}/", {**body, "unitPrice": 340}, format="json")
    assert again.data["unitPrice"] == 340 and again.data["unitCost"] == 250  # cost untouched when not sent
    assert ProductBranchPrice.objects.get().unit_price == 340


# ------------------------------------------------------------------ G5 receiving stock


def test_receiving_stock_adds_it_and_logs_a_restock(staff_ibaan, staff_sanjose, stocked):
    inv = stocked[0]  # Ibaan, 10 on hand
    c = client_for(staff_ibaan)
    r = c.post(f"/api/inventory/{inv.inventory_id}/receive/", {"quantity": 24, "expiration": "2027-12-31"}, format="json")
    assert r.status_code == 200 and r.data["quantity"] == 34 and r.data["expiration"] == "2027-12-31" and r.data["delivery"]
    move = InventoryTransaction.objects.get(txn_type="restock")
    assert move.quantity_change == 24 and move.reference_id == inv.inventory_id
    assert c.post(f"/api/inventory/{inv.inventory_id}/receive/", {"quantity": 0}, format="json").status_code == 400
    other = client_for(staff_sanjose).post(f"/api/inventory/{inv.inventory_id}/receive/", {"quantity": 1}, format="json")
    assert other.status_code == 404  # another branch's shelf


# ------------------------------------------------------------------ G2 the customer on a counter sale


def test_counter_sale_can_name_the_owner(staff_ibaan, branches, stocked):
    ibaan, sanjose = branches
    mine = Customer.objects.create(customer_id="CUS-I0009", branch=ibaan, customer_name="Ana Reyes")
    theirs = Customer.objects.create(customer_id="CUS-S0009", branch=sanjose, customer_name="Ben Cruz")
    c = client_for(staff_ibaan)
    line = [{"inventoryId": stocked[0].inventory_id, "quantity": 1, "price": 250}]
    r = c.post("/api/sales/", {"items": line, "customerId": mine.customer_id}, format="json")
    assert r.status_code == 201 and r.data["customerName"] == "Ana Reyes"
    assert Sale.objects.get(pk=r.data["id"]).customer_id == mine.customer_id
    assert c.post("/api/sales/", {"items": line, "customerId": theirs.customer_id}, format="json").status_code == 400
    walk_in = c.post("/api/sales/", {"items": line, "customerId": ""}, format="json")
    assert walk_in.status_code == 201 and walk_in.data["customerName"] == ""


# ------------------------------------------------------------------ G4 services and their supplies


def test_admin_manages_services_with_prices_and_supplies(admin, staff_ibaan, stocked):
    product = stocked[0].product
    a = client_for(admin)
    body = {"name": "Nail trim", "category": "grooming",
            "prices": {"Ibaan": {"price": 150, "cost": 30}, "San Jose": {"price": 120}},
            "supplies": [{"productId": product.product_id, "quantity": 1}]}
    r = a.post("/api/services/", body, format="json")
    assert r.status_code == 201 and r.data["category"] == "GROOMING"
    assert r.data["prices"] == {"Ibaan": 150.0, "San Jose": 120.0} and r.data["costs"]["Ibaan"] == 30.0
    assert r.data["supplies"] == [{"productId": product.product_id, "name": "Dog Food 5kg", "quantity": 1.0}]
    sid = r.data["id"]

    staff = client_for(staff_ibaan)
    seen = next(s for s in staff.get("/api/services/").data if s["id"] == sid)
    assert "costs" not in seen and "supplies" not in seen  # the owner's business
    assert staff.post("/api/services/", body, format="json").status_code == 403
    assert staff.put(f"/api/services/{sid}/", body, format="json").status_code == 403

    assert a.post("/api/services/", {**body, "name": "NAIL TRIM"}, format="json").status_code == 400  # duplicate
    edited = a.put(f"/api/services/{sid}/", {**body, "prices": {"Ibaan": {"price": 175, "cost": 30}}, "supplies": []},
                   format="json")
    assert edited.data["prices"]["Ibaan"] == 175.0 and edited.data["supplies"] == []
    assert not ServiceProductUsage.objects.exists()


def test_a_billed_service_uses_up_its_supplies(admin, staff_ibaan, stocked):
    """End to end: the supply list feeds the database trigger when a consultation bills the service."""
    shelf = stocked[0]  # Ibaan, 10 on hand
    sid = client_for(admin).post("/api/services/", {
        "name": "Deworming", "category": "Preventive", "prices": {"Ibaan": {"price": 200, "cost": 80}},
        "supplies": [{"productId": shelf.product_id, "quantity": 2}]}, format="json").data["id"]
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", {
        "ownerName": "Maria", "ownerSurname": "Santos", "ownerAddress": "Rizal St", "ownerMobile": "0917",
        "petName": "Bantay", "petSpecie": "Dog", "petBreed": "Aspin", "petSex": "Male", "petDob": "2023-05-10",
        "petMarking": "Brown"}).data["id"]
    r = c.post(f"/api/patients/{pid}/consultations/", {"date": "2026-09-28", "notes": "Dewormed", "availedItems": [
        {"type": "Service", "serviceId": sid, "price": 200, "quantity": 1}]}, format="json")
    assert r.status_code == 201
    shelf.refresh_from_db()
    assert shelf.quantity_on_hand == Decimal("8")  # 10 - 2 per deworming
    assert Service.objects.get(pk=sid).service_name == "Deworming"
