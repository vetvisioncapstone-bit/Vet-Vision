from datetime import date, timedelta

import pytest

from accounts.models import AuditLog, User
from clinic.models import Customer, MedicalRecord, Pet
from engagement.models import BranchAvailability
from inventory.models import Service
from sales.models import ServiceDetail, ServiceTransaction

from .conftest import PASSWORD, client_for
from core.clinic_calendar import day_info, easter

SIGNUP = {"firstName": "Maria", "lastName": "Santos", "email": "Maria.Santos@Gmail.com", "password": PASSWORD,
          "mobile": "09171234567", "branch": "Ibaan"}


def test_owner_can_register_and_is_signed_in(api, branches):
    r = api.post("/api/auth/register/", SIGNUP)
    assert r.status_code == 201 and r.data["access"] and r.data["user"]["role"] == "customer"
    u = User.objects.get(email="maria.santos@gmail.com")
    assert u.customer.customer_name == "Maria Santos" and u.customer.branch.town == "Ibaan"
    assert u.check_password(PASSWORD) and not u.must_change_password
    assert AuditLog.objects.filter(action="register").exists()


def test_registration_rejects_duplicates_and_weak_passwords(api, branches):
    assert api.post("/api/auth/register/", SIGNUP).status_code == 201
    assert api.post("/api/auth/register/", SIGNUP).status_code == 400
    weak = api.post("/api/auth/register/", {**SIGNUP, "email": "b@x.ph", "password": "12345678"})
    assert weak.status_code == 400 and "password" in weak.data


def test_registration_is_throttled(api, branches):
    codes = [api.post("/api/auth/register/", {**SIGNUP, "email": f"u{i}@x.ph"}).status_code for i in range(7)]
    assert codes[-1] == 429


def _owner(api, branches):
    api.post("/api/auth/register/", SIGNUP)
    return client_for(User.objects.get(email="maria.santos@gmail.com"))


def test_owner_registers_own_pet_and_sees_only_own(api, branches):
    c = _owner(api, branches)
    r = c.post("/api/me/pets/", {"petName": "Bantay", "petSpecie": "Dog", "petSex": "Male", "petDob": "2023-01-01",
                                  "petBreed": "Aspin"})
    assert r.status_code == 201 and r.data["name"] == "Bantay"
    assert [p["name"] for p in c.get("/api/me/pets/").data] == ["Bantay"]
    assert Pet.objects.get(pet_name="Bantay").customer.email == "maria.santos@gmail.com"
    future = (date.today() + timedelta(days=5)).isoformat()
    bad = c.post("/api/me/pets/", {"petName": "X", "petSpecie": "Cat", "petSex": "Female", "petDob": future})
    assert bad.status_code == 400


def test_reminders_cover_follow_ups_and_yearly_boosters(api, branches):
    c = _owner(api, branches)
    pet = Pet.objects.create(pet_id="PET-I00001", customer=Customer.objects.get(email="maria.santos@gmail.com"),
                             pet_name="Bantay", species="Dog")
    MedicalRecord.objects.create(record_id="MR-1", pet=pet, branch=branches[0], record_date=date(2026, 8, 1),
                                 follow_up=True, follow_up_note="Recheck the wound")
    vacc = Service.objects.create(service_id="SRV-1", service_name="ARV VACC", category="VACCINES")
    card = Service.objects.create(service_id="SRV-2", service_name="VACCINATION CARD", category="VACCINES")
    old = date.today() - timedelta(days=400)  # a year and a bit ago: booster overdue by ~35 days
    t = ServiceTransaction.objects.create(service_txn_id="ST-1", branch=branches[0], customer=pet.customer, pet=pet,
                                          txn_date=old, total_amount=0)
    ServiceDetail.objects.create(service_detail_id="SD-1", service_txn=t, service=vacc, quantity=1, unit_price=0,
                                 line_total=0)
    ServiceDetail.objects.create(service_detail_id="SD-2", service_txn=t, service=card, quantity=1, unit_price=0,
                                 line_total=0)
    kinds = {r["kind"]: r for r in c.get("/api/me/reminders/").data}
    assert kinds["follow_up"]["text"] == "Recheck the wound"
    assert kinds["vaccination"]["overdue"] is True and kinds["vaccination"]["petName"] == "Bantay"


def test_recent_vaccine_is_not_a_reminder(api, branches):
    c = _owner(api, branches)
    pet = Pet.objects.create(pet_id="PET-I00001", customer=Customer.objects.get(email="maria.santos@gmail.com"),
                             pet_name="Bantay")
    vacc = Service.objects.create(service_id="SRV-1", service_name="5 IN 1 VACC", category="VACCINES")
    t = ServiceTransaction.objects.create(service_txn_id="ST-1", branch=branches[0], customer=pet.customer, pet=pet,
                                          txn_date=date.today() - timedelta(days=30), total_amount=0)
    ServiceDetail.objects.create(service_detail_id="SD-1", service_txn=t, service=vacc, quantity=1, unit_price=0,
                                 line_total=0)
    assert c.get("/api/me/reminders/").data == []


def test_calendar_rules_and_easter():
    assert easter(2026) == date(2026, 4, 5)
    assert day_info(date(2026, 9, 27))["state"] == "closed"           # a Sunday
    assert day_info(date(2026, 12, 25))["reason"] == "Christmas Day"
    assert day_info(date(2026, 12, 24))["state"] == "half"
    assert day_info(date(2026, 9, 24))["state"] == "open"


def test_calendar_endpoint_applies_admin_overrides(api, branches, admin):
    c = _owner(api, branches)
    BranchAvailability.objects.create(branch=branches[0], date=date(2026, 9, 24), state="unavailable")
    BranchAvailability.objects.create(branch=branches[0], date=date(2026, 9, 27), state="available")
    r = c.get("/api/clinic/calendar/", {"from": "2026-09-24", "to": "2026-09-28"})
    days = r.data["days"]
    assert r.data["branch"] == "Ibaan"
    assert days["2026-09-24"]["state"] == "closed" and days["2026-09-24"]["reason"] == "Closed by the clinic"
    assert days["2026-09-27"]["state"] == "open"                      # opened on a Sunday
    assert days["2026-09-25"]["state"] == "open"
    assert c.get("/api/clinic/calendar/", {"from": "2026-01-01", "to": "2026-12-31"}).status_code == 400


def test_long_lapsed_vaccine_is_not_nagged(api, branches):
    c = _owner(api, branches)
    pet = Pet.objects.create(pet_id="PET-I00001", customer=Customer.objects.get(email="maria.santos@gmail.com"),
                             pet_name="Bantay")
    vacc = Service.objects.create(service_id="SRV-1", service_name="ARV VACC", category="VACCINES")
    t = ServiceTransaction.objects.create(service_txn_id="ST-1", branch=branches[0], customer=pet.customer, pet=pet,
                                          txn_date=date.today() - timedelta(days=5 * 365), total_amount=0)
    ServiceDetail.objects.create(service_detail_id="SD-1", service_txn=t, service=vacc, quantity=1, unit_price=0,
                                 line_total=0)
    assert c.get("/api/me/reminders/").data == []
