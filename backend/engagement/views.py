from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from clinic.models import MedicalRecord, Pet
from core.pagination import paginate, wants_page
from accounts.audit import record
from core.clinic_calendar import FULL_CLOSE, FULL_HOURS, OPENS, WEEKLY, day_info
from core.permissions import IsAdmin, IsClinicStaff, assert_branch_access, branch_by_town
from inventory.models import Inventory

from .models import ApprovalRequest, BranchAvailability, EventPost, SeenFollowUp

# The React app names request types like this; the DB stores them as `kind`.
TYPE_TO_KIND = {
    "inventory-product": ApprovalRequest.DELETE_PRODUCT,
    "patient": ApprovalRequest.DELETE_PATIENT,
    "consultation": ApprovalRequest.DELETE_CONSULTATION,
    "restock": ApprovalRequest.RESTOCK,
}
KIND_TO_TYPE = {v: k for k, v in TYPE_TO_KIND.items()}


# ---------------------------- events ----------------------------


def post_row(p):
    return {
        "id": p.pk,
        "authorName": p.author_name,
        "authorPhoto": p.author_photo,
        "text": p.text,
        "photo": p.photo,
        "createdAt": timezone.localtime(p.created_at).isoformat(timespec="seconds"),
    }


class PostInput(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True)
    photo = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        if not (attrs.get("text") or "").strip() and not attrs.get("photo"):
            raise serializers.ValidationError("Write something or attach a photo.")
        return attrs


class EventPostList(APIView):
    permission_classes = [IsClinicStaff]

    def get_permissions(self):
        # Announcements are for everyone signed in, including pet owners. Only the admin can write.
        if self.request.method == "GET":
            return [IsAuthenticated()]
        return super().get_permissions()

    def get(self, request):
        if wants_page(request):
            return paginate(request, EventPost.objects.all(), post_row)
        return Response([post_row(p) for p in EventPost.objects.all()])

    def post(self, request):
        if request.user.role != "admin":
            raise PermissionDenied("Only the admin can post announcements.")
        s = PostInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        post = EventPost.objects.create(
            author=request.user,
            author_name=request.user.name,
            author_photo=request.user.photo,
            text=(d.get("text") or "").strip(),
            photo=d.get("photo") or None,
        )
        return Response(post_row(post), status=status.HTTP_201_CREATED)


class EventPostDetail(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, pk):
        deleted, _ = EventPost.objects.filter(pk=pk).delete()
        if not deleted:
            raise NotFound()
        record(request, "event.delete", target=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClinicCalendar(APIView):
    """GET /api/clinic/calendar/?from=YYYY-MM-DD&to=YYYY-MM-DD[&branch=Ibaan]: for each date, whether the branch is open.

    The regular schedule (core.clinic_calendar) with the admin's per-date overrides on top. Any signed-in user; it
    defaults to the caller's own branch."""

    MAX_DAYS = 70

    def get(self, request):
        f = serializers.DateField()
        try:
            start, end = f.run_validation(request.query_params.get("from")), f.run_validation(request.query_params.get("to"))
        except serializers.ValidationError:
            raise serializers.ValidationError({"detail": "Give from and to as YYYY-MM-DD."})
        if end < start or (end - start).days > self.MAX_DAYS:
            raise serializers.ValidationError({"detail": f"Ask for at most {self.MAX_DAYS} days at a time."})
        town = request.query_params.get("branch") or (
            request.user.customer.branch.town if request.user.customer_id else
            request.user.staff.branch.town if request.user.staff_id else "Ibaan")
        branch = branch_by_town(town)
        overrides = {a.date: a.state for a in BranchAvailability.objects.filter(branch=branch, date__range=(start, end))}
        days = {}
        for n in range((end - start).days + 1):
            d = start + timedelta(days=n)
            info = day_info(d)
            if overrides.get(d) == "unavailable":
                info = {"state": "closed", "hours": "Closed", "reason": "Closed by the clinic", "opens": None, "closes": None}
            elif overrides.get(d) == "available" and info["state"] == "closed":
                info = {"state": "open", "hours": FULL_HOURS, "reason": "Special opening", "opens": OPENS, "closes": FULL_CLOSE}
            days[d.isoformat()] = info
        return Response({"branch": branch.town, "days": days, "weekly": WEEKLY})


class AvailabilityView(APIView):
    permission_classes = [IsClinicStaff]

    def get(self, request):
        out = {}
        for a in BranchAvailability.objects.select_related("branch"):
            out.setdefault(a.branch.town, {})[a.date.isoformat()] = a.state
        for town in ("Ibaan", "San Jose"):
            out.setdefault(town, {})
        return Response(out)

    def put(self, request):
        if request.user.role != "admin":
            raise PermissionDenied("Only the admin can change clinic availability.")
        branch = branch_by_town(request.data.get("branch", ""))
        date = serializers.DateField().run_validation(request.data.get("date"))
        state = request.data.get("state")
        if state in (None, ""):
            BranchAvailability.objects.filter(branch=branch, date=date).delete()
        elif state in ("available", "unavailable"):
            BranchAvailability.objects.update_or_create(branch=branch, date=date, defaults={"state": state})
        else:
            raise serializers.ValidationError({"state": "Must be 'available', 'unavailable' or null."})
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------- approval requests -----------------------


def request_row(r):
    return {
        "id": r.pk,
        "type": KIND_TO_TYPE.get(r.kind, r.kind),
        "targetId": r.target_id,
        "label": r.label,
        "extra": r.extra or None,
        "productName": r.label if r.kind == ApprovalRequest.RESTOCK else None,
        "branch": r.branch.town if r.branch_id else "",
        "requestedByName": r.requested_by_name,
        "requestedByBranch": r.branch.town if r.branch_id else "",
        "requestedAt": r.requested_at.isoformat(),
        "status": r.status,
    }


class RequestInput(serializers.Serializer):
    type = serializers.ChoiceField(choices=list(TYPE_TO_KIND))
    targetId = serializers.CharField(max_length=32)
    label = serializers.CharField(max_length=200)
    extra = serializers.DictField(required=False)


class RequestList(APIView):
    permission_classes = [IsClinicStaff]

    def get(self, request):
        """Pending requests. Only admins act on these, so staff receive an empty list."""
        if request.user.role != "admin":
            return Response([])
        qs = ApprovalRequest.objects.filter(status=ApprovalRequest.STATUS_PENDING).select_related("branch")
        return Response([request_row(r) for r in qs])

    def post(self, request):
        s = RequestInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        kind = TYPE_TO_KIND[d["type"]]
        branch = self._target_branch(kind, d["targetId"])
        if request.user.role == "staff":
            assert_branch_access(request.user, branch.branch_id if branch else None)
        r = ApprovalRequest.objects.create(
            kind=kind,
            target_id=d["targetId"],
            label=d["label"],
            branch=branch,
            extra=d.get("extra", {}),
            requested_by=request.user,
            requested_by_name=request.user.name,
        )
        return Response(request_row(r), status=status.HTTP_201_CREATED)

    @staticmethod
    def _target_branch(kind, target_id):
        if kind in (ApprovalRequest.DELETE_PRODUCT, ApprovalRequest.RESTOCK):
            inv = Inventory.objects.select_related("branch").filter(pk=target_id).first()
            return inv.branch if inv else None
        if kind == ApprovalRequest.DELETE_PATIENT:
            pet = Pet.objects.select_related("customer__branch").filter(pk=target_id).first()
            return pet.customer.branch if pet else None
        rec = MedicalRecord.objects.select_related("branch").filter(pk=target_id).first()
        return rec.branch if rec else None


class RequestAction(APIView):
    permission_classes = [IsAdmin]
    action = None

    @transaction.atomic
    def post(self, request, pk):
        r = ApprovalRequest.objects.select_for_update().filter(pk=pk, status=ApprovalRequest.STATUS_PENDING).first()
        if r is None:
            raise NotFound()
        if self.action == "approve":
            if r.kind == ApprovalRequest.RESTOCK:
                raise serializers.ValidationError("Restock requests are dismissed, not approved.")
            self._execute_delete(r)
            r.status = ApprovalRequest.STATUS_APPROVED
        elif self.action == "deny":
            r.status = ApprovalRequest.STATUS_DENIED
        else:
            r.status = ApprovalRequest.STATUS_DISMISSED
        record(request, f"request.{self.action}", target=r.pk, detail=r.kind)
        r.resolved_by = request.user
        r.resolved_at = timezone.now()
        r.save()
        return Response(request_row(r))

    @staticmethod
    def _execute_delete(r):
        model = {
            ApprovalRequest.DELETE_PRODUCT: Inventory,
            ApprovalRequest.DELETE_PATIENT: Pet,
            ApprovalRequest.DELETE_CONSULTATION: MedicalRecord,
        }[r.kind]
        model.objects.filter(pk=r.target_id).delete()  # already gone is fine


class ApproveRequest(RequestAction):
    action = "approve"


class DenyRequest(RequestAction):
    action = "deny"


class DismissRequest(RequestAction):
    action = "dismiss"


# ----------------------- seen follow-ups ------------------------


class SeenFollowUps(APIView):
    permission_classes = [IsClinicStaff]

    def get(self, request):
        return Response(list(SeenFollowUp.objects.filter(user=request.user).values_list("key", flat=True)))

    def post(self, request):
        keys = request.data.get("keys", [])
        if not isinstance(keys, list) or not all(isinstance(k, str) and len(k) <= 250 for k in keys):
            raise serializers.ValidationError({"keys": "Expected a list of short strings."})
        for key in keys:
            SeenFollowUp.objects.get_or_create(user=request.user, key=key)
        return Response(status=status.HTTP_204_NO_CONTENT)
