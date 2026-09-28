from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import paginate, wants_page
from core.ids import branch_letter, next_id
from accounts.audit import record
from core.permissions import IsClinicStaff, branch_by_town, scope_branch
from clinic.models import Customer
from inventory.models import Inventory, InventoryTransaction, ProductBranchPrice

from .models import Sale, SaleDetail


def sale_row(sale):
    when = datetime.combine(sale.sale_date, sale.sale_time or datetime.min.time())
    return {
        "id": sale.sale_id,
        "branch": sale.branch.town,
        "staffId": sale.staff_id,
        "staffName": sale.staff.staff_name if sale.staff_id else "",
        "customerId": sale.customer_id,
        "customerName": sale.customer.customer_name if sale.customer_id else "",
        "items": [
            {
                "productId": d.product_id,
                "name": d.product.product_name,
                "quantity": d.quantity,
                "price": float(d.unit_price or 0),
            }
            for d in sale.details.all()
        ],
        "total": float(sale.total_amount or 0),
        "createdAt": when.isoformat(timespec="seconds"),
    }


class SaleItemInput(serializers.Serializer):
    inventoryId = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)


class SaleInput(serializers.Serializer):
    items = SaleItemInput(many=True, allow_empty=False)
    branch = serializers.CharField(required=False)
    customerId = serializers.CharField(required=False, allow_blank=True, max_length=10)  # blank = walk-in
    paymentMethod = serializers.CharField(required=False, max_length=15, default="Cash")


def create_sale(request, branch, items, customer=None, on=None, payment_method="Cash"):
    """Record a product sale at `branch`: items are {inventoryId, quantity, price}. Used by the Sales page and by a
    consultation that hands out products. Call inside a transaction. `on` (a date) defaults to now.
    The AFTER INSERT trigger on sale_detail deducts the stock and logs the movement, so nothing here touches stock."""
    # Lock the stock rows so two concurrent sales cannot both pass the availability check.
    wanted = {}
    for item in items:
        wanted[item["inventoryId"]] = wanted.get(item["inventoryId"], 0) + item["quantity"]
    stock = {
        i.inventory_id: i
        for i in Inventory.objects.select_for_update().select_related("product").filter(pk__in=wanted)
    }
    for inv_id, qty in wanted.items():
        inv = stock.get(inv_id)
        if inv is None or inv.branch_id != branch.branch_id:
            raise serializers.ValidationError({"items": f"Product {inv_id} is not stocked at this branch."})
        if inv.quantity_on_hand < qty:
            raise serializers.ValidationError(
                {"items": f"Only {int(inv.quantity_on_hand)} of {inv.product.product_name} left in stock."}
            )

    now = timezone.localtime()
    user = request.user
    staff = user.staff if user.staff_id else None
    sale = Sale.objects.create(
        sale_id=next_id(Sale, "sale_id", f"SL-{branch_letter(branch.branch_id)}-", 6),
        branch=branch,
        staff=staff,
        created_by=staff,
        customer=customer,
        sale_date=on or now.date(),
        sale_time=now.time().replace(microsecond=0),
        payment_method=payment_method,
        payment_status="Paid",
        total_amount=Decimal(0),
    )
    total = Decimal(0)
    record(request, "sale.create", target=sale.sale_id)
    for item in items:
        inv = stock[item["inventoryId"]]
        price = ProductBranchPrice.objects.filter(product=inv.product, branch=branch).first()
        capital = (price.unit_capital if price and price.unit_capital is not None else Decimal(0))
        unit_price = Decimal(str(item["price"]))
        qty = item["quantity"]
        line_total = unit_price * qty
        line_capital = capital * qty
        total += line_total
        SaleDetail.objects.create(
            sale_detail_id=next_id(SaleDetail, "sale_detail_id", "SD-", 7),
            sale=sale,
            product=inv.product,
            quantity=qty,
            unit_price=unit_price,
            unit_capital=capital,
            line_total=line_total,
            line_capital=line_capital,
            line_profit=line_total - line_capital,
        )
    sale.total_amount = total
    sale.save(update_fields=["total_amount"])
    return sale


def undo_sale(sale, reason):
    """Remove a sale and put its products back on the shelf (the stock trigger only runs on insert, so the return
    is done and logged here). Call inside a transaction."""
    for d in sale.details.select_related("product"):
        inv = Inventory.objects.select_for_update().filter(product=d.product, branch=sale.branch).first()
        if inv is not None:
            inv.quantity_on_hand += d.quantity
            inv.save(update_fields=["quantity_on_hand"])
        InventoryTransaction.objects.create(
            txn_id=next_id(InventoryTransaction, "txn_id", "ITX-", 8), product=d.product, branch=sale.branch,
            txn_type="return", quantity_change=d.quantity, reference_id=sale.sale_id, remarks=reason,
            txn_date=timezone.localdate(),
        )
    sale.delete()


class SaleList(APIView):
    permission_classes = [IsClinicStaff]

    def get(self, request):
        qs = Sale.objects.select_related("branch", "staff", "customer").prefetch_related("details__product")
        qs = scope_branch(qs, request.user, requested_town=request.query_params.get("branch"))
        since = request.query_params.get("since")
        if since:
            qs = qs.filter(sale_date__gte=since)
        qs = qs.order_by("-sale_date", "-sale_time", "-sale_id")
        if wants_page(request):
            return paginate(request, qs, sale_row)
        try:
            limit = min(int(request.query_params.get("limit", 200)), 1000)
        except ValueError:
            limit = 200
        return Response([sale_row(s) for s in qs[:limit]])

    @transaction.atomic
    def post(self, request):
        s = SaleInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        user = request.user
        branch = user.staff.branch if user.role == "staff" else branch_by_town(d.get("branch") or "")
        customer = None
        if d.get("customerId"):
            customer = Customer.objects.filter(pk=d["customerId"], branch=branch).first()
            if customer is None:
                raise serializers.ValidationError({"customerId": "That owner is not on this branch's records."})
        sale = create_sale(request, branch, d["items"], customer=customer,
                           payment_method=d.get("paymentMethod", "Cash"))
        sale = (Sale.objects.select_related("branch", "staff", "customer").prefetch_related("details__product")
                .get(pk=sale.pk))
        return Response(sale_row(sale), status=status.HTTP_201_CREATED)
