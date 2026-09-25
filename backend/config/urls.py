from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

def health(request):
    """Public liveness check for the host: 200 when the app can reach its database."""
    from django.db import connection

    with connection.cursor() as c:
        c.execute("SELECT 1")
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("api/health/", health),
    path("api/auth/", include("accounts.urls")),
    path("api/inventory/", include("inventory.urls")),
    path("api/sales/", include("sales.urls")),
    path("api/analytics/", include("analytics.urls")),
    path("api/", include("clinic.urls")),
    path("api/", include("engagement.urls")),
]

if settings.ENABLE_DJANGO_ADMIN:
    urlpatterns.insert(0, path("admin/", admin.site.urls))
