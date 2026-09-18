from rest_framework.routers import DefaultRouter

from .views import ServiceTransactionViewSet

router = DefaultRouter()
router.register("", ServiceTransactionViewSet, basename="service-transaction")

urlpatterns = router.urls
