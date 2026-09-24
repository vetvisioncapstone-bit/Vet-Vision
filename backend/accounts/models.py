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
