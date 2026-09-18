from django.db import models

from branches.models import Branch


class Product(models.Model):
    product_id = models.CharField(primary_key=True, max_length=10)
    product_name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "product"
        ordering = ["product_name"]

    def __str__(self):
        return self.product_name


class Service(models.Model):
    service_id = models.CharField(primary_key=True, max_length=10)
    service_name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "service"
        ordering = ["service_name"]

    def __str__(self):
        return self.service_name


class ProductBranchPrice(models.Model):
    """Composite PK in the real DB (product_id, branch_id) — Django ORM
    doesn't support composite PKs cleanly for a managed=False proxy, so we
    give it a synthetic AutoField-free unique_together instead and always
    query by both columns explicitly."""

    product = models.ForeignKey(
        Product, db_column="product_id", on_delete=models.DO_NOTHING, primary_key=True
    )
    branch = models.ForeignKey(Branch, db_column="branch_id", on_delete=models.DO_NOTHING)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    unit_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)

    class Meta:
        managed = False
        db_table = "product_branch_price"
        unique_together = [("product", "branch")]


class ServiceBranchPrice(models.Model):
    service = models.ForeignKey(
        Service, db_column="service_id", on_delete=models.DO_NOTHING, primary_key=True
    )
    branch = models.ForeignKey(Branch, db_column="branch_id", on_delete=models.DO_NOTHING)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    unit_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)

    class Meta:
        managed = False
        db_table = "service_branch_price"
        unique_together = [("service", "branch")]


class ServiceProductUsage(models.Model):
    """How many units of a product a service consumes (the recipe table
    the inventory-deduction trigger reads from on service transactions)."""

    service = models.ForeignKey(
        Service, db_column="service_id", on_delete=models.DO_NOTHING, primary_key=True
    )
    product = models.ForeignKey(Product, db_column="product_id", on_delete=models.DO_NOTHING)
    qty_per_service = models.DecimalField(max_digits=10, decimal_places=2, default=1)

    class Meta:
        managed = False
        db_table = "service_product_usage"
        unique_together = [("service", "product")]
