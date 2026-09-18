from rest_framework.routers import DefaultRouter

from .views import MedicalRecordViewSet, PetViewSet

router = DefaultRouter()
router.register("pets", PetViewSet, basename="pet")
router.register("medical-records", MedicalRecordViewSet, basename="medical-record")

urlpatterns = router.urls
