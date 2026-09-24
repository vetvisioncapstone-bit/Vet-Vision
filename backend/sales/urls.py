from django.urls import path

from .views import SaleList

urlpatterns = [path("", SaleList.as_view())]
