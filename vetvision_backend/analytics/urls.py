from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BranchMonthlyKPIViewSet,
    DemandForecastView,
    FastMoverViewSet,
    SalesGrowthRateView,
    SlowMoverViewSet,
)

router = DefaultRouter()
router.register("kpi/monthly", BranchMonthlyKPIViewSet, basename="kpi-monthly")
router.register("fast-movers", FastMoverViewSet, basename="fast-mover")
router.register("slow-movers", SlowMoverViewSet, basename="slow-mover")

urlpatterns = router.urls + [
    path("kpi/growth-rate/", SalesGrowthRateView.as_view(), name="kpi-growth-rate"),
    path("forecast/", DemandForecastView.as_view(), name="demand-forecast"),
]
