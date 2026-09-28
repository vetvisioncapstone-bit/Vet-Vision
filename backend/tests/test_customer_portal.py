from datetime import date

import pytest
from django.contrib.auth.hashers import make_password

from accounts.models import User
from clinic.models import Customer, MedicalRecord, Pet
from engagement.models import EventPost

from .conftest import client_for


@pytest.fixture
def owners(branches):
    """Two owners from the legacy data: a shared starter password hash, no login user yet."""
    h = make_password("password")
    a = Customer.objects.create(customer_id="CUS-I0001", branch=branches[0], customer_name="Clarissa Umali",
                                email="clarissa.umali@gmail.com", password_hash=h)
    b = Customer.objects.create(customer_id="CUS-I0002", branch=branches[0], customer_name="Kevin Delos",
                                email="kevin.delos@gmail.com", password_hash=h)
    mine = Pet.objects.create(pet_id="PET-I00001", customer=a, pet_name="Bantay", species="Dog", breed="Aspin",
                              sex="Male", date_of_birth=date(2023, 1, 1), color_marking="Brown")
    Pet.objects.create(pet_id="PET-I00002", customer=b, pet_name="Muning", species="Cat")
    MedicalRecord.objects.create(record_id="MR-00000001", pet=mine, branch=branches[0], record_date=date(2026, 8, 1),
                                 treatment="Vaccination", diagnosis="Healthy")
    MedicalRecord.objects.create(record_id="MR-00000002", pet=mine, branch=branches[0], record_date=date(2026, 9, 1),
                                 treatment="Deworming", follow_up=True, follow_up_note="Return in 2 weeks")
    return a, b


def login(api, email, password):
    return api.post("/api/auth/login/", {"email": email, "password": password})


def test_imported_customers_have_no_login_even_with_the_old_starter_password(api, owners):
    assert login(api, "clarissa.umali@gmail.com", "password").status_code == 401
    assert not User.objects.filter(role="customer").exists()


def test_a_clinic_record_email_cannot_be_claimed_by_signing_up(api, owners):
    r = api.post("/api/auth/register/", {"firstName": "Clarissa", "lastName": "Umali", "email": "clarissa.umali@gmail.com",
                                         "password": "Br@nd-new-Pass77"})
    assert r.status_code == 400 and "clinic record" in str(r.data)
    assert not User.objects.filter(email="clarissa.umali@gmail.com").exists()


def test_history_includes_legacy_service_visits(owners, branches):
    from inventory.models import Service
    from sales.models import ServiceDetail, ServiceTransaction

    svc = Service.objects.create(service_id="SRV-0001", service_name="Vaccination", category="Preventive")
    txn = ServiceTransaction.objects.create(service_txn_id="SV-I-000001", branch=branches[0], customer=owners[0],
                                            pet=Pet.objects.get(pk="PET-I00001"), txn_date=date(2026, 9, 10),
                                            total_amount=450, payment_status="Paid", weight_kg=3.5)
    ServiceDetail.objects.create(service_detail_id="VD-0000001", service_txn=txn, service=svc, quantity=1,
                                 unit_price=450, line_total=450, remarks="Vital signs normal")
    u = User.objects.create(email="x@gmail.com", name="X", role="customer", customer=owners[0])
    visits = client_for(u).get("/api/me/pets/").data[0]["visits"]
    assert [v["date"] for v in visits] == ["2026-09-10", "2026-09-01", "2026-08-01"]
    assert visits[0]["services"] == "Vaccination" and visits[0]["weight"] == "3.5 kg" and visits[0]["totalPrice"] == 450


def test_customer_sees_only_own_pets_and_history(owners):
    login_user = User.objects.create(email="x@gmail.com", name="X", role="customer", customer=owners[0])
    rows = client_for(login_user).get("/api/me/pets/").data
    assert [p["name"] for p in rows] == ["Bantay"]
    assert rows[0]["lastCheckup"] == "2026-09-01"
    assert [v["date"] for v in rows[0]["visits"]] == ["2026-09-01", "2026-08-01"]
    assert rows[0]["visits"][0]["followUpNote"] == "Return in 2 weeks"


def test_customer_reads_announcements_but_cannot_use_clinic_endpoints(owners, admin):
    EventPost.objects.create(author=admin, author_name="Owner Admin", text="Closed on Friday")
    u = User.objects.create(email="x@gmail.com", name="X", role="customer", customer=owners[0])
    c = client_for(u)
    assert [p["text"] for p in c.get("/api/events/posts/").data] == ["Closed on Friday"]
    assert c.post("/api/events/posts/", {"text": "hi"}).status_code == 403
    for path in ["/api/patients/", "/api/inventory/", "/api/sales/", "/api/staff-accounts/", "/api/requests/",
                 "/api/seen-followups/", "/api/events/availability/"]:
        assert c.get(path).status_code == 403, path


def test_staff_cannot_use_customer_endpoint(staff_ibaan):
    assert client_for(staff_ibaan).get("/api/me/pets/").status_code == 403
