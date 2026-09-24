from clinic.models import MedicalRecord, Pet

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


def test_branch_scoping(staff_ibaan, staff_sanjose):
    pid = client_for(staff_ibaan).post("/api/patients/", PATIENT).data["id"]
    other = client_for(staff_sanjose)
    assert other.get("/api/patients/").data == []
    assert other.get(f"/api/patients/{pid}/").status_code == 404


def test_follow_up_lifecycle(staff_ibaan):
    c = client_for(staff_ibaan)
    pid = c.post("/api/patients/", PATIENT).data["id"]
    r = c.post(f"/api/patients/{pid}/consultations/", consult(followUp=True, followUpNote="Vaccination"))
    assert r.data["status"] == "Follow-up needed" and r.data["followUpNote"] == "Vaccination"
    # A different service does not resolve it...
    r = c.post(f"/api/patients/{pid}/consultations/",
               consult(availedItems=[{"type": "Service", "name": "Grooming", "price": 100}]))
    assert r.data["status"] == "Follow-up needed"
    # ...the due service does.
    r = c.post(f"/api/patients/{pid}/consultations/",
               consult(availedItems=[{"type": "Service", "name": "Vaccination", "price": 300}]))
    assert r.data["status"] == "Active" and r.data["followUpNote"] == ""
    assert len(r.data["consultations"]) == 3 and r.data["consultations"][2]["totalPrice"] == 300


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
