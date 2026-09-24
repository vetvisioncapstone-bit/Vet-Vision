from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User


def user_payload(user):
    branch = None
    if user.staff_id:
        branch = user.staff.branch.town
    elif user.customer_id:
        branch = user.customer.branch.town
    return {
        "id": user.pk,
        "role": user.role,
        "name": user.name,
        "email": user.email,
        "photo": user.photo,
        "branch": branch,
        "staffId": user.staff_id,
        "position": user.staff.role if user.staff_id else None,
    }


class LoginView(APIView):
    authentication_classes = []
    permission_classes = []
    throttle_scope = "login"

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        password = request.data.get("password", "")
        user = authenticate(request, username=email, password=password)
        if user is None or not user.is_active:
            return Response({"detail": "Incorrect email or password."}, status=status.HTTP_401_UNAUTHORIZED)
        if user.staff_id and not user.staff.is_active:
            return Response({"detail": "This account has been deactivated."}, status=status.HTTP_401_UNAUTHORIZED)
        User.objects.filter(pk=user.pk).update(last_login=timezone.now())
        if user.staff_id:
            type(user.staff).objects.filter(pk=user.staff_id).update(last_login=timezone.now())
        refresh = RefreshToken.for_user(user)
        return Response({"access": str(refresh.access_token), "refresh": str(refresh), "user": user_payload(user)})


class MeView(APIView):
    def get(self, request):
        return Response(user_payload(request.user))

    def patch(self, request):
        """Edit own profile. Changing email or password requires the current password."""
        user = request.user
        data = request.data
        sensitive = ("email" in data and str(data["email"]).strip().lower() != user.email) or data.get("newPassword")
        if sensitive and not user.check_password(data.get("currentPassword", "")):
            return Response({"currentPassword": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
        if "name" in data:
            name = str(data["name"]).strip()
            if not name:
                return Response({"name": "Name is required."}, status=status.HTTP_400_BAD_REQUEST)
            user.name = name
        if "email" in data:
            email = str(data["email"]).strip().lower()
            if not email:
                return Response({"email": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
            if User.objects.exclude(pk=user.pk).filter(email=email).exists():
                return Response({"email": "That email is already in use."}, status=status.HTTP_400_BAD_REQUEST)
            user.email = email
        if "photo" in data:
            user.photo = data["photo"] or None
        if data.get("newPassword"):
            try:
                validate_password(data["newPassword"], user)
            except DjangoValidationError as e:
                return Response({"newPassword": list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(data["newPassword"])
        user.save()
        return Response(user_payload(user))
