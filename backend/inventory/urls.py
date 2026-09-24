from django.urls import path

from .views import InventoryDetail, InventoryList

urlpatterns = [
    path("", InventoryList.as_view()),
    path("<str:pk>/", InventoryDetail.as_view()),
]
