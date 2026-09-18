"""Read-only models mapped onto the SQL VIEWs already defined in
vetvisiondb.sql (v_sale_lines, v_service_lines, v_branch_monthly_kpi,
v_fast_movers, v_slow_movers). These do the heavy aggregation in Postgres
itself — the KPI math from thesis Section 3.4 (Sales per Branch, Sales
Growth Rate is computed app-side from consecutive months, Service
Transactions per Branch, Fast/Slow-Moving Products) is already sitting in
the database; this app just exposes it over REST rather than re-deriving it
in Python.

None of these views have a real single-column primary key (they're
aggregates), so `pk_field` below is just whichever column is closest to
unique enough for Django's ORM bookkeeping — it is NEVER used for `.get()`
lookups in this app, only for iteration/serialization, so its lack of true
uniqueness is harmless.
"""

from django.db import models


class BranchMonthlyKPI(models.Model):
    branch_id = models.CharField(primary_key=True, max_length=10)
    branch_name = models.CharField(max_length=80)
    month = models.DateField()
    sale_txns = models.BigIntegerField()
    service_txns = models.BigIntegerField()
    sales_gross = models.DecimalField(max_digits=14, decimal_places=2)
    service_gross = models.DecimalField(max_digits=14, decimal_places=2)
    total_gross = models.DecimalField(max_digits=14, decimal_places=2)
    total_profit = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        managed = False
        db_table = "v_branch_monthly_kpi"
        ordering = ["branch_id", "month"]


class FastMover(models.Model):
    branch_id = models.CharField(primary_key=True, max_length=10)
    branch_name = models.CharField(max_length=80)
    product_id = models.CharField(max_length=10)
    product_name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    units_sold = models.BigIntegerField()
    revenue = models.DecimalField(max_digits=14, decimal_places=2)
    times_sold = models.BigIntegerField()

    class Meta:
        managed = False
        db_table = "v_fast_movers"
        ordering = ["-units_sold"]


class SlowMover(models.Model):
    branch_id = models.CharField(primary_key=True, max_length=10)
    branch_name = models.CharField(max_length=80)
    product_id = models.CharField(max_length=10)
    product_name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    units_sold = models.BigIntegerField()
    revenue = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        managed = False
        db_table = "v_slow_movers"
        ordering = ["units_sold"]


class SaleLine(models.Model):
    """v_sale_lines — one row per product sold, denormalized with branch/
    staff/customer/product names already joined in. Used as the raw feed
    for the Moving Average demand forecast (see analytics/forecasting.py)."""

    sale_id = models.CharField(primary_key=True, max_length=16)
    branch_id = models.CharField(max_length=10)
    branch_name = models.CharField(max_length=80)
    sale_date = models.DateField()
    month = models.DateField()
    staff_id = models.CharField(max_length=10, null=True)
    staff_name = models.CharField(max_length=60, null=True)
    customer_id = models.CharField(max_length=12, null=True)
    customer_name = models.CharField(max_length=80, null=True)
    product_id = models.CharField(max_length=10)
    product_name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    quantity = models.IntegerField()
    line_total = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_profit = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    payment_method = models.CharField(max_length=15, null=True)
    payment_status = models.CharField(max_length=15, null=True)

    class Meta:
        managed = False
        db_table = "v_sale_lines"


class ServiceLine(models.Model):
    """v_service_lines — service-side equivalent of SaleLine."""

    service_txn_id = models.CharField(primary_key=True, max_length=16)
    branch_id = models.CharField(max_length=10)
    branch_name = models.CharField(max_length=80)
    txn_date = models.DateField()
    month = models.DateField()
    customer_id = models.CharField(max_length=12, null=True)
    customer_name = models.CharField(max_length=80, null=True)
    pet_id = models.CharField(max_length=12, null=True)
    pet_name = models.CharField(max_length=40, null=True)
    species = models.CharField(max_length=15, null=True)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True)
    service_id = models.CharField(max_length=10)
    service_name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    staff_id = models.CharField(max_length=10, null=True)
    staff_name = models.CharField(max_length=60, null=True)
    role = models.CharField(max_length=40, null=True)
    quantity = models.IntegerField()
    line_total = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    line_profit = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    remarks = models.CharField(max_length=120, null=True)
    payment_method = models.CharField(max_length=15, null=True)
    payment_status = models.CharField(max_length=15, null=True)

    class Meta:
        managed = False
        db_table = "v_service_lines"
