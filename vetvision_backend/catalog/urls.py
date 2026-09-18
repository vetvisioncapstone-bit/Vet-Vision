from rest_framework.routers import DefaultRouter

from .views import ProductViewSet, ServiceProductUsageViewSet, ServiceViewSet

router = DefaultRouter()
router.register("products", ProductViewSet, basename="product")
router.register("services", ServiceViewSet, basename="service")
router.register("service-product-usage", ServiceProductUsageViewSet, basename="service-product-usage")

urlpatterns = router.urls
