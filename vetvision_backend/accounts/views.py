from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Customer, Staff
from .permissions import IsCustomer, IsStaff
from .serializers import (
    ChangePasswordSerializer,
    CustomerLoginSerializer,
    CustomerMeSerializer,
    StaffLoginSerializer,
    StaffMeSerializer,
)
from .tokens import issue_tokens_for_customer, issue_tokens_for_staff


class StaffLoginView(APIView):
    """POST {username, password} -> {access, refresh}. Used by the admin
    dashboard and the employee panel alike — `role` in the token tells the
    frontend which UI to route to."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = StaffLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            staff = Staff.objects.get(
                username=serializer.validated_data["username"], is_active=True
            )
        except Staff.DoesNotExist:
            return Response({"detail": "Invalid credentials."}, status=401)

        if not staff.check_password(serializer.validated_data["password"]):
            return Response({"detail": "Invalid credentials."}, status=401)

        staff.last_login = timezone.now()
        staff.save(update_fields=["last_login"])

        tokens = issue_tokens_for_staff(staff)
        return Response({**tokens, "staff": StaffMeSerializer(staff).data})


class CustomerLoginView(APIView):
    """POST {email, password} -> {access, refresh}. Used by the customer
    portal only."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CustomerLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            customer = Customer.objects.get(
                email=serializer.validated_data["email"], is_active=True
            )
        except Customer.DoesNotExist:
            return Response({"detail": "Invalid credentials."}, status=401)

        if not customer.check_password(serializer.validated_data["password"]):
            return Response({"detail": "Invalid credentials."}, status=401)

        customer.last_login = timezone.now()
        customer.save(update_fields=["last_login"])

        tokens = issue_tokens_for_customer(customer)
        return Response({**tokens, "customer": CustomerMeSerializer(customer).data})


class StaffMeView(APIView):
    permission_classes = [IsStaff]

    def get(self, request):
        return Response(StaffMeSerializer(request.user).data)


class CustomerMeView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        return Response(CustomerMeSerializer(request.user).data)


class ChangePasswordView(APIView):
    """Works for whichever kind of account is currently authenticated
    (staff or customer) — request.user is a real Staff/Customer instance
    either way, and both implement set_password/check_password the same
    way (see accounts/models.py)."""

    permission_classes = [IsStaff | IsCustomer]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data["old_password"]):
            return Response({"detail": "Current password is incorrect."}, status=400)

        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password_hash"])
        return Response({"detail": "Password updated."})
