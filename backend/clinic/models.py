from django.db import models


class Branch(models.Model):
    branch_id = models.CharField(primary_key=True, max_length=10)
    branch_name = models.CharField(max_length=80)
    town = models.CharField(max_length=40)
    address = models.CharField(max_length=160)
    date_opened = models.DateField()

    class Meta:
        db_table = "branch"

    def __str__(self):
        return f"{self.branch_id} {self.town}"


class Staff(models.Model):
    staff_id = models.CharField(primary_key=True, max_length=10)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, db_column="branch_id")
    staff_name = models.CharField(max_length=60)
    role = models.CharField(max_length=40)
    username = models.CharField(max_length=50, unique=True, null=True, blank=True)
    email = models.CharField(max_length=100, null=True, blank=True)
    # Legacy column from the original schema; credentials now live on accounts.User.
    password_hash = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True, null=True)
    last_login = models.DateTimeField(null=True, blank=True)
    # Added: fields the staff-management UI captures.
    address = models.CharField(max_length=160, null=True, blank=True)
    mobile = models.CharField(max_length=30, null=True, blank=True)
    photo = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "staff"

    def __str__(self):
        return f"{self.staff_id} {self.staff_name}"


class Customer(models.Model):
    """A pet owner. The frontend's 'patient' is a pet plus its owner."""

    customer_id = models.CharField(primary_key=True, max_length=12)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, db_column="branch_id")
    customer_name = models.CharField(max_length=80)
    contact_no = models.CharField(max_length=20, null=True, blank=True)
    address = models.CharField(max_length=120, null=True, blank=True)
    date_registered = models.DateField(null=True, blank=True)
    email = models.CharField(max_length=100, unique=True, null=True, blank=True)
    password_hash = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True, null=True)
    last_login = models.DateTimeField(null=True, blank=True)
    # Added: the UI captures first/last name separately.
    first_name = models.CharField(max_length=60, null=True, blank=True)
    last_name = models.CharField(max_length=60, null=True, blank=True)

    class Meta:
        db_table = "customer"

    def __str__(self):
        return f"{self.customer_id} {self.customer_name}"


class Pet(models.Model):
    pet_id = models.CharField(primary_key=True, max_length=12)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, db_column="customer_id", related_name="pets")
    pet_name = models.CharField(max_length=40)
    species = models.CharField(max_length=15, null=True, blank=True)
    breed = models.CharField(max_length=40, null=True, blank=True)
    sex = models.CharField(max_length=10, null=True, blank=True)
    color_marking = models.CharField(max_length=40, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    # Added: follow-up tracking shown in the patients table / notification bell.
    status = models.CharField(max_length=20, default="Active", db_default="Active")
    follow_up_note = models.CharField(max_length=200, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True, auto_now_add=True)

    class Meta:
        db_table = "pet"

    def __str__(self):
        return f"{self.pet_id} {self.pet_name}"


class MedicalRecord(models.Model):
    """A consultation."""

    record_id = models.CharField(primary_key=True, max_length=14)
    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, db_column="pet_id", related_name="records")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, db_column="branch_id")
    staff = models.ForeignKey(Staff, on_delete=models.SET_NULL, null=True, blank=True, db_column="staff_id")
    record_date = models.DateField()
    record_type = models.CharField(max_length=30, null=True, blank=True)
    diagnosis = models.CharField(max_length=200, null=True, blank=True)
    treatment = models.TextField(null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    # Added: everything the consultation form captures.
    weight = models.CharField(max_length=40, null=True, blank=True)
    services = models.TextField(null=True, blank=True)
    availed_items = models.JSONField(default=list, blank=True, db_default=[])
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, db_default=0)
    blood_test_image = models.TextField(null=True, blank=True)
    blood_test_name = models.CharField(max_length=200, null=True, blank=True)
    waiver_image = models.TextField(null=True, blank=True)
    waiver_name = models.CharField(max_length=200, null=True, blank=True)
    follow_up = models.BooleanField(default=False, db_default=False)
    follow_up_note = models.CharField(max_length=200, null=True, blank=True)
    # Set on records generated from a legacy service transaction (see seed_medical_records); it links the record
    # back to its source and stops that transaction from being listed twice in a pet's history.
    source_txn_id = models.CharField(max_length=16, null=True, blank=True, unique=True)

    class Meta:
        db_table = "medical_record"
