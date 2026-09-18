from django.db import models

from branches.models import Branch
from catalog.models import Product


class Inventory(models.Model):
    """Current stock level per product per branch. Note: rows here are
    also written by the DB triggers `fn_inventory_deduct_on_sale` and
    `fn_inventory_deduct_on_service` whenever a sale_detail/service_detail
    row is inserted — Django is not the only writer of this table, so
    treat `quantity_on_hand` as authoritative from the DB, not something to
    cache client-side."""

    inventory_id = models.CharField(primary_key=True, max_length=12)
    product = models.ForeignKey(Product, db_column="product_id", on_delete=models.DO_NOTHING)
    branch = models.ForeignKey(Branch, db_column="branch_id", on_delete=models.DO_NOTHING)
    quantity_on_hand = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    reorder_point = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reorder_qty = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    last_counted = models.DateField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "inventory"
        ordering = ["branch_id", "product_id"]

    @property
    def is_below_reorder_point(self) -> bool:
        if self.reorder_point is None:
            return False
        return self.quantity_on_hand <= self.reorder_point


class InventoryTransaction(models.Model):
    """Audit ledger of every stock change (auto-inserted by the same DB
    triggers, plus manual adjustments/restocks made through the API)."""

    txn_id = models.CharField(primary_key=True, max_length=14)
    product = models.ForeignKey(Product, db_column="product_id", on_delete=models.DO_NOTHING)
    branch = models.ForeignKey(Branch, db_column="branch_id", on_delete=models.DO_NOTHING)
    txn_type = models.CharField(max_length=20, null=True, blank=True)
    quantity_change = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    reference_id = models.CharField(max_length=16, null=True, blank=True)
    remarks = models.CharField(max_length=200, null=True, blank=True)
    txn_date = models.DateField()
    created_by = models.CharField(max_length=10, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "inventory_transaction"
        ordering = ["-txn_date", "-txn_id"]
