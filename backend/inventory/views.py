from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import paginate, wants_page
from core.validators import data_url
from core.ids import inventory_id, ledger_id, next_id
from accounts.audit import record
from accounts.models import AuditLog
from core.permissions import IsClinicStaff, branch_by_town, require, scope_branch

from .models import Inventory, InventoryTransaction, Product, ProductBranchPrice


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
        "unitPrice": None if price is None or price.unit_price is None else num(price.unit_price),
        "unitCost": None if price is None or price.unit_capital is None else num(price.unit_capital),
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
    # Selling price and cost at this branch. Only the admin sets them (staff see the price, never change it).
    unitPrice = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)
    unitCost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)


class ReceiveInput(serializers.Serializer):
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    confirmRepeat = serializers.BooleanField(required=False, default=False)
    delivery = serializers.DateField(required=False, allow_null=True)
    expiration = serializers.DateField(required=False, allow_null=True)

    def validate_expiration(self, value):
        return _not_expired(value)


def _expiry_field(value):
    try:
        _not_expired(value)
    except serializers.ValidationError as e:
        raise serializers.ValidationError({"expiration": e.detail})


def _not_expired(value):
    """A delivery that has already expired cannot be put on the shelf."""
    if value and value < date.today():
        raise serializers.ValidationError("This expiry date has already passed. Expired stock cannot be received.")
    return value


def _set_prices(request, product, branch, d):
    """Save the branch price/cost when the admin sent them. Staff are refused, so a price is never changed at the
    counter by accident."""
    if "unitPrice" not in d and "unitCost" not in d:
        return
    if request.user.role != "admin":
        raise PermissionDenied("Only the admin sets prices.")
    fields = {k: d[src] for k, src in (("unit_price", "unitPrice"), ("unit_capital", "unitCost")) if src in d}
    ProductBranchPrice.objects.update_or_create(product=product, branch=branch, defaults=fields)


def _queryset(request):
    qs = Inventory.objects.select_related("product", "branch").prefetch_related("product__prices")
    return scope_branch(qs, request.user, requested_town=request.query_params.get("branch"))


def _log_adjustment(inv, before, after, user):
    if before == after:
        return
    InventoryTransaction.objects.create(
        txn_id=ledger_id(),
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
        require(request.user, "inventory", "Your position cannot add products.")
        s = InventoryInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        _expiry_field(d.get("expiration"))
        user = request.user
        if user.role == "staff":
            # Stock only arrives through Receive, so every unit on the shelf has a delivery in the stock history.
            if d["quantity"]:
                raise serializers.ValidationError({"quantity": "Add the product with 0 stock, then use Receive."})
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
            inventory_id=inventory_id(),
            product=product,
            branch=branch,
            quantity_on_hand=d["quantity"],
            reorder_point=d["reorderPoint"],
            delivery_date=d.get("delivery"),
            expiration_date=d.get("expiration"),
            photo=d.get("photo") or None,
        )
        _log_adjustment(inv, Decimal(0), d["quantity"], user)
        _set_prices(request, product, branch, d)
        inv = _queryset(request).get(pk=inv.pk)
        return Response(inventory_row(inv), status=status.HTTP_201_CREATED)


class InventoryDetail(APIView):
    permission_classes = [IsClinicStaff]

    def _get(self, request, pk):
        inv = _queryset(request).filter(pk=pk).first()
        if inv is None:
            raise NotFound()
        return inv

    @transaction.atomic
    def put(self, request, pk):
        require(request.user, "inventory", "Your position cannot edit products.")
        inv = self._get(request, pk)
        s = InventoryInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        before = inv.quantity_on_hand
        if request.user.role != "admin" and d["quantity"] != before:
            raise PermissionDenied("Only the admin can correct a stock count. Use Receive for deliveries.")
        product = inv.product
        product.product_name = d["name"].strip()
        product.category = d["category"].strip()
        product.save(update_fields=["product_name", "category"])
        inv.quantity_on_hand = d["quantity"]
        inv.reorder_point = d["reorderPoint"]
        inv.delivery_date = d.get("delivery")
        if d.get("expiration") != inv.expiration_date:  # an old record keeps its date; a new date must be ahead
            _expiry_field(d.get("expiration"))
        inv.expiration_date = d.get("expiration")
        if "photo" in d:
            inv.photo = d["photo"] or None
        inv.save()
        _log_adjustment(inv, before, d["quantity"], request.user)
        _set_prices(request, product, inv.branch, d)
        return Response(inventory_row(_queryset(request).get(pk=inv.pk)))

    patch = put

    def delete(self, request, pk):
        if request.user.role != "admin":
            raise PermissionDenied("Staff must submit a delete request for admin approval.")
        inv = self._get(request, pk)
        record(request, "product.delete", target=inv.inventory_id)
        inv.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


REPEAT_WINDOW = timedelta(minutes=10)  # how recent a delivery of the same item must be to ask "again?"


class InventoryReceive(APIView):
    """A delivery arrived: add it to the shelf and log it as a restock (not a correction), so the stock history can
    tell deliveries from adjustments. Staff (own branch) and the admin."""

    permission_classes = [IsClinicStaff]

    @transaction.atomic
    def post(self, request, pk):
        require(request.user, "inventory", "Your position cannot receive deliveries.")
        inv = _queryset(request).select_for_update(of=("self",)).filter(pk=pk).first()
        if inv is None:
            raise NotFound()
        s = ReceiveInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        # The same box entered twice (two people, or Save tapped again on a slow connection) would double the count:
        # a delivery of this item at this branch in the last few minutes must be confirmed before it is added again.
        # The stock history keeps only dates, so the audit log (exact time, who, how many) is the source here.
        recent = None if d["confirmRepeat"] else (
            AuditLog.objects.filter(action="stock.receive", target=inv.inventory_id,
                                    created_at__gte=timezone.now() - REPEAT_WINDOW)
            .select_related("user").order_by("-created_at").first()
        )
        if recent:
            by = recent.user.name if recent.user else (recent.email or "someone")
            return Response({
                "detail": f"{recent.detail} were already received a few minutes ago by {by}. Add this delivery again?",
                "repeat": {"quantity": recent.detail, "at": recent.created_at.isoformat(), "by": by},
            }, status=status.HTTP_409_CONFLICT)
        inv.quantity_on_hand += d["quantity"]
        inv.delivery_date = d.get("delivery") or date.today()
        if d.get("expiration"):
            inv.expiration_date = d["expiration"]
        inv.save(update_fields=["quantity_on_hand", "delivery_date", "expiration_date"])
        user = request.user
        InventoryTransaction.objects.create(
            txn_id=ledger_id(), product=inv.product, branch=inv.branch,
            txn_type="restock", quantity_change=d["quantity"], reference_id=inv.inventory_id,
            remarks=f"Delivery received by {user.name}", txn_date=date.today(),
            created_by=user.staff if user.staff_id else None,
        )
        record(request, "stock.receive", target=inv.inventory_id, detail=f"{d['quantity'].normalize():f}")  # "5", not "5.00"
        return Response(inventory_row(_queryset(request).get(pk=inv.pk)))
