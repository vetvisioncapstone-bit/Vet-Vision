from datetime import date
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import paginate, wants_page
from core.validators import data_url
from core.ids import next_id
from accounts.audit import record
from core.permissions import IsClinicStaff, branch_by_town, scope_branch

from .models import Inventory, InventoryTransaction, Product


def iso(d):
    return d.isoformat() if d else ""


def num(v):
    if v is None:
        return 0
    f = float(v)
    return int(f) if f == int(f) else f


def inventory_row(inv):
    """Flat shape the React inventory pages already use."""
    price = next((p for p in inv.product.prices.all() if p.branch_id == inv.branch_id), None)
    return {
        "id": inv.inventory_id,
        "productId": inv.product_id,
        "name": inv.product.product_name,
        "category": inv.product.category,
        "branch": inv.branch.town,
        "quantity": num(inv.quantity_on_hand),
        "reorderPoint": num(inv.reorder_point),
        "delivery": iso(inv.delivery_date),
        "expiration": iso(inv.expiration_date),
        "photo": inv.photo,
        "unitPrice": num(price.unit_price) if price else None,
    }


class InventoryInput(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    category = serializers.CharField(max_length=60)
    branch = serializers.CharField(required=False)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    reorderPoint = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    delivery = serializers.DateField(required=False, allow_null=True)
    expiration = serializers.DateField(required=False, allow_null=True)
    photo = serializers.CharField(required=False, allow_null=True, allow_blank=True, validators=[data_url])


def _queryset(request):
    qs = Inventory.objects.select_related("product", "branch").prefetch_related("product__prices")
    return scope_branch(qs, request.user, requested_town=request.query_params.get("branch"))


def _log_adjustment(inv, before, after, user):
    if before == after:
        return
    InventoryTransaction.objects.create(
        txn_id=next_id(InventoryTransaction, "txn_id", "ITX-", 8),
        product=inv.product,
        branch=inv.branch,
        txn_type="adjustment",
        quantity_change=after - before,
        reference_id=inv.inventory_id,
        remarks=f"Manual adjustment by {user.name}",
        txn_date=date.today(),
        created_by=user.staff if user.staff_id else None,
    )


class InventoryList(APIView):
    permission_classes = [IsClinicStaff]

    def get(self, request):
        qs = _queryset(request).order_by("product__product_name", "inventory_id")
        if wants_page(request):
            q = request.query_params.get("q", "").strip()
            for term in q.split():
                qs = qs.filter(product__product_name__icontains=term)
            return paginate(request, qs, inventory_row)
        return Response([inventory_row(i) for i in qs])

    @transaction.atomic
    def post(self, request):
        s = InventoryInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        user = request.user
        if user.role == "staff":
            branch = user.staff.branch
        else:
            if not d.get("branch"):
                raise serializers.ValidationError({"branch": "Branch is required."})
            branch = branch_by_town(d["branch"])
        product = Product.objects.filter(product_name__iexact=d["name"].strip(), category__iexact=d["category"].strip()).first()
        if product is None:
            product = Product.objects.create(
                product_id=next_id(Product, "product_id", "PRD-", 4),
                product_name=d["name"].strip(),
                category=d["category"].strip(),
            )
        if Inventory.objects.filter(product=product, branch=branch).exists():
            raise serializers.ValidationError({"name": "This product is already in this branch's inventory."})
        inv = Inventory.objects.create(
            inventory_id=next_id(Inventory, "inventory_id", "INV-", 6),
            product=product,
            branch=branch,
            quantity_on_hand=d["quantity"],
            reorder_point=d["reorderPoint"],
            delivery_date=d.get("delivery"),
            expiration_date=d.get("expiration"),
            photo=d.get("photo") or None,
        )
        _log_adjustment(inv, Decimal(0), d["quantity"], user)
        inv = _queryset(request).get(pk=inv.pk)
        return Response(inventory_row(inv), status=status.HTTP_201_CREATED)


class InventoryDetail(APIView):
    permission_classes = [IsClinicStaff]

    def _get(self, request, pk):
        inv = _queryset(request).filter(pk=pk).first()
        if inv is None:
            from rest_framework.exceptions import NotFound

            raise NotFound()
        return inv

    @transaction.atomic
    def put(self, request, pk):
        inv = self._get(request, pk)
        s = InventoryInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        before = inv.quantity_on_hand
        product = inv.product
        product.product_name = d["name"].strip()
        product.category = d["category"].strip()
        product.save(update_fields=["product_name", "category"])
        inv.quantity_on_hand = d["quantity"]
        inv.reorder_point = d["reorderPoint"]
        inv.delivery_date = d.get("delivery")
        inv.expiration_date = d.get("expiration")
        if "photo" in d:
            inv.photo = d["photo"] or None
        inv.save()
        _log_adjustment(inv, before, d["quantity"], request.user)
        return Response(inventory_row(_queryset(request).get(pk=inv.pk)))

    patch = put

    def delete(self, request, pk):
        if request.user.role != "admin":
            raise PermissionDenied("Staff must submit a delete request for admin approval.")
        inv = self._get(request, pk)
        record(request, "product.delete", target=inv.inventory_id)
        inv.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
