from django.db import models

from accounts.models import Customer, Staff
from branches.models import Branch
from catalog.models import Service
from patients.models import Pet
from sales.models import PaymentStatus


class ServiceTransaction(models.Model):
    """A grooming/consultation/vaccination visit header — the service-side
    counterpart of Sale."""

    service_txn_id = models.CharField(primary_key=True, max_length=16)
    branch = models.ForeignKey(Branch, db_column="branch_id", on_delete=models.DO_NOTHING)
    customer = models.ForeignKey(
        Customer, db_column="customer_id", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    pet = models.ForeignKey(
        Pet, db_column="pet_id", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    txn_date = models.DateField()
    txn_time = models.TimeField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    payment_method = models.CharField(max_length=15, null=True, blank=True)
    payment_status = models.CharField(max_length=15, choices=PaymentStatus.choices, null=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    created_by = models.CharField(max_length=10, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "service_transaction"
        ordering = ["-txn_date", "-txn_time"]


class ServiceDetail(models.Model):
    """One service line within a ServiceTransaction. Inserting a row here
    fires `trg_service_detail_inventory`, which looks up
    catalog.ServiceProductUsage for that service and deducts whatever
    products it consumes — do not deduct inventory manually as well."""

    service_detail_id = models.CharField(primary_key=True, max_length=14)
    service_txn = models.ForeignKey(
        ServiceTransaction,
        db_column="service_txn_id",
        on_delete=models.CASCADE,
        related_name="details",
    )
    service = models.ForeignKey(Service, db_column="service_id", on_delete=models.DO_NOTHING)
    staff = models.ForeignKey(
        Staff, db_column="staff_id", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    unit_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_profit = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    remarks = models.CharField(max_length=120, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "service_detail"
