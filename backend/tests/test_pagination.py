from datetime import date

import pytest

from clinic.models import Customer, MedicalRecord, Pet
from engagement.models import EventPost

from .conftest import client_for


@pytest.fixture
def herd(branches):
    """30 Ibaan patients (Pet 01..30, owner Owner01 Cruz..) and 4 San Jose patients."""
    ibaan, sanjose = branches
    for i in range(1, 31):
        c = Customer.objects.create(customer_id=f"CUS-I{i:04d}", branch=ibaan, customer_name=f"Owner{i:02d} Cruz",
                                    first_name=f"Owner{i:02d}", last_name="Cruz", email=f"owner{i:02d}@example.com")
        Pet.objects.create(pet_id=f"PET-I{i:05d}", customer=c, pet_name=f"Pet{i:02d}", species="Dog",
                           status="Follow-up needed" if i <= 3 else "Active")
    for i in range(1, 5):
        c = Customer.objects.create(customer_id=f"CUS-S{i:04d}", branch=sanjose, customer_name=f"Sanjo{i} Reyes",
                                    first_name=f"Sanjo{i}", last_name="Reyes", email=f"sanjo{i}@example.com")
        Pet.objects.create(pet_id=f"PET-S{i:05d}", customer=c, pet_name=f"Kitty{i}", species="Cat")


def ids(resp):
    return [p["id"] for p in resp.data["results"]]


def test_without_page_params_the_plain_array_is_kept(admin, herd):
    r = client_for(admin).get("/api/patients/")
    assert isinstance(r.data, list) and len(r.data) == 34


def test_envelope_and_page_walk(admin, herd):
    c = client_for(admin)
    p1 = c.get("/api/patients/?page=1&pageSize=25").data
    p2 = c.get("/api/patients/?page=2&pageSize=25").data
    assert (p1["count"], p1["totalPages"], p1["page"], p1["pageSize"]) == (34, 2, 1, 25)
    assert len(p1["results"]) == 25 and len(p2["results"]) == 9
    seen = [p["id"] for p in p1["results"]] + [p["id"] for p in p2["results"]]
    assert len(set(seen)) == 34  # no row repeated or skipped between pages


def test_page_size_defaults_and_is_capped(admin, herd):
    c = client_for(admin)
    assert c.get("/api/patients/?page=1").data["pageSize"] == 25
    assert c.get("/api/patients/?pageSize=100000").data["pageSize"] == 100


def test_bad_paging_values_are_400_and_late_pages_clamp(admin, herd):
    c = client_for(admin)
    for qs in ("page=0", "page=-1", "page=abc", "pageSize=0", "pageSize=x"):
        assert c.get(f"/api/patients/?{qs}").status_code == 400, qs
    late = c.get("/api/patients/?page=99&pageSize=25").data
    assert late["page"] == 2 and len(late["results"]) == 9


def test_search_matches_every_word_across_pet_and_owner(admin, herd):
    c = client_for(admin)
    assert ids(c.get("/api/patients/?page=1&q=pet07")) == ["PET-I00007"]
    assert ids(c.get("/api/patients/?page=1&q=owner07 cruz")) == ["PET-I00007"]
    assert c.get("/api/patients/?page=1&q=cruz").data["count"] == 30
    assert ids(c.get("/api/patients/?page=1&q=sanjo2@example")) == ["PET-S00002"]
    assert c.get("/api/patients/?page=1&q=nobody-here").data["count"] == 0


def test_status_and_branch_filters(admin, herd):
    c = client_for(admin)
    assert c.get("/api/patients/?page=1&status=Follow-up needed").data["count"] == 3
    assert c.get("/api/patients/?page=1&status=Follow-up needed,Active&branch=Ibaan").data["count"] == 30
    assert c.get("/api/patients/?page=1&branch=San Jose").data["count"] == 4
    # No registration dates in this fixture, so newest-first falls back to the highest id first.
    assert ids(c.get("/api/patients/?page=1&pageSize=3&branch=Ibaan")) == ["PET-I00030", "PET-I00029", "PET-I00028"]


def test_stats_ignore_search_but_follow_branch(admin, staff_ibaan, herd):
    ibaan_pet = Pet.objects.get(pk="PET-I00010")
    MedicalRecord.objects.create(record_id="MR-00000001", pet=ibaan_pet, branch=ibaan_pet.customer.branch,
                                 record_date=date.today())
    r = client_for(admin).get("/api/patients/?page=1&q=pet01").data
    assert {k: r["stats"][k] for k in ("total", "followUpNeeded", "activeThisMonth")} == {
        "total": 34, "followUpNeeded": 3, "activeThisMonth": 1
    }
    scoped = client_for(staff_ibaan).get("/api/patients/?page=1").data
    assert scoped["count"] == 30 and scoped["stats"]["total"] == 30  # staff never see San Jose rows


def test_list_rows_leave_out_images_but_detail_has_them(admin, herd):
    pet = Pet.objects.get(pk="PET-I00001")
    MedicalRecord.objects.create(record_id="MR-00000002", pet=pet, branch=pet.customer.branch,
                                 record_date=date(2026, 9, 1), blood_test_image="data:image/png;base64,AAAA",
                                 waiver_image="data:image/png;base64,BBBB")
    c = client_for(admin)
    row = c.get("/api/patients/?page=1&q=pet01").data["results"][0]
    assert row["consultations"][0]["bloodTestImage"] is None and row["consultations"][0]["waiverImage"] is None
    full = c.get("/api/patients/PET-I00001/").data["consultations"][0]
    assert full["bloodTestImage"].endswith("AAAA") and full["waiverImage"].endswith("BBBB")


def test_sales_inventory_and_posts_paginate(admin, staff_ibaan, stocked):
    c = client_for(staff_ibaan)
    for _ in range(3):
        assert c.post("/api/sales/", {"items": [{"inventoryId": "INV-000001", "quantity": 1, "price": 250}]}).status_code == 201
    s = c.get("/api/sales/?page=1&pageSize=2").data
    assert (s["count"], s["totalPages"], len(s["results"])) == (3, 2, 2)

    inv = client_for(admin).get("/api/inventory/?page=1&pageSize=1").data
    assert inv["count"] == 2 and len(inv["results"]) == 1
    assert client_for(admin).get("/api/inventory/?page=1&q=dog").data["count"] == 2
    assert client_for(admin).get("/api/inventory/?page=1&q=cat").data["count"] == 0

    for i in range(5):
        EventPost.objects.create(author=admin, author_name="A", text=f"post {i}")
    p = client_for(admin).get("/api/events/posts/?page=2&pageSize=2").data
    assert (p["count"], p["totalPages"], len(p["results"])) == (5, 3, 2)


def test_last_visit_is_the_latest_consultation_or_service_visit(admin, herd, branches):
    from sales.models import ServiceTransaction

    pet = Pet.objects.get(pk="PET-I00001")
    MedicalRecord.objects.create(record_id="MR-00000003", pet=pet, branch=branches[0], record_date=date(2026, 3, 1))
    ServiceTransaction.objects.create(service_txn_id="SV-I-000001", branch=branches[0], customer=pet.customer, pet=pet,
                                      txn_date=date(2026, 6, 15), total_amount=100, payment_status="Paid")
    c = client_for(admin)
    assert c.get("/api/patients/PET-I00001/").data["lastVisit"] == "2026-06-15"
    rows = {p["id"]: p for p in c.get("/api/patients/?page=1&q=pet0").data["results"]}
    assert rows["PET-I00001"]["lastVisit"] == "2026-06-15" and rows["PET-I00002"]["lastVisit"] == ""


def test_year_filters_and_year_list(admin, herd, branches):
    from datetime import datetime, timezone

    from sales.models import ServiceTransaction

    Pet.objects.filter(pk__in=["PET-I00001", "PET-I00002"]).update(created_at=datetime(2023, 5, 1, tzinfo=timezone.utc))
    Pet.objects.exclude(pk__in=["PET-I00001", "PET-I00002"]).update(created_at=datetime(2025, 5, 1, tzinfo=timezone.utc))
    pet = Pet.objects.get(pk="PET-I00003")
    ServiceTransaction.objects.create(service_txn_id="SV-I-000001", branch=branches[0], customer=pet.customer, pet=pet,
                                      txn_date=date(2024, 2, 2), total_amount=1, payment_status="Paid")
    MedicalRecord.objects.create(record_id="MR-00000004", pet=Pet.objects.get(pk="PET-I00004"), branch=branches[0],
                                 record_date=date(2024, 8, 8))
    c = client_for(admin)
    assert sorted(ids(c.get("/api/patients/?page=1&year=2023"))) == ["PET-I00001", "PET-I00002"]
    assert c.get("/api/patients/?page=1&year=2025").data["count"] == 32
    assert sorted(ids(c.get("/api/patients/?page=1&visitYear=2024"))) == ["PET-I00003", "PET-I00004"]
    assert ids(c.get("/api/patients/?page=1&year=2025&visitYear=2024&q=pet03")) == ["PET-I00003"]
    assert c.get("/api/patients/?page=1&year=2019").data["count"] == 0
    assert c.get("/api/patients/?page=1&pageSize=1").data["stats"]["years"] == [2025, 2023]
    assert c.get("/api/patients/?page=1&year=abc").status_code == 400
