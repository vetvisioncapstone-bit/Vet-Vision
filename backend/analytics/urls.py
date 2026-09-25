from django.urls import path

from .views import Forecast, InventoryAnalytics, Live, Overview, ReportData, SalesAnalytics

urlpatterns = [
    path("overview/", Overview.as_view()),
    path("live/", Live.as_view()),
    path("sales/", SalesAnalytics.as_view()),
    path("inventory/", InventoryAnalytics.as_view()),
    path("forecast/", Forecast.as_view()),
    path("report/", ReportData.as_view()),
]
