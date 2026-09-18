from rest_framework import viewsets

from accounts.permissions import IsStaff

from .models import ServiceTransaction
from .serializers import ServiceTransactionSerializer


class ServiceTransactionViewSet(viewsets.ModelViewSet):
    """Grooming/consultation/vaccination POS endpoint — mirrors
    sales.SaleViewSet. Immutable once created, same reasoning."""

    http_method_names = ["get", "post", "delete", "head", "options"]
    queryset = ServiceTransaction.objects.select_related("branch", "customer", "pet").prefetch_related(
        "details"
    )
    serializer_class = ServiceTransactionSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_admin:
            qs = qs.filter(branch_id=user.branch_id)
        for param, field in [
            ("branch_id", "branch_id"),
            ("customer_id", "customer_id"),
            ("pet_id", "pet_id"),
            ("date_from", "txn_date__gte"),
            ("date_to", "txn_date__lte"),
        ]:
            value = self.request.query_params.get(param)
            if value:
                qs = qs.filter(**{field: value})
        return qs

    def perform_create(self, serializer):
        serializer.save(
            branch=self.request.user.branch,
            created_by=self.request.user.staff_id,
        )
