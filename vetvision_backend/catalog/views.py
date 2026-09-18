from rest_framework import viewsets

from accounts.permissions import IsAdminStaff, IsStaff

from .models import Product, Service, ServiceProductUsage
from .serializers import ProductSerializer, ServiceProductUsageSerializer, ServiceSerializer


class ProductViewSet(viewsets.ModelViewSet):
    """Backs the Inventory page's product catalog (add/edit/list products,
    per-branch pricing nested under `prices`)."""

    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(product_name__icontains=search)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs


class ServiceViewSet(viewsets.ModelViewSet):
    """Backs the services catalog used by the sales/service-transaction
    screens and the appointments-style service picker."""

    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(service_name__icontains=search)
        return qs


class ServiceProductUsageViewSet(viewsets.ModelViewSet):
    """The "recipe" table: how many units of a product a service consumes
    (e.g. 1 grooming session uses 0.5 units of shampoo). This is what the
    `trg_service_detail_inventory` DB trigger reads to auto-deduct stock
    when a service is sold — admin-only, since it's a configuration table,
    not day-to-day data entry."""

    queryset = ServiceProductUsage.objects.select_related("service", "product").all()
    serializer_class = ServiceProductUsageSerializer
    permission_classes = [IsAdminStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        service_id = self.request.query_params.get("service_id")
        if service_id:
            qs = qs.filter(service_id=service_id)
        return qs
