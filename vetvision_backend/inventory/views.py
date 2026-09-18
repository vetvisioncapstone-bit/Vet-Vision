from django.db import connection
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsStaff

from .models import Inventory, InventoryTransaction
from .serializers import InventorySerializer, InventoryTransactionSerializer


def _next_txn_id() -> str:
    """Mirrors the DB's own `seq_inv_txn_id` formatting ('ITX-00000001') so
    manually-created transactions (restocks, corrections) use the same id
    shape as the ones the sale/service triggers insert automatically."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT nextval('seq_inv_txn_id')")
        (n,) = cursor.fetchone()
    return f"ITX-{n:08d}"


class InventoryViewSet(viewsets.ModelViewSet):
    """The Inventory page's stock table: quantity on hand, reorder point,
    per branch. Staff can only see/edit their own branch unless admin."""

    queryset = Inventory.objects.select_related("product", "branch").all()
    serializer_class = InventorySerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_admin:
            qs = qs.filter(branch_id=user.branch_id)
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if self.request.query_params.get("low_stock") == "true":
            qs = [row for row in qs if row.is_below_reorder_point]
        return qs

    @action(detail=True, methods=["post"])
    def adjust(self, request, pk=None):
        """POST {quantity_change, remarks} — manual stock correction. Also
        writes an inventory_transaction row so the ledger stays complete,
        the same way the sale/service triggers do."""
        inventory = self.get_object()
        try:
            change = float(request.data.get("quantity_change"))
        except (TypeError, ValueError):
            return Response({"detail": "quantity_change must be a number."}, status=400)

        inventory.quantity_on_hand = inventory.quantity_on_hand + change
        inventory.last_counted = timezone.now().date()
        inventory.save(update_fields=["quantity_on_hand", "last_counted"])

        InventoryTransaction.objects.create(
            txn_id=_next_txn_id(),
            product=inventory.product,
            branch=inventory.branch,
            txn_type="manual_adjustment",
            quantity_change=change,
            reference_id=None,
            remarks=request.data.get("remarks", ""),
            txn_date=timezone.now().date(),
            created_by=getattr(request.user, "staff_id", None),
        )
        return Response(InventorySerializer(inventory).data)


class InventoryTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only ledger view — rows are written by the DB triggers or by
    InventoryViewSet.adjust(), never directly."""

    queryset = InventoryTransaction.objects.select_related("product", "branch").all()
    serializer_class = InventoryTransactionSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_admin:
            qs = qs.filter(branch_id=user.branch_id)
        product_id = self.request.query_params.get("product_id")
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs
