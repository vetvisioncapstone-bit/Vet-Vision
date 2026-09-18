from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaff

from .forecasting import moving_average_forecast
from .models import BranchMonthlyKPI, FastMover, SlowMover
from .serializers import BranchMonthlyKPISerializer, FastMoverSerializer, SlowMoverSerializer


class BranchMonthlyKPIViewSet(viewsets.ReadOnlyModelViewSet):
    """Wraps v_branch_monthly_kpi — Sales per Branch, Service Transactions
    per Branch, gross/profit, already aggregated in SQL (thesis KPIs 1 & 3).
    Non-admin staff are locked to their own branch."""

    serializer_class = BranchMonthlyKPISerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = BranchMonthlyKPI.objects.all()
        user = self.request.user
        if not user.is_admin:
            qs = qs.filter(branch_id=user.branch_id)
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        month_from = self.request.query_params.get("month_from")
        if month_from:
            qs = qs.filter(month__gte=month_from)
        month_to = self.request.query_params.get("month_to")
        if month_to:
            qs = qs.filter(month__lte=month_to)
        return qs


class SalesGrowthRateView(APIView):
    """Thesis KPI 2: Sales Growth Rate = ((current - previous) / previous)
    * 100%, computed month-over-month per branch from the same KPI view."""

    permission_classes = [IsStaff]

    def get(self, request):
        user = request.user
        branch_id = request.query_params.get("branch_id") or (
            None if user.is_admin else user.branch_id
        )
        qs = BranchMonthlyKPI.objects.all().order_by("branch_id", "month")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        rows = list(qs.values("branch_id", "branch_name", "month", "total_gross"))
        results = []
        prev_by_branch = {}
        for row in rows:
            prev = prev_by_branch.get(row["branch_id"])
            growth_rate = None
            if prev and prev["total_gross"]:
                growth_rate = round(
                    float((row["total_gross"] - prev["total_gross"]) / prev["total_gross"]) * 100,
                    2,
                )
            results.append(
                {
                    "branch_id": row["branch_id"],
                    "branch_name": row["branch_name"],
                    "month": row["month"],
                    "total_gross": row["total_gross"],
                    "sales_growth_rate_pct": growth_rate,
                }
            )
            prev_by_branch[row["branch_id"]] = row
        return Response(results)


class FastMoverViewSet(viewsets.ReadOnlyModelViewSet):
    """v_fast_movers — best sellers in the trailing 90 days (thesis KPI 7)."""

    serializer_class = FastMoverSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = FastMover.objects.all()
        user = self.request.user
        if not user.is_admin:
            qs = qs.filter(branch_id=user.branch_id)
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs


class SlowMoverViewSet(viewsets.ReadOnlyModelViewSet):
    """v_slow_movers — same window, opposite end (thesis KPI 7)."""

    serializer_class = SlowMoverSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = SlowMover.objects.all()
        user = self.request.user
        if not user.is_admin:
            qs = qs.filter(branch_id=user.branch_id)
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs


class DemandForecastView(APIView):
    """GET ?branch_id=&product_id=&window=3 -> Moving Average forecast +
    MAE/MAPE (thesis KPI 8, Section 3.6). See analytics/forecasting.py."""

    permission_classes = [IsStaff]

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        product_id = request.query_params.get("product_id")
        window = int(request.query_params.get("window", 3))

        if not branch_id or not product_id:
            return Response({"detail": "branch_id and product_id are required."}, status=400)

        return Response(moving_average_forecast(branch_id, product_id, window=window))
