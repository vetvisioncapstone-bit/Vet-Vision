from django.core.validators import MinValueValidator
from django.db import models


class Product(models.Model):
    product_id = models.CharField(primary_key=True, max_length=10)
    product_name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        db_table = "product"

    def __str__(self):
        return f"{self.product_id} {self.product_name}"


class Service(models.Model):
    service_id = models.CharField(primary_key=True, max_length=10)
    service_name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        db_table = "service"


class ProductBranchPrice(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column="product_id", related_name="prices")
    branch = models.ForeignKey("clinic.Branch", on_delete=models.CASCADE, db_column="branch_id")
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, validators=[MinValueValidator(0)])
    unit_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)

    class Meta:
        db_table = "product_branch_price"
        constraints = [
            models.UniqueConstraint(fields=["product", "branch"], name="product_branch_price_uq"),
            models.CheckConstraint(condition=models.Q(unit_price__gte=0), name="chk_pbp_price"),
        ]


class ServiceBranchPrice(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, db_column="service_id")
    branch = models.ForeignKey("clinic.Branch", on_delete=models.CASCADE, db_column="branch_id")
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    unit_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True)

    class Meta:
        db_table = "service_branch_price"
        constraints = [
            models.UniqueConstraint(fields=["service", "branch"], name="service_branch_price_uq"),
            models.CheckConstraint(condition=models.Q(unit_price__gte=0), name="chk_sbp_price"),
        ]


class ServiceProductUsage(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, db_column="service_id")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column="product_id")
    qty_per_service = models.DecimalField(max_digits=10, decimal_places=2, default=1)

    class Meta:
        db_table = "service_product_usage"
        constraints = [models.UniqueConstraint(fields=["service", "product"], name="service_product_usage_uq")]


class Inventory(models.Model):
    inventory_id = models.CharField(primary_key=True, max_length=12)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column="product_id", related_name="stock")
    branch = models.ForeignKey("clinic.Branch", on_delete=models.CASCADE, db_column="branch_id")
    quantity_on_hand = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    reorder_point = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reorder_qty = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    last_counted = models.DateField(null=True, blank=True)
    # Added: the inventory UI tracks delivery/expiration (FIFO) and a photo.
    delivery_date = models.DateField(null=True, blank=True)
    expiration_date = models.DateField(null=True, blank=True)
    photo = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "inventory"
        constraints = [models.UniqueConstraint(fields=["product", "branch"], name="inventory_product_branch_uq")]


class InventoryTransaction(models.Model):
    txn_id = models.CharField(primary_key=True, max_length=14)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column="product_id")
    branch = models.ForeignKey("clinic.Branch", on_delete=models.CASCADE, db_column="branch_id")
    txn_type = models.CharField(max_length=20, null=True, blank=True)
    quantity_change = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    reference_id = models.CharField(max_length=16, null=True, blank=True)
    remarks = models.CharField(max_length=200, null=True, blank=True)
    txn_date = models.DateField()
    created_by = models.ForeignKey(
        "clinic.Staff", on_delete=models.SET_NULL, null=True, blank=True, db_column="created_by"
    )

    class Meta:
        db_table = "inventory_transaction"
