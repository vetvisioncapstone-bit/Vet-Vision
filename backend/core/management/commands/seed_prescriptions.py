"""Give past consultations a diagnosis and a prescription, so the Rx pad has history to print.

    python manage.py seed_prescriptions [--dry-run] [--seed 2026]

Rule-based on what each visit actually was: its services, lab results noted in the remarks, the pet's species and
weight, and any medicine bought at the visit (that medicine leads the prescription). Medicines are the clinic's own
products. Surgery, wound care, confinement, treatment and positive lab visits get one; about 60% of plain
consultations do; grooming and vaccination visits and normal / negative lab results do not.

The prescribing vet is the visit's vet when it was a veterinarian, else a veterinarian of that branch. License No.
and PTR are left blank: those are real professional numbers and are not invented here.

Only fills records with no diagnosis and no prescription, so it never overwrites what a vet typed. Seeded.
"""
import random
import re
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction

from clinic.models import MedicalRecord, Staff
from inventory.models import Product

MEDICINE = {"ANTIBIOTICS/PRESCRIPTION DRUGS", "S2 PRESCRIPTION DRUGS", "VITAMINS/MINERALS",
            "DEWORMING/ANTI-PARASITIC", "RC PRODUCTS/PRESCRIPTION DIET"}


def ml(kg, mg_per_kg, mg_per_ml):
    return f"{max(0.5, round(kg * mg_per_kg / mg_per_ml * 2) / 2):g} mL"


def caps(kg, small, big, cut=10):
    return big if kg > cut else small


def nexgard(kg, cat):
    if cat:
        return "NEXGARD COMBO CAT < 2.5KG" if kg < 2.5 else "NEXGARD COMBO CAT 2.5-7.5KG"
    return next(n for top, n in ((4, "NEXGARD 2 TO 4KG"), (10, "NEXGARD 4 TO 10KG"), (25, "NEXGARD 10 TO 25KG"),
                                 (99, "NEXGARD 25 TO 50KG")) if kg <= top)


# Each plan: (diagnosis, days to the next appointment, [rx lines]); a line is "PRODUCT #qty\nSig: directions".
def plans(kg, cat):
    abx = caps(kg, "CEFALEXIN CAPSULE 250MG", "CEFALEXIN CAPSULE 500MG")
    return {
        "spay_neuter": ("Post-operative care, routine sterilisation", 10, [
            f"{abx} #14\nSig: Give 1 capsule every 12 hours for 7 days",
            f"MELOXICAM SYRUP\nSig: Give {ml(kg, 0.1, 1.5)} once a day after meals for 3 days",
            "CHLORHEXIDINE WOUND SPRAY\nSig: Spray on the incision twice a day; keep the e-collar on until suture removal"]),
        "caesarean": ("Post-operative care after caesarean section", 7, [
            f"CO-AMOXICLAV SYRUP 312.5MG/5ML\nSig: Give {ml(kg, 12.5, 62.5)} every 12 hours for 7 days",
            f"MELOXICAM SYRUP\nSig: Give {ml(kg, 0.1, 1.5)} once a day after meals for 3 days",
            "NUTRICAL\nSig: Give 1 teaspoon twice a day while nursing"]),
        "wound": ("Wound / laceration", 5, [
            f"CO-AMOXICLAV SYRUP 312.5MG/5ML\nSig: Give {ml(kg, 12.5, 62.5)} every 12 hours for 7 days",
            "CHLORHEXIDINE WOUND SPRAY\nSig: Clean and spray the wound twice a day",
            "MUPIROCIN\nSig: Apply a thin layer on the wound twice a day"]),
        "parvo": ("Feline panleukopenia" if cat else "Canine parvoviral enteritis", 3, [
            "FLAGYZOL SYRUP\nSig: Give " + ml(kg, 15, 25) + " every 12 hours for 5 days",
            "METOCLOCARE\nSig: Give 30 minutes before meals, 3 times a day for 3 days",
            "PROBIOCARE\nSig: Mix 1 sachet with food once a day for 7 days",
            ("RC G.I POUCH CAT" if cat else "RC GASTRO CAN") + "\nSig: Small frequent meals of the prescription diet only"]),
        "blood_parasite": ("Blood parasitism (Ehrlichiosis), with mild anaemia", 14, [
            "DOXYTIC PET #28\nSig: Give 1 tablet every 12 hours for 28 days, with food",
            "HEMACARE-FE\nSig: Give " + ml(kg, 0.5, 1) + " once a day for 30 days",
            "LIV 52 SYRUP\nSig: Give 1 mL per 5 kg twice a day for 30 days"]),
        "heartworm": ("Heartworm disease", 30, [
            "DOXYTIC PET #28\nSig: Give 1 tablet every 12 hours for 28 days",
            "NEXGARD SPECTRA 3 TO 7.5KG\nSig: 1 chewable once a month" if kg <= 7.5
            else "NEXGARD SPECTRA 7.5 TO 15KG\nSig: 1 chewable once a month",
            "Strict cage rest; no running or rough play"]),
        "lepto": ("Leptospirosis (suspected)", 7, [
            "DOXYTIC PET #28\nSig: Give 1 tablet every 12 hours for 14 days",
            "HEPATOSURE\nSig: Give 1 tablet once a day for 30 days",
            "Wear gloves when cleaning urine; keep away from other pets"]),
        "distemper": ("Canine distemper (suspected)", 5, [
            f"CO-AMOXICLAV SYRUP 312.5MG/5ML\nSig: Give {ml(kg, 12.5, 62.5)} every 12 hours for 10 days",
            "PULMOQUIN SYRUP\nSig: Give 1 mL per 5 kg twice a day for 7 days",
            "IMMUNOL SYRUP\nSig: Give 1 mL per 5 kg once a day for 30 days",
            "NEUROVET TAB\nSig: Give 1 tablet once a day for 30 days"]),
        "ear": ("Otitis externa", 7, [
            "OTIDERM EAR DROPS\nSig: Instil 3-5 drops in the affected ear twice a day for 7 days",
            "EAR CARE\nSig: Clean the ears every 3 days before the drops",
            "CETIRIZINE SYRUP\nSig: Give " + ml(kg, 0.5, 1) + " once a day for 5 days"]),
        "fungal": ("Dermatophytosis (ringworm)", 14, [
            "ITRACONAZOLE\nSig: Give once a day for 21 days, with food",
            "MICODERM\nSig: Apply on the lesions twice a day",
            "Bathe with medicated shampoo twice a week; wash bedding"]),
        "mange": ("Dermatitis, mange (demodex / scabies)", 14, [
            nexgard(kg, cat) + "\nSig: 1 chewable now, repeat after 1 month",
            "TOPIDERM\nSig: Apply on the affected skin twice a day",
            "HEALTHY COAT TAB\nSig: Give 1 tablet once a day for 30 days"]),
        "worms": ("Intestinal parasitism", 14, [
            "CANIVERM\nSig: Give 1 tablet per 10 kg body weight now; repeat after 2 weeks",
            "PROBIOCARE\nSig: Mix 1 sachet with food once a day for 5 days"]),
        "uti": ("Urinary tract infection" if not cat else "Feline lower urinary tract disease", 7, [
            "ENRO TAB\nSig: Give once a day for 10 days",
            "URICARE\nSig: Give 1 capsule once a day for 30 days"]
            + (["RC URINARY S/O CAT POUCH\nSig: Feed the urinary diet only; more water"] if cat else [])),
        "kidney": ("Chronic kidney disease", 30, [
            "RENAL CARE\nSig: Give 1 tablet twice a day",
            "KETOANALOGUE TAB\nSig: Give 1 tablet per 5 kg once a day",
            ("RC RENAL CAN" if cat else "RC RENAL DOG FOOD 2KG") + "\nSig: Renal diet only; fresh water always"]),
        "liver": ("Elevated liver enzymes (hepatopathy)", 30, [
            "HEPATOSURE\nSig: Give 1 tablet once a day for 30 days",
            "LIV 52 SYRUP\nSig: Give 1 mL per 5 kg twice a day for 30 days"]),
        "anaemia": ("Anaemia", 14, [
            "HEMAFERVIT\nSig: Give " + ml(kg, 0.5, 1) + " once a day for 30 days",
            "FOLIC ACID TAB 5MG\nSig: Give 1 tablet once a day for 30 days"]),
        "respiratory": ("Feline upper respiratory infection" if cat else "Infectious tracheobronchitis (kennel cough)", 5, [
            "DOXYTIC PET #14\nSig: Give 1 tablet every 12 hours for 7 days",
            "AMBROXOL TAB\nSig: Give 1/2 tablet twice a day for 5 days",
            "PULMOQUIN SYRUP\nSig: Give 1 mL per 5 kg twice a day for 5 days"]),
        "tvt": ("Transmissible venereal tumour, on chemotherapy", 7, [
            "IMMUNOL SYRUP\nSig: Give 1 mL per 5 kg once a day",
            "LIV 52 SYRUP\nSig: Give 1 mL per 5 kg twice a day",
            "Next chemotherapy session in 1 week; CBC before each session"]),
        "gastro": ("Gastroenteritis", 3, [
            "METRO TAB\nSig: Give 1/2 tablet every 12 hours for 5 days",
            "METOCLOCARE\nSig: Give 30 minutes before meals, 3 times a day for 3 days",
            "PROBIOCARE\nSig: Mix 1 sachet with food once a day for 5 days"]),
        "ticks": ("Tick and flea infestation", 30, [
            nexgard(kg, cat) + "\nSig: 1 chewable once a month",
            "VENOMA SPRAY\nSig: Spray on the bedding and kennel once a week"]),
        "allergy": ("Allergic dermatitis", 7, [
            "PREDNISONE TAB 5MG\nSig: Give 1 tablet once a day for 5 days, then every other day for 5 days",
            "CETIRIZINE TAB\nSig: Give 1/2 tablet once a day for 7 days",
            "HEALTHY COAT TAB\nSig: Give 1 tablet once a day for 30 days"]),
        "eye": ("Conjunctivitis", 7, [
            "RAMITOB EYE DROPS\nSig: Instil 1 drop in the affected eye 4 times a day for 7 days",
            "EYE CARE\nSig: Wipe discharge before each dose"]),
        "pain": ("Musculoskeletal pain / sprain", 7, [
            f"MELOXICAM SYRUP\nSig: Give {ml(kg, 0.1, 1.5)} once a day after meals for 5 days",
            "GLUCOSAMINE\nSig: Give 1 tablet once a day for 30 days",
            "Leash walks only for 2 weeks"]),
    }


GENERAL = ["gastro", "ticks", "allergy", "eye", "pain", "ear", "worms", "respiratory"]


def pick(rec, cat, rng):
    """Which plan fits this visit, or None for no prescription."""
    text = f"{rec.services or ''} | {rec.remarks or ''}".upper()
    if rec.record_type in ("Grooming", "Vaccination"):
        return None
    if re.search(r"WITHIN NORMAL RANGE|NEGATIVE RESULT", text) and "POSITIVE" not in text:
        return None
    for pattern, plan in ((r"\bCS\b", "caesarean"), (r"OVH|CASTRATION", "spay_neuter"), (r"WOUND", "wound"),
                          (r"CHEMO", "tvt"), (r"CPV|FPV", "parvo"), (r"HEARTWORM|CHW", "heartworm"),
                          (r"BLOOD PARA|EPOETIN", "blood_parasite"), (r"LEPTO", "lepto"), (r"CDV", "distemper"),
                          (r"EAR SWAB", "ear"), (r"WOODS LAMP", "fungal"), (r"SKIN SCRAPE", "mange"),
                          (r"FECALYSIS", "worms"), (r"UTS DX|CATHETERIZATION", "uti"),
                          (r"NEBULIZATION|OXYGENATION", "respiratory"), (r"ANEMIA", "anaemia")):
        if re.search(pattern, text):
            return plan
    if re.search(r"CHEM 17|PANEL", text):
        return rng.choice(["kidney", "liver", "anaemia"])
    if rec.record_type == "Laboratory":
        return None if rng.random() < 0.5 else rng.choice(["anaemia", "liver"])
    if rec.record_type == "Confinement":
        return rng.choice(["gastro", "parvo", "respiratory"])
    if rec.record_type == "Consultation" and rng.random() > 0.6:
        return None
    return rng.choice(GENERAL)


class Command(BaseCommand):
    help = "Seed diagnoses and prescriptions on past consultations (only where none was entered)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--seed", type=int, default=2026)

    def handle(self, *args, dry_run, seed, **_):
        rng = random.Random(seed)
        vets = {}
        for s in Staff.objects.filter(role="Veterinarian").order_by("staff_id"):
            vets.setdefault(s.branch_id, []).append(s.staff_name)
        all_vets = [n for names in vets.values() for n in names]
        medicine = set(Product.objects.filter(category__in=MEDICINE).values_list("product_name", flat=True))

        todo = (MedicalRecord.objects.filter(prescription__isnull=True, diagnosis__isnull=True)
                .select_related("pet", "staff").order_by("record_date", "record_id")
                .only("record_id", "record_date", "record_type", "services", "remarks", "weight", "availed_items",
                      "branch_id", "pet__species", "staff__role", "staff__staff_name"))
        changed, counts = [], {}
        for rec in todo.iterator(chunk_size=2000):
            cat = (rec.pet.species or "").lower().startswith("cat")
            plan = pick(rec, cat, rng)
            if plan is None:
                continue
            m = re.search(r"\d+(?:\.\d+)?", rec.weight or "")
            kg = float(m.group()) if m else (4.0 if cat else 10.0)
            diagnosis, days, lines = plans(kg, cat)[plan]
            bought = [f"{i['name']} #{i.get('quantity', 1)}\nSig: As directed" for i in rec.availed_items or []
                      if i.get("type") == "Product" and i.get("name") in medicine]
            names = {line.split("\n")[0].split(" #")[0] for line in lines}
            vet = (rec.staff.staff_name if rec.staff and rec.staff.role == "Veterinarian"
                   else rng.choice(vets.get(rec.branch_id) or all_vets))
            rec.diagnosis = diagnosis
            rec.prescription = {
                "rx": "\n\n".join([b for b in bought if b.split(" #")[0] not in names] + lines),
                "nextAppointment": (rec.record_date + timedelta(days=days)).isoformat(),
                "veterinarian": vet, "licenseNo": "", "ptr": "",
            }
            changed.append(rec)
            counts[diagnosis] = counts.get(diagnosis, 0) + 1

        self.stdout.write(f"{len(changed)} prescriptions to add")
        for d, n in sorted(counts.items(), key=lambda x: -x[1]):
            self.stdout.write(f"  {n:5d}  {d}")
        if dry_run:
            if changed:
                self.stdout.write("sample:\n" + changed[len(changed) // 2].prescription["rx"])
            return
        with transaction.atomic():
            MedicalRecord.objects.bulk_update(changed, ["diagnosis", "prescription"], batch_size=1000)
        self.stdout.write(self.style.SUCCESS("done"))
