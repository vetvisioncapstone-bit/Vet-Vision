from datetime import date, timedelta

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Exists, F, Max, OuterRef, Prefetch, Q, Subquery
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import record
from accounts.models import User
from accounts.views import revoke_sessions
from core.ids import branch_letter, next_id
from core.pagination import paginate, wants_page
from core.validators import data_url
from core.permissions import IsAdmin, IsClinicStaff, IsCustomer, branch_by_town, scope_branch

from sales.models import ServiceDetail, ServiceTransaction

from .models import Branch, Customer, MedicalRecord, Pet, Staff

FOLLOW_UP = "Follow-up needed"


def _age(dob):
    if not dob:
        return ""
    today = date.today()
    return max(0, today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day)))


def _split_name(customer):
    if customer.first_name or customer.last_name:
        return customer.first_name or "", customer.last_name or ""
    parts = (customer.customer_name or "").rsplit(" ", 1)
    return (parts[0], parts[1]) if len(parts) == 2 else (parts[0], "")


def consultation_row(r, light=False):
    """`light` leaves out the attached images (large base64 strings); the detail endpoint returns them."""
    return {
        "id": r.record_id,
        "date": r.record_date.isoformat(),
        "weight": r.weight or "",
        "notes": r.treatment or "",
        "services": r.services or "",
        "availedItems": r.availed_items or [],
        "totalPrice": float(r.total_price or 0),
        "remarks": r.remarks or "",
        "bloodTestImage": None if light else r.blood_test_image,
        "bloodTestName": r.blood_test_name or "",
        "waiverImage": None if light else r.waiver_image,
        "waiverName": r.waiver_name or "",
        "followUp": r.follow_up,
        "followUpNote": r.follow_up_note or "",
    }


def _last_visit(pet):
    """ISO date of the most recent visit (consultation or service transaction), or '' when there is none."""
    dates = [d for d in (getattr(pet, "last_record", None), getattr(pet, "last_service", None)) if d]
    return max(dates).isoformat() if dates else ""


def patient_row(pet, light=False):
    c = pet.customer
    first, last = _split_name(c)
    created = pet.created_at.date() if pet.created_at else c.date_registered
    return {
        "id": pet.pet_id,
        "ownerId": c.customer_id,
        "ownerName": first,
        "ownerSurname": last,
        "ownerEmail": c.email or "",
        "ownerAddress": c.address or "",
        "ownerMobile": c.contact_no or "",
        "petName": pet.pet_name,
        "petSpecie": pet.species or "",
        "petBreed": pet.breed or "",
        "petSex": pet.sex or "",
        "petDob": pet.date_of_birth.isoformat() if pet.date_of_birth else "",
        "petAge": _age(pet.date_of_birth),
        "petMarking": pet.color_marking or "",
        "branch": c.branch.town,
        "status": pet.status,
        "followUpNote": pet.follow_up_note or "",
        "createdAt": created.isoformat() if created else "",
        "lastVisit": _last_visit(pet),
        "consultations": [consultation_row(r, light) for r in pet.records.all()],
    }


def _year_param(request, name):
    raw = request.query_params.get(name)
    if not raw:
        return None
    if not raw.isdigit() or not 1900 <= int(raw) <= 2200:
        raise serializers.ValidationError({name: "Enter a four-digit year."})
    return int(raw)


def _registered_in(year):
    """Pets first registered in `year`. Older rows have no created_at, so fall back to the owner's join date."""
    return Q(created_at__year=year) | Q(created_at__isnull=True, customer__date_registered__year=year)


def _visited_in(year):
    """Pets with a consultation or a legacy service visit in `year`."""
    return Q(Exists(MedicalRecord.objects.filter(pet=OuterRef("pk"), record_date__year=year))) | Q(
        Exists(ServiceTransaction.objects.filter(pet=OuterRef("pk"), txn_date__year=year))
    )


def _pets(request, light=False):
    records = MedicalRecord.objects.order_by("record_date", "record_id")
    if light:
        records = records.defer("blood_test_image", "waiver_image")
    qs = (
        Pet.objects.select_related("customer__branch")
        .prefetch_related(Prefetch("records", queryset=records))
        # Most recent visit of any kind: a consultation record or a service transaction. Two separate subqueries:
        # aggregating both relations in one join multiplies their rows against each other and is very slow.
        .annotate(
            last_record=Subquery(
                MedicalRecord.objects.filter(pet=OuterRef("pk")).order_by("-record_date").values("record_date")[:1]
            ),
            last_service=Subquery(
                ServiceTransaction.objects.filter(pet=OuterRef("pk")).order_by("-txn_date").values("txn_date")[:1]
            ),
        )
    )
    qs = scope_branch(qs, request.user, field="customer__branch_id", requested_town=request.query_params.get("branch"))
    statuses = [x for x in request.query_params.get("status", "").split(",") if x]
    if statuses:
        qs = qs.filter(status__in=statuses)
    # Every word must match the pet name or something about the owner ("juan santos" finds Juan Santos).
    for term in request.query_params.get("q", "").split():
        qs = qs.filter(
            Q(pet_name__icontains=term) | Q(customer__customer_name__icontains=term)
            | Q(customer__first_name__icontains=term) | Q(customer__last_name__icontains=term)
            | Q(customer__email__icontains=term) | Q(customer__contact_no__icontains=term)
        )
    year = _year_param(request, "year")
    if year:
        qs = qs.filter(_registered_in(year))
    visit_year = _year_param(request, "visitYear")
    if visit_year:
        qs = qs.filter(_visited_in(visit_year))
    return qs.order_by(F("created_at").desc(nulls_last=True), "-pet_id")


def _patient_stats(request):
    """Headline counts for the branch the caller can see. They ignore the search and status filters on purpose,
    so the cards do not change while typing in the search box."""
    base = scope_branch(
        Pet.objects.all(), request.user, field="customer__branch_id", requested_town=request.query_params.get("branch")
    )
    # "This month" means the month of the most recent recorded visit, so the card still means something when the
    # history ends before today (as the imported clinic data does). Once visits are being recorded, it is the
    # current month.
    anchor = MedicalRecord.objects.aggregate(d=Max("record_date"))["d"] or date.today()
    visited_this_month = MedicalRecord.objects.filter(
        pet=OuterRef("pk"), record_date__year=anchor.year, record_date__month=anchor.month
    )
    # Years the "Registered in" / "Visited in" pickers offer. Registration years are cheap to collect and, for this
    # clinic's data, span the same range as the visit history.
    years = {d.year for d in base.dates("created_at", "year")}
    years |= {d.year for d in base.filter(created_at__isnull=True).dates("customer__date_registered", "year")}
    return {
        "years": sorted(years, reverse=True),
        "total": base.count(),
        "followUpNeeded": base.filter(status=FOLLOW_UP).count(),
        "activeThisMonth": base.filter(status="Active").filter(Exists(visited_this_month)).count(),
    }


class PatientInput(serializers.Serializer):
    ownerName = serializers.CharField(max_length=60)
    ownerSurname = serializers.CharField(max_length=60)
    ownerEmail = serializers.EmailField(max_length=100)
    ownerAddress = serializers.CharField(max_length=120)
    ownerMobile = serializers.CharField(max_length=20)
    petName = serializers.CharField(max_length=40)
    petSpecie = serializers.CharField(max_length=15)
    petBreed = serializers.CharField(max_length=40)
    petSex = serializers.CharField(max_length=10)
    petDob = serializers.DateField()
    petAge = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    petMarking = serializers.CharField(max_length=40)
    branch = serializers.CharField(required=False)


def _apply_owner(customer, d):
    customer.first_name = d["ownerName"].strip()
    customer.last_name = d["ownerSurname"].strip()
    customer.customer_name = f"{customer.first_name} {customer.last_name}".strip()[:80]
    customer.email = d["ownerEmail"].strip().lower()
    customer.address = d["ownerAddress"].strip()
    customer.contact_no = d["ownerMobile"].strip()


def _apply_pet(pet, d):
    pet.pet_name = d["petName"].strip()
    pet.species = d["petSpecie"]
    pet.breed = d["petBreed"].strip()
    pet.sex = d["petSex"]
    pet.date_of_birth = d["petDob"]
    pet.color_marking = d["petMarking"].strip()


EMAIL_TAKEN = {"ownerEmail": "That owner email is already registered to another owner."}


class PatientList(APIView):
    permission_classes = [IsClinicStaff]

    def get(self, request):
        if wants_page(request):
            return paginate(request, _pets(request, light=True), lambda p: patient_row(p, light=True),
                            extra={"stats": _patient_stats(request)})
        return Response([patient_row(p) for p in _pets(request)])

    @transaction.atomic
    def post(self, request):
        s = PatientInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        user = request.user
        branch = user.staff.branch if user.role == "staff" else branch_by_town(d.get("branch") or "")
        email = d["ownerEmail"].strip().lower()
        if Customer.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(EMAIL_TAKEN)
        letter = branch_letter(branch.branch_id)
        customer = Customer(
            customer_id=next_id(Customer, "customer_id", f"CUS-{letter}", 4),
            branch=branch,
            date_registered=date.today(),
        )
        _apply_owner(customer, d)
        customer.save()
        pet = Pet(pet_id=next_id(Pet, "pet_id", f"PET-{letter}", 5), customer=customer, status="Active")
        _apply_pet(pet, d)
        pet.save()
        return Response(patient_row(_pets(request).get(pk=pet.pk)), status=status.HTTP_201_CREATED)


class PatientDetail(APIView):
    permission_classes = [IsClinicStaff]

    def _get(self, request, pk):
        pet = _pets(request).filter(pk=pk).first()
        if pet is None:
            raise NotFound()
        return pet

    def get(self, request, pk):
        return Response(patient_row(self._get(request, pk)))

    @transaction.atomic
    def put(self, request, pk):
        pet = self._get(request, pk)
        s = PatientInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        customer = pet.customer
        email = d["ownerEmail"].strip().lower()
        if Customer.objects.filter(email__iexact=email).exclude(pk=customer.pk).exists():
            raise serializers.ValidationError(EMAIL_TAKEN)
        _apply_owner(customer, d)
        if request.user.role == "admin" and d.get("branch"):
            customer.branch = branch_by_town(d["branch"])
        customer.save()
        _apply_pet(pet, d)
        pet.save()
        return Response(patient_row(_pets(request).get(pk=pet.pk)))

    patch = put

    def delete(self, request, pk):
        if request.user.role != "admin":
            raise PermissionDenied("Staff must submit a delete request for admin approval.")
        pet = self._get(request, pk)
        record(request, "patient.delete", target=pet.pet_id)
        pet.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConsultationInput(serializers.Serializer):
    date = serializers.DateField()
    weight = serializers.CharField(required=False, allow_blank=True, max_length=40)
    notes = serializers.CharField(allow_blank=False)
    services = serializers.CharField(required=False, allow_blank=True)
    availedItems = serializers.ListField(child=serializers.DictField(), required=False)
    totalPrice = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=0)
    remarks = serializers.CharField(required=False, allow_blank=True)
    bloodTestImage = serializers.CharField(required=False, allow_null=True, allow_blank=True, validators=[data_url])
    bloodTestName = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=200)
    waiverImage = serializers.CharField(required=False, allow_null=True, allow_blank=True, validators=[data_url])
    waiverName = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=200)
    followUp = serializers.BooleanField(required=False, default=False)
    followUpNote = serializers.CharField(required=False, allow_blank=True, max_length=200)


class ConsultationCreate(APIView):
    permission_classes = [IsClinicStaff]

    @transaction.atomic
    def post(self, request, pk):
        pet = _pets(request).filter(pk=pk).first()
        if pet is None:
            raise NotFound()
        s = ConsultationInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        follow_up = d.get("followUp", False)
        note = (d.get("followUpNote") or "").strip() if follow_up else ""
        if follow_up and not note:
            raise serializers.ValidationError({"followUpNote": "Say what the follow-up is for."})
        items = d.get("availedItems", [])
        MedicalRecord.objects.create(
            record_id=next_id(MedicalRecord, "record_id", "MR-", 8),
            pet=pet,
            branch=pet.customer.branch,
            staff=request.user.staff if request.user.staff_id else None,
            record_date=d["date"],
            record_type="Consultation",
            treatment=d["notes"].strip(),
            remarks=(d.get("remarks") or "").strip() or None,
            weight=(d.get("weight") or "").strip() or None,
            services=d.get("services") or None,
            availed_items=items,
            total_price=d.get("totalPrice", sum(float(i.get("price") or 0) for i in items)),
            blood_test_image=d.get("bloodTestImage") or None,
            blood_test_name=d.get("bloodTestName") or None,
            waiver_image=d.get("waiverImage") or None,
            waiver_name=d.get("waiverName") or None,
            follow_up=follow_up,
            follow_up_note=note or None,
        )
        if follow_up:
            pet.status, pet.follow_up_note = FOLLOW_UP, note
        elif pet.status == FOLLOW_UP and any(
            i.get("type") == "Service" and i.get("name") == pet.follow_up_note for i in items
        ):
            # Resolved only when the very service that was due got availed on this visit.
            pet.status, pet.follow_up_note = "Active", None
        pet.save(update_fields=["status", "follow_up_note"])
        return Response(patient_row(_pets(request).get(pk=pet.pk)), status=status.HTTP_201_CREATED)


class ConsultationDetail(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, pk):
        rec = MedicalRecord.objects.filter(pk=pk).first()
        if rec is None:
            raise NotFound()
        record(request, "consultation.delete", target=rec.pk)
        rec.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------- staff accounts (admin only) ----------------


def staff_row(st):
    user = getattr(st, "user", None)
    return {
        "id": st.staff_id,
        "name": st.staff_name,
        "address": st.address or "",
        "email": user.email if user else (st.email or ""),
        "mobile": st.mobile or "",
        "branch": st.branch.town,
        "position": st.role,
        "photo": user.photo if user and user.photo else st.photo,
        "role": "Staff",
        "lastLogin": st.last_login.isoformat() if st.last_login else "Never",
        "hasLogin": bool(user),
    }


class StaffInput(serializers.Serializer):
    name = serializers.CharField(max_length=60)
    address = serializers.CharField(max_length=160, required=False, allow_blank=True)
    email = serializers.EmailField()
    mobile = serializers.CharField(max_length=30, required=False, allow_blank=True)
    branch = serializers.CharField()
    position = serializers.CharField(max_length=40)
    photo = serializers.CharField(required=False, allow_null=True, allow_blank=True, validators=[data_url])
    password = serializers.CharField(required=False, allow_blank=True)


def _validate_email_domain(email):
    if not email.lower().endswith("@ecovet.ph"):
        raise serializers.ValidationError({"email": "Staff emails must end in @ecovet.ph."})


def _validated_password(raw, user=None):
    try:
        validate_password(raw, user)
    except DjangoValidationError as e:
        raise serializers.ValidationError({"password": list(e.messages)})


def _staff_qs():
    return Staff.objects.select_related("branch", "user").filter(is_active=True).order_by("staff_id")


class StaffList(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response([staff_row(s) for s in _staff_qs()])

    @transaction.atomic
    def post(self, request):
        s = StaffInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        email = d["email"].strip().lower()
        _validate_email_domain(email)
        if not d.get("password"):
            raise serializers.ValidationError({"password": "A password is required for a new account."})
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError({"email": "That email is already in use."})
        _validated_password(d["password"])
        branch = branch_by_town(d["branch"])
        st = Staff.objects.create(
            staff_id=next_id(Staff, "staff_id", "STF-", 3),
            branch=branch,
            staff_name=d["name"].strip(),
            role=d["position"],
            email=email,
            address=d.get("address") or None,
            mobile=d.get("mobile") or None,
            photo=d.get("photo") or None,
            is_active=True,
        )
        User.objects.create_user(
            email=email, password=d["password"], name=st.staff_name, role=User.ROLE_STAFF,
            photo=d.get("photo") or None, staff=st,
        )
        record(request, "staff.create", target=st.staff_id)
        return Response(staff_row(_staff_qs().get(pk=st.pk)), status=status.HTTP_201_CREATED)


class StaffDetail(APIView):
    permission_classes = [IsAdmin]

    def _get(self, pk):
        st = _staff_qs().filter(pk=pk).first()
        if st is None:
            raise NotFound()
        return st

    @transaction.atomic
    def put(self, request, pk):
        st = self._get(pk)
        s = StaffInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        email = d["email"].strip().lower()
        _validate_email_domain(email)
        user = getattr(st, "user", None)
        if User.objects.filter(email=email).exclude(pk=user.pk if user else None).exists():
            raise serializers.ValidationError({"email": "That email is already in use."})
        st.staff_name = d["name"].strip()
        st.role = d["position"]
        st.email = email
        st.address = d.get("address") or None
        st.mobile = d.get("mobile") or None
        st.branch = branch_by_town(d["branch"])
        if "photo" in d:
            st.photo = d["photo"] or None
        st.save()
        if user is None:
            if not d.get("password"):
                raise serializers.ValidationError({"password": "Set a password to create this person's login."})
            _validated_password(d["password"])
            user = User.objects.create_user(
                email=email, password=d["password"], name=st.staff_name, role=User.ROLE_STAFF, staff=st
            )
        user.email, user.name = email, st.staff_name
        if "photo" in d:
            user.photo = d["photo"] or None
        if d.get("password"):
            _validated_password(d["password"], user)
            user.set_password(d["password"])
            revoke_sessions(user)  # an admin reset signs that person out everywhere
        user.save()
        record(request, "staff.update", target=st.staff_id, detail="password reset" if d.get("password") else "")
        return Response(staff_row(_staff_qs().get(pk=st.pk)))

    patch = put

    @transaction.atomic
    def delete(self, request, pk):
        # Deactivate instead of deleting so historical sales/consultations keep their attribution.
        st = self._get(pk)
        st.is_active = False
        st.save(update_fields=["is_active"])
        User.objects.filter(staff=st).update(is_active=False)
        record(request, "staff.deactivate", target=st.staff_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BranchList(APIView):
    def get(self, request):
        return Response(
            [
                {"id": b.branch_id, "name": b.branch_name, "town": b.town, "address": b.address}
                for b in Branch.objects.order_by("branch_id")
            ]
        )


class OwnPetInput(serializers.Serializer):
    petName = serializers.CharField(max_length=40)
    petSpecie = serializers.CharField(max_length=15)
    petBreed = serializers.CharField(max_length=40, required=False, allow_blank=True)
    petSex = serializers.CharField(max_length=10)
    petDob = serializers.DateField()
    petMarking = serializers.CharField(max_length=40, required=False, allow_blank=True)

    def validate_petDob(self, value):
        if value > date.today():
            raise serializers.ValidationError("The date of birth cannot be in the future.")
        return value


class MyPets(APIView):
    """The signed-in pet owner's own pets, each with its history (newest visit first).

    History merges two sources: consultations recorded in the app (medical_record) and the clinic's
    service transactions from the legacy data (each with its billed services)."""

    permission_classes = [IsCustomer]

    def get(self, request):
        records = Prefetch("records", queryset=MedicalRecord.objects.order_by("-record_date", "-record_id"))
        txns = Prefetch(
            "servicetransaction_set",
            queryset=ServiceTransaction.objects.order_by("-txn_date", "-service_txn_id").prefetch_related(
                "details__service"
            ),
        )
        pets = (
            Pet.objects.filter(customer_id=request.user.customer_id)
            .prefetch_related(records, txns)
            .order_by("pet_name")
        )
        return Response([_my_pet_row(p) for p in pets])

    @transaction.atomic
    def post(self, request):
        """The owner registers one of their own pets."""
        s = OwnPetInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        customer = request.user.customer
        pet = Pet(pet_id=next_id(Pet, "pet_id", f"PET-{branch_letter(customer.branch_id)}", 5), customer=customer,
                  status="Active", pet_name=d["petName"].strip(), species=d["petSpecie"], sex=d["petSex"],
                  breed=(d.get("petBreed") or "").strip(), date_of_birth=d["petDob"],
                  color_marking=(d.get("petMarking") or "").strip())
        pet.save()
        record(request, "pet.register", target=pet.pet_id)
        return Response(_my_pet_row(pet), status=status.HTTP_201_CREATED)


class MyReminders(APIView):
    """Things the owner should act on: a follow-up the vet asked for, and yearly vaccine boosters that are due
    (within 30 days, or overdue by up to a year). Newest concern first."""

    permission_classes = [IsCustomer]
    BOOSTER_DAYS = 365
    WARN_DAYS = 30
    LAPSED_DAYS = 365  # overdue by more than a year: the pet has likely moved on, so stop nagging

    def get(self, request):
        today = date.today()
        pets = {p.pet_id: p for p in Pet.objects.filter(customer_id=request.user.customer_id)}
        out = []

        latest = {}
        for r in MedicalRecord.objects.filter(pet_id__in=pets).order_by("record_date", "record_id"):
            latest[r.pet_id] = r  # ends on each pet's most recent record
        for pet_id, r in latest.items():
            if r.follow_up:
                out.append({
                    "id": f"follow_up-{pet_id}", "kind": "follow_up", "petId": pet_id, "petName": pets[pet_id].pet_name,
                    "title": "Follow-up visit needed", "dueDate": r.record_date.isoformat(), "overdue": False,
                    "text": r.follow_up_note or "The vet asked you to bring your pet back for a check.",
                })

        last_vaccine = {}
        shots = (ServiceDetail.objects.filter(service_txn__pet_id__in=pets, service__category="VACCINES")
                 .exclude(service__service_name__icontains="CARD")  # a vaccination card is not a vaccine
                 .values_list("service_txn__pet_id", "service_txn__txn_date").order_by("service_txn__txn_date"))
        for pet_id, given in shots:
            last_vaccine[pet_id] = given
        for pet_id, given in last_vaccine.items():
            due = given + timedelta(days=self.BOOSTER_DAYS)
            if today - timedelta(days=self.LAPSED_DAYS) <= due <= today + timedelta(days=self.WARN_DAYS):
                out.append({
                    "id": f"vaccination-{pet_id}", "kind": "vaccination", "petId": pet_id,
                    "petName": pets[pet_id].pet_name, "title": "Vaccine booster due", "dueDate": due.isoformat(),
                    "overdue": due < today,
                    "text": f"{pets[pet_id].pet_name} was last vaccinated on {given:%b %d, %Y}. The yearly booster "
                            f"{'was due' if due < today else 'is due'} {due:%b %d, %Y}.",
                })
        out.sort(key=lambda r: r["dueDate"])
        return Response(out)


def _consultation_visit(r):
    return {
        "id": r.record_id,
        "date": r.record_date.isoformat(),
        "type": r.record_type or "Consultation",
        "diagnosis": r.diagnosis or "",
        "treatment": r.treatment or "",
        "services": r.services or "",
        "availedItems": r.availed_items or [],
        "totalPrice": float(r.total_price or 0),
        "weight": r.weight or "",
        "remarks": r.remarks or "",
        "followUp": r.follow_up,
        "followUpNote": r.follow_up_note or "",
    }


def _service_visit(t):
    details = list(t.details.all())
    return {
        "id": t.service_txn_id,
        "date": t.txn_date.isoformat(),
        "type": "Clinic visit",
        "diagnosis": "",
        "treatment": "",
        "services": ", ".join(d.service.service_name for d in details),
        "availedItems": [],
        "totalPrice": float(t.total_amount or 0),
        "weight": f"{t.weight_kg.normalize():f} kg" if t.weight_kg else "",
        "remarks": "; ".join(d.remarks for d in details if d.remarks),
        "followUp": False,
        "followUpNote": "",
    }


def _my_pet_row(pet):
    records = list(pet.records.all())
    visits = [_consultation_visit(r) for r in records]
    # Transactions that were turned into records (seed_medical_records) are already listed above.
    seeded = {r.source_txn_id for r in records if r.source_txn_id}
    visits += [_service_visit(t) for t in pet.servicetransaction_set.all() if t.service_txn_id not in seeded]
    visits.sort(key=lambda v: (v["date"], v["id"]), reverse=True)
    return {
        "id": pet.pet_id,
        "name": pet.pet_name,
        "species": pet.species or "",
        "breed": pet.breed or "",
        "sex": pet.sex or "",
        "age": _age(pet.date_of_birth),
        "dob": pet.date_of_birth.isoformat() if pet.date_of_birth else "",
        "color": pet.color_marking or "",
        "status": pet.status,
        "followUpNote": pet.follow_up_note or "",
        "lastCheckup": visits[0]["date"] if visits else "",
        "visits": visits,
    }
