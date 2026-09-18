from rest_framework import serializers

from .models import BranchMonthlyKPI, FastMover, SlowMover


class BranchMonthlyKPISerializer(serializers.ModelSerializer):
    class Meta:
        model = BranchMonthlyKPI
        fields = [
            "branch_id",
            "branch_name",
            "month",
            "sale_txns",
            "service_txns",
            "sales_gross",
            "service_gross",
            "total_gross",
            "total_profit",
        ]


class FastMoverSerializer(serializers.ModelSerializer):
    class Meta:
        model = FastMover
        fields = [
            "branch_id",
            "branch_name",
            "product_id",
            "product_name",
            "category",
            "units_sold",
            "revenue",
            "times_sold",
        ]


class SlowMoverSerializer(serializers.ModelSerializer):
    class Meta:
        model = SlowMover
        fields = [
            "branch_id",
            "branch_name",
            "product_id",
            "product_name",
            "category",
            "units_sold",
            "revenue",
        ]
