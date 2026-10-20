from django.conf import settings
from django.db import models


class Notification(models.Model):
    notification_id = models.CharField(primary_key=True, max_length=14)
    branch = models.ForeignKey("clinic.Branch", on_delete=models.CASCADE, db_column="branch_id")
    customer = models.ForeignKey(
        "clinic.Customer", on_delete=models.CASCADE, null=True, blank=True, db_column="customer_id"
    )
    staff = models.ForeignKey("clinic.Staff", on_delete=models.SET_NULL, null=True, blank=True, db_column="staff_id")
    notification_type = models.CharField(max_length=30, null=True, blank=True)
    service_type = models.CharField(max_length=100, null=True, blank=True)
    message_text = models.CharField(max_length=500, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=15, null=True, blank=True)
    delivery_method = models.CharField(max_length=15, null=True, blank=True)

    class Meta:
        db_table = "notification"


class EventPost(models.Model):
    """Announcement written by the admin, shown on the employee Feed."""

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    author_name = models.CharField(max_length=120)
    author_photo = models.TextField(null=True, blank=True)
    text = models.TextField(blank=True, default="")
    photo = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "event_post"
        ordering = ["-created_at"]


class BranchAvailability(models.Model):
    """Per-branch, per-date clinic open/closed override."""

    STATES = [("available", "available"), ("unavailable", "unavailable")]

    branch = models.ForeignKey("clinic.Branch", on_delete=models.CASCADE, db_column="branch_id")
    date = models.DateField()
    state = models.CharField(max_length=12, choices=STATES)

    class Meta:
        db_table = "branch_availability"
        constraints = [models.UniqueConstraint(fields=["branch", "date"], name="branch_availability_uq")]


class ApprovalRequest(models.Model):
    """Staff-initiated delete request (needs admin approval) or restock heads-up."""

    DELETE_PRODUCT = "delete_product"
    DELETE_PATIENT = "delete_patient"
    DELETE_CONSULTATION = "delete_consultation"
    RESTOCK = "restock"
    KINDS = [(k, k) for k in (DELETE_PRODUCT, DELETE_PATIENT, DELETE_CONSULTATION, RESTOCK)]

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_DENIED = "denied"
    STATUS_DISMISSED = "dismissed"
    STATUSES = [(s, s) for s in (STATUS_PENDING, STATUS_APPROVED, STATUS_DENIED, STATUS_DISMISSED)]

    kind = models.CharField(max_length=24, choices=KINDS)
    target_id = models.CharField(max_length=32)
    label = models.CharField(max_length=200)
    branch = models.ForeignKey("clinic.Branch", on_delete=models.SET_NULL, null=True, blank=True, db_column="branch_id")
    extra = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=12, choices=STATUSES, default=STATUS_PENDING)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    requested_by_name = models.CharField(max_length=120)
    requested_at = models.DateTimeField(auto_now_add=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "approval_request"
        ordering = ["requested_at"]


class SeenFollowUp(models.Model):
    """Which follow-up notifications a user has already opened (bell 'is-seen' state)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    key = models.CharField(max_length=250)

    class Meta:
        db_table = "seen_follow_up"
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="seen_follow_up_uq")]
