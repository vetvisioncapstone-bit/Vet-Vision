from datetime import date

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F, Prefetch
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from core.ids import branch_letter, next_id
from core.permissions import IsAdmin, IsClinicStaff, branch_by_town, scope_branch

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


def consultation_row(r):
    return {
        "id": r.record_id,
        "date": r.record_date.isoformat(),
        "weight": r.weight or "",
        "notes": r.treatment or "",
        "services": r.services or "",
        "availedItems": r.availed_items or [],
        "totalPrice": float(r.total_price or 0),
        "remarks": r.remarks or "",
        "bloodTestImage": r.blood_test_image,
        "bloodTestName": r.blood_test_name or "",
        "waiverImage": r.waiver_image,
        "waiverName": r.waiver_name or "",
        "followUp": r.follow_up,
        "followUpNote": r.follow_up_note or "",
    }


def patient_row(pet):
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
        "consultations": [consultation_row(r) for r in pet.records.all()],
    }


def _pets(request):
    records = Prefetch("records", queryset=MedicalRecord.objects.order_by("record_date", "record_id"))
    qs = Pet.objects.select_related("customer__branch").prefetch_related(records)
    qs = scope_branch(qs, request.user, field="customer__branch_id", requested_town=request.query_params.get("branch"))
    return qs.order_by(F("created_at").desc(nulls_last=True), "pet_id")


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
    bloodTestImage = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    bloodTestName = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=200)
    waiverImage = serializers.CharField(required=False, allow_null=True, allow_blank=True)
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
    photo = serializers.CharField(required=False, allow_null=True, allow_blank=True)
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
        user.save()
        return Response(staff_row(_staff_qs().get(pk=st.pk)))

    patch = put

    @transaction.atomic
    def delete(self, request, pk):
        # Deactivate instead of deleting so historical sales/consultations keep their attribution.
        st = self._get(pk)
        st.is_active = False
        st.save(update_fields=["is_active"])
        User.objects.filter(staff=st).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BranchList(APIView):
    def get(self, request):
        return Response(
            [
                {"id": b.branch_id, "name": b.branch_name, "town": b.town, "address": b.address}
                for b in Branch.objects.order_by("branch_id")
            ]
        )
