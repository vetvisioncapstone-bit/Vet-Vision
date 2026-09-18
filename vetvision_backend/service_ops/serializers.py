from decimal import Decimal

from rest_framework import serializers

from catalog.models import ServiceBranchPrice

from .models import ServiceDetail, ServiceTransaction


class ServiceDetailWriteSerializer(serializers.Serializer):
    service_id = serializers.CharField()
    staff_id = serializers.CharField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1)
    remarks = serializers.CharField(required=False, allow_blank=True)


class ServiceDetailSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service.service_name", read_only=True)
    staff_name = serializers.CharField(source="staff.staff_name", read_only=True, default=None)

    class Meta:
        model = ServiceDetail
        fields = [
            "service_detail_id",
            "service",
            "service_name",
            "staff",
            "staff_name",
            "quantity",
            "unit_price",
            "unit_capital",
            "line_total",
            "line_capital",
            "line_profit",
            "remarks",
        ]
        read_only_fields = fields


class ServiceTransactionSerializer(serializers.ModelSerializer):
    details = ServiceDetailSerializer(many=True, read_only=True)
    lines = ServiceDetailWriteSerializer(many=True, write_only=True)
    branch_name = serializers.CharField(source="branch.branch_name", read_only=True)
    branch = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.CharField(read_only=True)
    customer = serializers.CharField(required=False, allow_null=True)
    pet = serializers.CharField(required=False, allow_null=True)

    class Meta:
        model = ServiceTransaction
        fields = [
            "service_txn_id",
            "branch",
            "branch_name",
            "customer",
            "pet",
            "txn_date",
            "txn_time",
            "weight_kg",
            "payment_method",
            "payment_status",
            "total_amount",
            "created_by",
            "details",
            "lines",
        ]
        read_only_fields = ["service_txn_id", "total_amount"]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("A service transaction needs at least one line.")
        return lines

    def create(self, validated_data):
        from django.db import transaction

        from common.id_generators import next_id

        lines = validated_data.pop("lines")
        branch = validated_data["branch"]
        customer_id = validated_data.pop("customer", None)
        pet_id = validated_data.pop("pet", None)

        with transaction.atomic():
            txn_id = next_id(ServiceTransaction, "service_txn_id", "SV-{b}-", width=6, branch=branch)
            total = Decimal("0")
            txn = ServiceTransaction.objects.create(
                service_txn_id=txn_id,
                total_amount=0,
                customer_id=customer_id,
                pet_id=pet_id,
                **validated_data,
            )

            for line in lines:
                try:
                    price = ServiceBranchPrice.objects.get(
                        service_id=line["service_id"], branch=branch
                    )
                except ServiceBranchPrice.DoesNotExist as exc:
                    raise serializers.ValidationError(
                        f"No price set for service {line['service_id']} at this branch."
                    ) from exc

                quantity = line["quantity"]
                unit_price = price.unit_price or Decimal("0")
                unit_capital = price.unit_capital or Decimal("0")
                line_total = unit_price * quantity
                line_capital = unit_capital * quantity
                line_profit = line_total - line_capital
                total += line_total

                detail_id = next_id(ServiceDetail, "service_detail_id", "VD-", width=7)
                ServiceDetail.objects.create(
                    service_detail_id=detail_id,
                    service_txn=txn,
                    service_id=line["service_id"],
                    staff_id=line.get("staff_id"),
                    quantity=quantity,
                    unit_price=unit_price,
                    unit_capital=unit_capital,
                    line_total=line_total,
                    line_capital=line_capital,
                    line_profit=line_profit,
                    remarks=line.get("remarks", ""),
                )
                # NOTE: fires trg_service_detail_inventory — do not also
                # deduct inventory manually here.

            txn.total_amount = total
            txn.save(update_fields=["total_amount"])
            return txn
