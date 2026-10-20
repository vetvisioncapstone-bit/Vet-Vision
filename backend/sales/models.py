from django.db import models

PAYMENT_STATUSES = ["Paid", "Unpaid", "Partial", "Pending", "Refunded"]


class Sale(models.Model):
    """Product sale header. Stock is deducted by the DB trigger on sale_detail insert."""

    sale_id = models.CharField(primary_key=True, max_length=16)
    branch = models.ForeignKey("clinic.Branch", on_delete=models.PROTECT, db_column="branch_id")
    staff = models.ForeignKey(
        "clinic.Staff", on_delete=models.SET_NULL, null=True, blank=True, db_column="staff_id", related_name="sales"
    )
    customer = models.ForeignKey(
        "clinic.Customer", on_delete=models.SET_NULL, null=True, blank=True, db_column="customer_id"
    )
    sale_date = models.DateField()
    sale_time = models.TimeField(null=True, blank=True)
    payment_method = models.CharField(max_length=15, null=True, blank=True)
    payment_status = models.CharField(max_length=15, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    created_by = models.ForeignKey(
        "clinic.Staff", on_delete=models.SET_NULL, null=True, blank=True, db_column="created_by", related_name="+"
    )

    class Meta:
        db_table = "sale"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(payment_status__in=PAYMENT_STATUSES), name="chk_sale_payment_status"
            )
        ]


class SaleDetail(models.Model):
    sale_detail_id = models.CharField(primary_key=True, max_length=14)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, db_column="sale_id", related_name="details")
    product = models.ForeignKey("inventory.Product", on_delete=models.PROTECT, db_column="product_id")
    pet = models.ForeignKey("clinic.Pet", on_delete=models.SET_NULL, null=True, blank=True, db_column="pet_id")
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    unit_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_profit = models.DecimalField(max_digits=12, decimal_places=2, null=True)

    class Meta:
        db_table = "sale_detail"
        constraints = [models.CheckConstraint(condition=models.Q(quantity__gt=0), name="chk_sd_qty")]


class ServiceTransaction(models.Model):
    service_txn_id = models.CharField(primary_key=True, max_length=16)
    branch = models.ForeignKey("clinic.Branch", on_delete=models.PROTECT, db_column="branch_id")
    customer = models.ForeignKey(
        "clinic.Customer", on_delete=models.SET_NULL, null=True, blank=True, db_column="customer_id"
    )
    pet = models.ForeignKey("clinic.Pet", on_delete=models.SET_NULL, null=True, blank=True, db_column="pet_id")
    txn_date = models.DateField()
    txn_time = models.TimeField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    payment_method = models.CharField(max_length=15, null=True, blank=True)
    payment_status = models.CharField(max_length=15, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    created_by = models.ForeignKey(
        "clinic.Staff", on_delete=models.SET_NULL, null=True, blank=True, db_column="created_by", related_name="+"
    )

    class Meta:
        db_table = "service_transaction"
        # The legacy schema indexes customer, date and branch but not pet; pet history and "last visit" look up by pet.
        indexes = [models.Index(fields=["pet"], name="idx_svc_pet")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(payment_status__in=PAYMENT_STATUSES), name="chk_service_payment_status"
            )
        ]


class ServiceDetail(models.Model):
    service_detail_id = models.CharField(primary_key=True, max_length=14)
    service_txn = models.ForeignKey(
        ServiceTransaction, on_delete=models.CASCADE, db_column="service_txn_id", related_name="details"
    )
    service = models.ForeignKey("inventory.Service", on_delete=models.PROTECT, db_column="service_id")
    staff = models.ForeignKey("clinic.Staff", on_delete=models.SET_NULL, null=True, blank=True, db_column="staff_id")
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    unit_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_profit = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    remarks = models.CharField(max_length=120, null=True, blank=True)

    class Meta:
        db_table = "service_detail"
        constraints = [models.CheckConstraint(condition=models.Q(quantity__gt=0), name="chk_vd_qty")]
