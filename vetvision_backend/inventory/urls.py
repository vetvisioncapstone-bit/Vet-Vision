from rest_framework.routers import DefaultRouter

from .views import InventoryTransactionViewSet, InventoryViewSet

router = DefaultRouter()
router.register("stock", InventoryViewSet, basename="inventory")
router.register("transactions", InventoryTransactionViewSet, basename="inventory-transaction")

urlpatterns = router.urls
