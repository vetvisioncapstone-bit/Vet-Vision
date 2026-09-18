from django.urls import include, path

urlpatterns = [
    path("api/auth/", include("accounts.urls")),
    path("api/branches/", include("branches.urls")),
    path("api/catalog/", include("catalog.urls")),
    path("api/inventory/", include("inventory.urls")),
    path("api/sales/", include("sales.urls")),
    path("api/services/", include("service_ops.urls")),
    path("api/patients/", include("patients.urls")),
    path("api/notifications/", include("communications.urls")),
    path("api/analytics/", include("analytics.urls")),
]
