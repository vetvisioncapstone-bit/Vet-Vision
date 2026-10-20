from django.urls import path

from .views import InventoryDetail, InventoryList, InventoryReceive

urlpatterns = [
    path("", InventoryList.as_view()),
    path("<str:pk>/", InventoryDetail.as_view()),
    path("<str:pk>/receive/", InventoryReceive.as_view()),
]
