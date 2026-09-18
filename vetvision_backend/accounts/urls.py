from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    CustomerLoginView,
    CustomerMeView,
    StaffLoginView,
    StaffMeView,
)

urlpatterns = [
    path("staff/login/", StaffLoginView.as_view(), name="staff-login"),
    path("staff/me/", StaffMeView.as_view(), name="staff-me"),
    path("customer/login/", CustomerLoginView.as_view(), name="customer-login"),
    path("customer/me/", CustomerMeView.as_view(), name="customer-me"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
]
