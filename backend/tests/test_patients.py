from datetime import date
from decimal import Decimal

import pytest

from accounts.models import User
from clinic.models import MedicalRecord, Pet
from inventory.models import InventoryTransaction, Service, ServiceBranchPrice
from sales.models import Sale, ServiceTransaction

from .conftest import client_for

PATIENT = {
    "ownerName": "Maria", "ownerSurname": "Santos", "ownerEmail": "maria@example.com",
    "ownerAddress": "123 Rizal St", "ownerMobile": "09171234567", "petName": "Bantay", "petSpecie": "Dog",
    "petBreed": "Aspin", "petSex": "Male", "petDob": "2023-05-10", "petMarking": "Brown",
}


def consult(**over):
    return {"date": "2026-09-24", "notes": "Checked", **over}


def test_create_patient_and_duplicate_email(staff_ibaan):
    c = client_for(staff_ibaan)
    r = c.post("/api/patients/", PATIENT)
    assert r.status_code == 201
    assert r.data["branch"] == "Ibaan" and r.data["status"] == "Active" and r.data["id"].startswith("PET-I")
    assert r.data["ownerName"] == "Maria" and r.data["consultations"] == []
    dup = c.post("/api/patients/", {**PATIENT, "petName": "Other"})
    assert dup.status_code == 400 and "ownerEmail" in dup.data


def test_owners_without_email_can_be_saved_and_edited(staff_ibaan):
    c = client_for(staff_ibaan)
    a = c.post("/api/patients/", {**PATIENT, "ownerEmail": ""})
    b = c.post("/api/patients/", {**PATIENT, "ownerEmail": "", "ownerName": "Jose", "petName": "Muning"})
    assert a.status_code == 201 and b.status_code == 201 and a.data["ownerEmail"] == ""  # two blanks do not clash
    assert c.put(f"/api/patients/{a.data['id']}/", {**PATIENT, "ownerEmail": ""}).status_code == 200


def test_branch_scoping(staff_ibaan, staff_sanjose):
    pid = client_for(staff_ibaan).post("/api/patients/", PATIENT).data["id"]
    other = client_for(staff_sanjose)
    assert other.get("/api/patients/").data == []
    assert other.get(f"/api/patients/{pid}/").status_code == 404


@pytest.fixture
def catalog(branches):
    """Two services from the clinic's catalog, priced at Ibaan."""
    out = {}
    for sid, name, category, price, capital in (("SRV-0001", "Vaccination", "VACCINES", 300, 120),
                                                ("SRV-0002", "Grooming", "GROOMING", 100, 40)):
        out[name] = Service.objects.create(service_id=sid, service_name=name, category=category)
        ServiceBranchPrice.objects.create(service=out[name], branch=branches[0], unit_price=price, unit_capital=capital)
    return out


def service(svc, price, qty=1):
    return {"type": "Service", "serviceId": svc.service_id, "price": price, "quantity": qty}


def test_follow_up_lifecycle(staff_ibaan, catalog):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    r = c.post(f"/api/patients/{pid}/consultations/", consult(followUp=True, followUpNote="Vaccination"))
    assert r.data["status"] == "Follow-up needed" and r.data["followUpNote"] == "Vaccination"
    # A different service does not resolve it...
    r = c.post(f"/api/patients/{pid}/consultations/", consult(availedItems=[service(catalog["Grooming"], 100)]))
    assert r.data["status"] == "Follow-up needed"
    # ...the due service does.
    r = c.post(f"/api/patients/{pid}/consultations/", consult(availedItems=[service(catalog["Vaccination"], 300)]))
    assert r.data["status"] == "Active" and r.data["followUpNote"] == ""
    assert len(r.data["consultations"]) == 3 and r.data["consultations"][2]["totalPrice"] == 300


# ------------------- a consultation is a billed visit (dashboard, stock, owner history) -------------------


def visit(c, pid, items, **over):
    return c.post(f"/api/patients/{pid}/consultations/", consult(availedItems=items, **over))


def test_billed_services_become_a_service_visit_on_the_dashboard(staff_ibaan, admin, catalog):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    r = visit(c, pid, [service(catalog["Vaccination"], 350), service(catalog["Grooming"], 100, qty=2)], weight="3.5 kg")
    assert r.status_code == 201
    txn = ServiceTransaction.objects.get()
    assert txn.pet_id == pid and txn.customer_id == Pet.objects.get(pk=pid).customer_id and txn.total_amount == 550
    assert txn.branch.town == "Ibaan" and txn.weight_kg == Decimal("3.5") and txn.txn_date == date(2026, 9, 24)
    lines = {d.service.service_name: d for d in txn.details.all()}
    assert lines["Vaccination"].line_profit == 350 - 120 and lines["Grooming"].quantity == 2
    rec = MedicalRecord.objects.get()
    assert rec.source_txn_id == txn.service_txn_id and rec.total_price == 550
    # It is revenue now: the analytics read service transactions.
    kpi = client_for(admin).get("/api/analytics/overview/?month=2026-09").data
    assert kpi["kpis"]["totalSales"] == 550


def test_products_handed_out_are_sold_to_the_owner_and_leave_the_shelf(staff_ibaan, stocked):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    ibaan_stock = stocked[0]
    r = visit(c, pid, [{"type": "Product", "inventoryId": ibaan_stock.inventory_id, "price": 250, "quantity": 3}])
    assert r.status_code == 201
    sale = Sale.objects.get()
    assert sale.customer_id == Pet.objects.get(pk=pid).customer_id and sale.total_amount == 750
    ibaan_stock.refresh_from_db()
    assert ibaan_stock.quantity_on_hand == 7  # 10 - 3, deducted by the database trigger
    item = r.data["consultations"][0]["availedItems"][0]
    assert item["name"] == "Dog Food 5kg" and item["saleId"] == sale.sale_id


def test_nothing_is_saved_when_an_item_is_wrong(staff_ibaan, stocked, catalog):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    other_branch = stocked[1].inventory_id  # San Jose stock, patient is at Ibaan
    bad = [service(catalog["Vaccination"], 300), {"type": "Product", "inventoryId": other_branch, "price": 250}]
    assert visit(c, pid, bad).status_code == 400
    assert visit(c, pid, [{"type": "Service", "serviceId": "SRV-9999", "price": 1}]).status_code == 400
    assert visit(c, pid, [{"type": "Service", "name": "Free text", "price": 1}]).status_code == 400
    assert not (MedicalRecord.objects.exists() or ServiceTransaction.objects.exists() or Sale.objects.exists())


def test_deleting_a_consultation_undoes_its_visit_and_returns_the_products(staff_ibaan, admin, stocked, catalog):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    items = [service(catalog["Vaccination"], 300), {"type": "Product", "inventoryId": stocked[0].inventory_id,
                                                    "price": 250, "quantity": 2}]
    cid = visit(c, pid, items).data["consultations"][0]["id"]
    assert client_for(admin).delete(f"/api/consultations/{cid}/").status_code == 204
    assert not (MedicalRecord.objects.exists() or ServiceTransaction.objects.exists() or Sale.objects.exists())
    stocked[0].refresh_from_db()
    assert stocked[0].quantity_on_hand == 10
    assert InventoryTransaction.objects.filter(txn_type="return", quantity_change=2).exists()


def test_an_approved_staff_delete_request_undoes_the_visit_too(staff_ibaan, admin, catalog):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    cid = visit(c, pid, [service(catalog["Grooming"], 100)]).data["consultations"][0]["id"]
    req = c.post("/api/requests/", {"type": "consultation", "targetId": cid, "label": "Oops"}, format="json")
    assert client_for(admin).post(f"/api/requests/{req.data['id']}/approve/").status_code == 200
    assert not (MedicalRecord.objects.exists() or ServiceTransaction.objects.exists())


def test_the_owner_sees_the_visit_once(staff_ibaan, catalog):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    visit(c, pid, [service(catalog["Vaccination"], 300)])
    pet = Pet.objects.get(pk=pid)
    owner = User.objects.create(email="owner@x.ph", name="Owner", role="customer", customer=pet.customer)
    visits = client_for(owner).get("/api/me/pets/").data[0]["visits"]
    assert len(visits) == 1 and visits[0]["type"] == "Consultation"


def test_service_catalog_lists_branch_prices(staff_ibaan, catalog):
    rows = client_for(staff_ibaan).get("/api/services/").data
    vacc = next(r for r in rows if r["name"] == "Vaccination")
    assert vacc["id"] == "SRV-0001" and vacc["prices"] == {"Ibaan": 300.0}


def test_follow_up_requires_note(staff_ibaan):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    assert c.post(f"/api/patients/{pid}/consultations/", consult(followUp=True)).status_code == 400


def test_staff_cannot_hard_delete_admin_can(staff_ibaan, admin):
    pid = client_for(staff_ibaan).post("/api/patients/", PATIENT).data["id"]
    assert client_for(staff_ibaan).delete(f"/api/patients/{pid}/").status_code == 403
    assert client_for(admin).delete(f"/api/patients/{pid}/").status_code == 204
    assert not Pet.objects.filter(pk=pid).exists()


def test_admin_deletes_consultation(staff_ibaan, admin):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    cid = c.post(f"/api/patients/{pid}/consultations/", consult()).data["consultations"][0]["id"]
    assert c.delete(f"/api/consultations/{cid}/").status_code == 403
    assert client_for(admin).delete(f"/api/consultations/{cid}/").status_code == 204
    assert not MedicalRecord.objects.exists()


def test_status_filter_for_the_notification_bell(staff_ibaan):
    c = client_for(staff_ibaan)
    a = c.post("/api/patients/", PATIENT).data["id"]
    c.post("/api/patients/", {**PATIENT, "ownerEmail": "b@example.com", "petName": "Two"})
    c.post(f"/api/patients/{a}/consultations/", consult(followUp=True, followUpNote="Vaccination"))
    rows = c.get("/api/patients/?status=Follow-up needed").data
    assert [r["id"] for r in rows] == [a]
