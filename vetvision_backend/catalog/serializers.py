from rest_framework import serializers

from .models import Product, ProductBranchPrice, Service, ServiceBranchPrice, ServiceProductUsage


class ProductBranchPriceSerializer(serializers.ModelSerializer):
    branch_id = serializers.CharField()

    class Meta:
        model = ProductBranchPrice
        fields = ["branch_id", "unit_price", "unit_capital"]


class ProductSerializer(serializers.ModelSerializer):
    prices = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ["product_id", "product_name", "category", "created_at", "prices"]

    def get_prices(self, obj):
        prices = ProductBranchPrice.objects.filter(product=obj)
        return ProductBranchPriceSerializer(prices, many=True).data


class ServiceBranchPriceSerializer(serializers.ModelSerializer):
    branch_id = serializers.CharField()

    class Meta:
        model = ServiceBranchPrice
        fields = ["branch_id", "unit_price", "unit_capital"]


class ServiceSerializer(serializers.ModelSerializer):
    prices = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = ["service_id", "service_name", "category", "created_at", "prices"]

    def get_prices(self, obj):
        prices = ServiceBranchPrice.objects.filter(service=obj)
        return ServiceBranchPriceSerializer(prices, many=True).data


class ServiceProductUsageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceProductUsage
        fields = ["service", "product", "qty_per_service"]
