from datetime import date

from django.core.management import call_command

from clinic.models import Customer, MedicalRecord, Pet, Staff


def test_seed_prescriptions_fills_only_untouched_treatment_visits(branches):
    ibaan = branches[0]
    owner = Customer.objects.create(customer_id="CUS-I0001", branch=ibaan, customer_name="Owner")
    pet = Pet.objects.create(pet_id="PET-I00001", customer=owner, pet_name="Bantay", species="Dog")
    Staff.objects.create(staff_id="STF-003", branch=ibaan, staff_name="Vet One", role="Veterinarian")

    def rec(n, kind, services, **extra):
        return MedicalRecord.objects.create(record_id=f"MR-{n:08d}", pet=pet, branch=ibaan, record_date=date(2026, 7, 1),
                                            record_type=kind, services=services, weight="12 kg", **extra)

    ear = rec(1, "Consultation", "EAR SWAB DX, 400 PF")
    groom = rec(2, "Grooming", "FULL GROOM SMALL")
    typed = rec(3, "Treatment", "SMALL INJ", diagnosis="Typed by the vet")
    call_command("seed_prescriptions")

    ear.refresh_from_db(), groom.refresh_from_db(), typed.refresh_from_db()
    assert ear.diagnosis == "Otitis externa" and "OTIDERM EAR DROPS" in ear.prescription["rx"]
    assert ear.prescription["veterinarian"] == "Vet One" and ear.prescription["nextAppointment"] == "2026-07-08"
    assert ear.prescription["licenseNo"] == "" and ear.prescription["ptr"] == ""  # never invented
    assert groom.prescription is None and typed.prescription is None and typed.diagnosis == "Typed by the vet"
