from django.contrib.auth.hashers import check_password, make_password
from django.db import models

from branches.models import Branch


class Staff(models.Model):
    """Maps onto the existing `staff` table. `role` here is a JOB TITLE
    ("Veterinarian", "Secretary", "Groomer / Vet Assistant") seeded from the
    operational dataset — it is NOT the thesis's system-permission role
    (Administrator / Owner / Branch Manager / Staff). System-level access is
    derived from settings.ADMIN_JOB_ROLES instead of a new schema column, so
    the verified schema stays untouched; see accounts/permissions.py.

    username / email / password_hash / is_active / last_login all exist in
    the table already but are NULL for every row in the seeded dataset —
    nobody has a login yet. Use `set_password` (below) or the `seed_admin`
    management command to create the first one.
    """

    staff_id = models.CharField(primary_key=True, max_length=10)
    branch = models.ForeignKey(
        Branch, db_column="branch_id", on_delete=models.DO_NOTHING, related_name="staff"
    )
    staff_name = models.CharField(max_length=60)
    role = models.CharField(max_length=40)
    username = models.CharField(max_length=50, null=True, blank=True)
    email = models.CharField(max_length=100, null=True, blank=True)
    password_hash = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_login = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "staff"
        ordering = ["staff_id"]

    def __str__(self):
        return f"{self.staff_name} ({self.role})"

    @property
    def is_admin(self) -> bool:
        from django.conf import settings

        return self.role in settings.ADMIN_JOB_ROLES

    def set_password(self, raw_password: str) -> None:
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password: str) -> bool:
        if not self.password_hash:
            return False
        return check_password(raw_password, self.password_hash)


class Customer(models.Model):
    """Maps onto the existing `customer` table — the customer-portal login.
    Same story as Staff: password_hash exists but is NULL for all 1,860
    seeded rows, since this dataset was generated for analytics, not from
    real sign-ups yet."""

    customer_id = models.CharField(primary_key=True, max_length=12)
    branch = models.ForeignKey(
        Branch, db_column="branch_id", on_delete=models.DO_NOTHING, related_name="customers"
    )
    customer_name = models.CharField(max_length=80)
    contact_no = models.CharField(max_length=20, null=True, blank=True)
    address = models.CharField(max_length=120, null=True, blank=True)
    date_registered = models.DateField(null=True, blank=True)
    email = models.CharField(max_length=100, null=True, blank=True)
    password_hash = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_login = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "customer"
        ordering = ["customer_id"]

    def __str__(self):
        return self.customer_name

    def set_password(self, raw_password: str) -> None:
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password: str) -> bool:
        if not self.password_hash:
            return False
        return check_password(raw_password, self.password_hash)
