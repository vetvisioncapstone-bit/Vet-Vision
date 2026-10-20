from datetime import date, time

import pytest
from django.core.management import call_command

from accounts.models import User
from clinic.models import Customer, MedicalRecord, Pet, Staff
from inventory.models import Product, Service
from sales.models import Sale, SaleDetail, ServiceDetail, ServiceTransaction

from .conftest import client_for


@pytest.fixture
def visits(branches):
    ibaan = branches[0]
    owner = Customer.objects.create(customer_id="CUS-I0001", branch=ibaan, customer_name="Ana Cruz",
                                    email="ana@example.com")
    pet = Pet.objects.create(pet_id="PET-I00001", customer=owner, pet_name="Bantay", species="Dog")
    vet = Staff.objects.create(staff_id="STF-004", branch=ibaan, staff_name="Vet One", role="Veterinarian", is_active=True)
    groom = Service.objects.create(service_id="SRV-0001", service_name="FULL GROOM", category="GROOMING")
    vacc = Service.objects.create(service_id="SRV-0002", service_name="ARV VACC", category="VACCINES")
    fee = Service.objects.create(service_id="SRV-0003", service_name="400 PF", category="PROFESSIONAL FEE")

    def txn(n, day, weight, total, lines, when=time(9, 30)):
        t = ServiceTransaction.objects.create(service_txn_id=f"SV-I-{n:06d}", branch=ibaan, customer=owner, pet=pet,
                                              txn_date=day, txn_time=when, weight_kg=weight, total_amount=total,
                                              payment_status="Paid")
        for i, (svc, price, remark, qty) in enumerate(lines, start=1):
            ServiceDetail.objects.create(service_detail_id=f"VD-{n:03d}{i:04d}", service_txn=t, service=svc, staff=vet,
                                         quantity=qty, unit_price=price, line_total=price * qty, remarks=remark)
        return t

    txn(1, date(2025, 3, 1), "4.50", 750, [(fee, 400, "Vital signs normal", 1), (vacc, 350, "Follow-up after 3 days", 1)])
    txn(2, date(2025, 6, 9), "4.00", 700, [(groom, 350, "Mild tangles", 2)])
    txn(3, date(2025, 6, 9), None, 400, [(fee, 400, None, 1)])  # second visit the same day
    # A pet with no visits, and a product bought on visit day 1 for this pet.
    food = Product.objects.create(product_id="PRD-0001", product_name="Dog Food 5kg", category="Food")
    sale = Sale.objects.create(sale_id="SL-I-000001", branch=ibaan, customer=owner, sale_date=date(2025, 3, 1),
                               payment_status="Paid", total_amount=250)
    SaleDetail.objects.create(sale_detail_id="SD-0000001", sale=sale, product=food, pet=pet, quantity=1,
                              unit_price=250, line_total=250)
    other_sale = Sale.objects.create(sale_id="SL-I-000002", branch=ibaan, customer=owner, sale_date=date(2025, 8, 8),
                                     payment_status="Paid", total_amount=250)
    SaleDetail.objects.create(sale_detail_id="SD-0000002", sale=other_sale, product=food, pet=pet, quantity=1,
                              unit_price=250, line_total=250)
    return pet


def test_creates_one_record_per_visit_with_real_details(visits):
    call_command("seed_medical_records")
    recs = {r.source_txn_id: r for r in MedicalRecord.objects.all()}
    assert len(recs) == 3
    first = recs["SV-I-000001"]
    assert first.record_id == "MR-00000001" and first.record_date == date(2025, 3, 1)
    assert first.record_type == "Vaccination" and first.branch.town == "Ibaan" and first.staff.staff_id == "STF-004"
    assert first.weight == "4.5 kg"
    assert first.treatment == "400 PF, ARV VACC"
    assert first.remarks == "Vital signs normal; Follow-up after 3 days"
    assert first.follow_up is True and first.follow_up_note == "Follow-up after 3 days"
    assert first.diagnosis is None  # nothing in the data says what the diagnosis was
    assert [i["name"] for i in first.availed_items] == ["400 PF", "ARV VACC", "Dog Food 5kg"]
    assert [i["type"] for i in first.availed_items] == ["Service", "Service", "Product"]
    assert float(first.total_price) == 750 + 250  # visit total plus the food bought for this pet that day
    assert "Product: Dog Food 5kg — ₱250.00" in first.services
    second = recs["SV-I-000002"]
    assert second.record_type == "Grooming" and second.weight == "4 kg" and second.treatment == "FULL GROOM x2"
    assert second.follow_up is False and float(second.total_price) == 700


def test_products_are_attached_to_only_one_of_two_same_day_visits_and_stay_out_of_records(visits):
    call_command("seed_medical_records")
    third = MedicalRecord.objects.get(source_txn_id="SV-I-000003")
    assert third.weight is None and third.remarks is None and float(third.total_price) == 400
    assert MedicalRecord.objects.count() == 3  # the food bought on 2025-08-08 did not create a record


def test_running_twice_creates_nothing_new(visits, capsys):
    call_command("seed_medical_records")
    call_command("seed_medical_records")
    assert MedicalRecord.objects.count() == 3
    call_command("seed_medical_records", "--dry-run")
    assert "0 service transactions" in capsys.readouterr().out


def test_dry_run_changes_nothing(visits, capsys):
    call_command("seed_medical_records", "--dry-run")
    assert "3 service transactions" in capsys.readouterr().out
    assert MedicalRecord.objects.count() == 0


def test_history_shows_each_visit_once_after_seeding(visits, admin):
    c = client_for(admin)
    owner_user = User.objects.create(email="ana@example.com", name="Ana", role="customer",
                                     customer=Customer.objects.get(pk="CUS-I0001"))
    before = client_for(owner_user).get("/api/me/pets/").data[0]["visits"]
    call_command("seed_medical_records")
    after = client_for(owner_user).get("/api/me/pets/").data[0]["visits"]
    assert len(before) == len(after) == 3
    assert {v["id"] for v in after} == {"MR-00000001", "MR-00000002", "MR-00000003"}
    patient = c.get("/api/patients/PET-I00001/").data
    assert len(patient["consultations"]) == 3 and patient["lastVisit"] == "2025-06-09"
    assert patient["status"] == "Active"  # follow-up remarks from old visits do not flag the patient
