from rest_framework import viewsets

from accounts.permissions import IsStaff

from .models import Sale
from .serializers import SaleSerializer


class SaleViewSet(viewsets.ModelViewSet):
    """Point-of-sale endpoint: POST a header + `lines` (product/qty pairs)
    and it prices, totals, and creates the Sale + SaleDetail rows in one
    call — see SaleSerializer.create for the pricing/inventory logic.
    No update/partial_update by design: sales are immutable once made
    (use a Refunded payment_status instead of editing line items)."""

    http_method_names = ["get", "post", "delete", "head", "options"]
    queryset = Sale.objects.select_related("branch", "staff", "customer").prefetch_related(
        "details"
    )
    serializer_class = SaleSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_admin:
            qs = qs.filter(branch_id=user.branch_id)
        for param, field in [
            ("branch_id", "branch_id"),
            ("customer_id", "customer_id"),
            ("date_from", "sale_date__gte"),
            ("date_to", "sale_date__lte"),
        ]:
            value = self.request.query_params.get(param)
            if value:
                qs = qs.filter(**{field: value})
        return qs

    def perform_create(self, serializer):
        serializer.save(
            branch=self.request.user.branch,
            staff=self.request.user,
            created_by=self.request.user.staff_id,
        )
