from decimal import Decimal

from rest_framework import serializers

from catalog.models import ProductBranchPrice

from .models import Sale, SaleDetail


class SaleDetailWriteSerializer(serializers.Serializer):
    """Nested line-item shape accepted when creating a Sale. We only take
    product_id, pet_id and quantity from the caller — price/capital/profit
    are looked up server-side from ProductBranchPrice so a client can't
    forge margins."""

    product_id = serializers.CharField()
    pet_id = serializers.CharField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1)


class SaleDetailSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.product_name", read_only=True)

    class Meta:
        model = SaleDetail
        fields = [
            "sale_detail_id",
            "product",
            "product_name",
            "pet",
            "quantity",
            "unit_price",
            "unit_capital",
            "line_total",
            "line_capital",
            "line_profit",
        ]
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    details = SaleDetailSerializer(many=True, read_only=True)
    lines = SaleDetailWriteSerializer(many=True, write_only=True)
    branch_name = serializers.CharField(source="branch.branch_name", read_only=True)
    branch = serializers.PrimaryKeyRelatedField(read_only=True)
    staff = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.CharField(read_only=True)
    customer = serializers.CharField(required=False, allow_null=True)

    class Meta:
        model = Sale
        fields = [
            "sale_id",
            "branch",
            "branch_name",
            "staff",
            "customer",
            "sale_date",
            "sale_time",
            "payment_method",
            "payment_status",
            "total_amount",
            "created_by",
            "details",
            "lines",
        ]
        read_only_fields = ["sale_id", "total_amount"]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("A sale needs at least one line item.")
        return lines

    def create(self, validated_data):
        from django.db import transaction

        from common.id_generators import next_id

        lines = validated_data.pop("lines")
        branch = validated_data["branch"]
        customer_id = validated_data.pop("customer", None)

        with transaction.atomic():
            sale_id = next_id(Sale, "sale_id", "SL-{b}-", width=6, branch=branch)
            total = Decimal("0")
            sale = Sale.objects.create(
                sale_id=sale_id, total_amount=0, customer_id=customer_id, **validated_data
            )

            for line in lines:
                try:
                    price = ProductBranchPrice.objects.get(
                        product_id=line["product_id"], branch=branch
                    )
                except ProductBranchPrice.DoesNotExist as exc:
                    raise serializers.ValidationError(
                        f"No price set for product {line['product_id']} at this branch."
                    ) from exc

                quantity = line["quantity"]
                unit_price = price.unit_price or Decimal("0")
                unit_capital = price.unit_capital or Decimal("0")
                line_total = unit_price * quantity
                line_capital = unit_capital * quantity
                line_profit = line_total - line_capital
                total += line_total

                detail_id = next_id(SaleDetail, "sale_detail_id", "SD-", width=7)
                SaleDetail.objects.create(
                    sale_detail_id=detail_id,
                    sale=sale,
                    product_id=line["product_id"],
                    pet_id=line.get("pet_id"),
                    quantity=quantity,
                    unit_price=unit_price,
                    unit_capital=unit_capital,
                    line_total=line_total,
                    line_capital=line_capital,
                    line_profit=line_profit,
                )
                # NOTE: inserting SaleDetail fires trg_sale_detail_inventory,
                # which deducts stock for us — do not deduct it again here.

            sale.total_amount = total
            sale.save(update_fields=["total_amount"])
            return sale
