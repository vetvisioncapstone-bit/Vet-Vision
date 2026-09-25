from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, email, password, **extra):
        if not email:
            raise ValueError("Users must have an email address")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("role", User.ROLE_STAFF)
        return self._create(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("role", User.ROLE_ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self._create(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_ADMIN = "admin"
    ROLE_STAFF = "staff"
    ROLE_CUSTOMER = "customer"
    ROLES = [(ROLE_ADMIN, "Admin"), (ROLE_STAFF, "Staff"), (ROLE_CUSTOMER, "Customer")]

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=120)
    role = models.CharField(max_length=10, choices=ROLES, default=ROLE_STAFF)
    photo = models.TextField(null=True, blank=True)
    staff = models.OneToOneField(
        "clinic.Staff", on_delete=models.CASCADE, null=True, blank=True, related_name="user", db_column="staff_id"
    )
    customer = models.OneToOneField(
        "clinic.Customer", on_delete=models.CASCADE, null=True, blank=True, related_name="user", db_column="customer_id"
    )
    is_active = models.BooleanField(default=True)
    # Customers imported from the legacy data start with a shared password; force a change at first login.
    must_change_password = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)  # Django admin site access
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        db_table = "accounts_user"

    def __str__(self):
        return f"{self.email} ({self.role})"

    @property
    def branch_id(self):
        if self.staff_id:
            return self.staff.branch_id
        if self.customer_id:
            return self.customer.branch_id
        return None


class AuditLog(models.Model):
    """Who did what and when: sign-ins (and failures, which drive the lockout), password changes and every
    destructive or account-level action. Read-only from the API (admin only)."""

    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    email = models.CharField(max_length=254, blank=True, db_index=True)  # kept even if the user is deleted
    action = models.CharField(max_length=40, db_index=True)
    target = models.CharField(max_length=120, blank=True)
    detail = models.CharField(max_length=255, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-id"]
