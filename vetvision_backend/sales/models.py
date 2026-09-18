from django.db import models

from accounts.models import Customer, Staff
from branches.models import Branch
from catalog.models import Product
from patients.models import Pet


class PaymentStatus(models.TextChoices):
    """Matches the DB CHECK constraint on sale.payment_status /
    service_transaction.payment_status verbatim — keep in sync with the
    schema if that constraint ever changes."""

    PAID = "Paid"
    UNPAID = "Unpaid"
    PARTIAL = "Partial"
    PENDING = "Pending"
    REFUNDED = "Refunded"


class Sale(models.Model):
    """A product-sale transaction header. `total_amount` should always
    equal the sum of its sale_detail line_totals — enforced by application
    logic (see SaleSerializer), not a DB constraint."""

    sale_id = models.CharField(primary_key=True, max_length=16)
    branch = models.ForeignKey(Branch, db_column="branch_id", on_delete=models.DO_NOTHING)
    staff = models.ForeignKey(
        Staff, db_column="staff_id", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    customer = models.ForeignKey(
        Customer, db_column="customer_id", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    sale_date = models.DateField()
    sale_time = models.TimeField(null=True, blank=True)
    payment_method = models.CharField(max_length=15, null=True, blank=True)
    payment_status = models.CharField(max_length=15, choices=PaymentStatus.choices, null=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    created_by = models.CharField(max_length=10, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "sale"
        ordering = ["-sale_date", "-sale_time"]


class SaleDetail(models.Model):
    """One product line within a Sale. Inserting a row here fires the DB
    trigger `trg_sale_detail_inventory`, which deducts stock automatically
    — the API must NOT also manually decrement inventory, or stock will be
    double-deducted."""

    sale_detail_id = models.CharField(primary_key=True, max_length=14)
    sale = models.ForeignKey(
        Sale, db_column="sale_id", on_delete=models.CASCADE, related_name="details"
    )
    product = models.ForeignKey(Product, db_column="product_id", on_delete=models.DO_NOTHING)
    pet = models.ForeignKey(
        Pet, db_column="pet_id", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    unit_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_profit = models.DecimalField(max_digits=12, decimal_places=2, null=True)

    class Meta:
        managed = False
        db_table = "sale_detail"
