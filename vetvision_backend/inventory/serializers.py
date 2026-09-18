from rest_framework import serializers

from .models import Inventory, InventoryTransaction


class InventorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.product_name", read_only=True)
    branch_name = serializers.CharField(source="branch.branch_name", read_only=True)
    is_below_reorder_point = serializers.BooleanField(read_only=True)

    class Meta:
        model = Inventory
        fields = [
            "inventory_id",
            "product",
            "product_name",
            "branch",
            "branch_name",
            "quantity_on_hand",
            "reorder_point",
            "reorder_qty",
            "last_counted",
            "is_below_reorder_point",
        ]


class InventoryTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryTransaction
        fields = [
            "txn_id",
            "product",
            "branch",
            "txn_type",
            "quantity_change",
            "reference_id",
            "remarks",
            "txn_date",
            "created_by",
        ]
        read_only_fields = ["txn_id"]
