from django.db import models

from accounts.models import Customer, Staff
from branches.models import Branch


class Notification(models.Model):
    """Customer-portal notifications (appointment reminders, vaccination
    due dates, service confirmations). 0 rows in the seeded dataset — this
    table exists in the schema but nothing populates it yet; that's this
    app's job going forward (e.g. a management command / Celery task that
    scans medical_record for upcoming vaccination due dates)."""

    notification_id = models.CharField(primary_key=True, max_length=14)
    branch = models.ForeignKey(Branch, db_column="branch_id", on_delete=models.DO_NOTHING)
    customer = models.ForeignKey(
        Customer, db_column="customer_id", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    staff = models.ForeignKey(
        Staff, db_column="staff_id", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    notification_type = models.CharField(max_length=30, null=True, blank=True)
    service_type = models.CharField(max_length=100, null=True, blank=True)
    message_text = models.CharField(max_length=500, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=15, null=True, blank=True)
    delivery_method = models.CharField(max_length=15, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "notification"
        ordering = ["-created_at"]
