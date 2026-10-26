"""What each staff position may do (core/permissions.py POSITION_ABILITIES): the access table agreed with the clinic."""
import pytest

from .conftest import client_for, make_staff
from .test_patients import PATIENT


@pytest.fixture
def pet(admin, branches):
    return client_for(admin).post("/api/patients/", {**PATIENT, "branch": "Ibaan"}).data["id"]


def staff(branches, position):
    return client_for(make_staff(branches[0], "STF-009", "pos@ecovet.ph", position))


def visit(**over):
    return {"date": "2026-09-24", "notes": "Checked", **over}


def test_me_lists_the_abilities_of_the_position(branches):
    me = staff(branches, "Secretary").get("/api/auth/me/").data
    assert me["position"] == "Secretary" and me["abilities"] == ["inventory", "patients.edit", "sales"]


def test_veterinarian_writes_prescriptions_and_lab_results(branches, pet):
    c = staff(branches, "Veterinarian")
    r = c.post(f"/api/patients/{pet}/consultations/", visit(prescription={"rx": "Amoxicillin 250 mg"},
               labResults=[{"name": "cbc.png", "image": "data:image/png;base64,AAAA"}]), format="json")
    assert r.status_code == 201


def test_secretary_registers_and_sells_but_logs_no_visits(branches, pet, stocked):
    c = staff(branches, "Secretary")
    assert c.post("/api/patients/", {**PATIENT, "ownerEmail": "new@example.com", "petName": "Muning"}).status_code == 201
    assert c.post(f"/api/patients/{pet}/consultations/", visit(), format="json").status_code == 403
    sale = [{"inventoryId": stocked[0].inventory_id, "quantity": 1, "price": 250}]
    assert c.post("/api/sales/", {"items": sale}, format="json").status_code == 201
    assert c.post(f"/api/inventory/{stocked[0].inventory_id}/receive/", {"quantity": 2}, format="json").status_code == 200


def test_assistant_logs_service_visits_only(branches, pet, stocked):
    c = staff(branches, "Groomer / Vet Assistant")
    assert c.post(f"/api/patients/{pet}/consultations/", visit(), format="json").status_code == 201
    rx = c.post(f"/api/patients/{pet}/consultations/", visit(prescription={"rx": "x"}), format="json")
    product = c.post(f"/api/patients/{pet}/consultations/", visit(availedItems=[
        {"type": "Product", "inventoryId": stocked[0].inventory_id, "price": 250, "quantity": 1}]), format="json")
    assert rx.status_code == 403 and product.status_code == 403
    assert c.put(f"/api/patients/{pet}/", PATIENT).status_code == 403  # view only
    assert c.post("/api/sales/", {"items": []}, format="json").status_code == 403
    assert c.post(f"/api/inventory/{stocked[0].inventory_id}/receive/", {"quantity": 1}, format="json").status_code == 403
    assert c.get("/api/patients/").status_code == 200 and c.get("/api/inventory/").status_code == 200


def test_unknown_position_can_only_view(branches, pet):
    c = staff(branches, "Driver")
    assert c.get("/api/patients/").status_code == 200
    assert c.post(f"/api/patients/{pet}/consultations/", visit(), format="json").status_code == 403


def test_only_the_admin_corrects_a_stock_count(admin, branches, stocked):
    inv = stocked[0]  # 10 on hand
    body = {"name": "Dog Food 5kg", "category": "Food", "quantity": 7, "reorderPoint": 3}
    vet = staff(branches, "Veterinarian")
    assert vet.put(f"/api/inventory/{inv.inventory_id}/", body, format="json").status_code == 403
    same = vet.put(f"/api/inventory/{inv.inventory_id}/", {**body, "quantity": 10, "reorderPoint": 4}, format="json")
    assert same.status_code == 200 and same.data["reorderPoint"] == 4  # details may change, the count may not
    assert client_for(admin).put(f"/api/inventory/{inv.inventory_id}/", body, format="json").data["quantity"] == 7
