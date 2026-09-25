from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.utils import timezone
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from clinic.models import Customer

from core.pagination import paginate, wants_page
from core.ids import branch_letter, next_id
from core.permissions import IsAdmin, branch_by_town

from .audit import is_locked, record
from .models import AuditLog, User


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
        "customerId": user.customer_id,
        "mustChangePassword": user.must_change_password,
    }


def revoke_sessions(user):
    """Sign the user out everywhere: blacklist every refresh token issued to them."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def session_response(user, status_code=200):
    refresh = RefreshToken.for_user(user)
    return Response({"access": str(refresh.access_token), "refresh": str(refresh), "user": user_payload(user)},
                    status=status_code)


class RegisterInput(serializers.Serializer):
    firstName = serializers.CharField(max_length=60)
    lastName = serializers.CharField(max_length=60)
    email = serializers.EmailField(max_length=100)
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    mobile = serializers.CharField(max_length=20, required=False, allow_blank=True)
    address = serializers.CharField(max_length=120, required=False, allow_blank=True)
    branch = serializers.CharField(required=False, allow_blank=True)


class RegisterView(APIView):
    """A pet owner creates their own account (customer portal). Signs them straight in."""

    authentication_classes = []
    permission_classes = []
    throttle_scope = "register"

    @transaction.atomic
    def post(self, request):
        s = RegisterInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        email = d["email"].strip().lower()
        if User.objects.filter(email=email).exists() or Customer.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({"email": "An account with this email already exists. Try signing in."})
        try:
            validate_password(d["password"])
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)})
        branch = branch_by_town(d.get("branch") or "Ibaan")
        first, last = d["firstName"].strip(), d["lastName"].strip()
        customer = Customer.objects.create(
            customer_id=next_id(Customer, "customer_id", f"CUS-{branch_letter(branch.branch_id)}", 4),
            branch=branch, first_name=first, last_name=last, customer_name=f"{first} {last}"[:80], email=email,
            contact_no=d.get("mobile") or None, address=d.get("address") or None, date_registered=timezone.localdate(),
            is_active=True,
        )
        user = User.objects.create_user(email=email, password=d["password"], name=customer.customer_name,
                                        role=User.ROLE_CUSTOMER, customer=customer)
        record(request, "register", target=customer.customer_id, user=user)
        return session_response(user, status.HTTP_201_CREATED)


def customer_first_login(email, password):
    """Customers from the legacy data have a password hash on the customer row but no login user yet.
    Create the linked user the first time they sign in with it. Once a user exists, the customer row's
    hash is ignored, so an old password never keeps working after a change."""
    customer = Customer.objects.filter(email__iexact=email, is_active=True).first()
    if not customer or not customer.password_hash or hasattr(customer, "user"):
        return None
    if User.objects.filter(email=email).exists() or not check_password(password, customer.password_hash):
        return None
    return User.objects.create(
        email=email,
        name=customer.customer_name,
        role=User.ROLE_CUSTOMER,
        customer=customer,
        password=customer.password_hash,
        must_change_password=True,
    )


class LoginView(APIView):
    authentication_classes = []
    permission_classes = []
    throttle_scope = "login"

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        password = request.data.get("password", "")
        if is_locked(email):
            record(request, "login_locked", email=email)
            return Response({"detail": "Too many failed attempts. Try again in 15 minutes."},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        user = authenticate(request, username=email, password=password) or customer_first_login(email, password)
        if user is None or not user.is_active or (user.staff_id and not user.staff.is_active):
            record(request, "login_failed", email=email)
            return Response({"detail": "Incorrect email or password."}, status=status.HTTP_401_UNAUTHORIZED)
        record(request, "login", user=user)
        User.objects.filter(pk=user.pk).update(last_login=timezone.now())
        if user.customer_id:
            Customer.objects.filter(pk=user.customer_id).update(last_login=timezone.now())
        if user.staff_id:
            type(user.staff).objects.filter(pk=user.staff_id).update(last_login=timezone.now())
        return session_response(user)


class LogoutView(APIView):
    """Blacklist the refresh token so a copied one stops working. Holding the token is the proof, so no access
    token is needed (it may already have expired)."""

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        try:
            token = RefreshToken(request.data.get("refresh", ""))
            user = User.objects.filter(pk=token["user_id"]).first()
            token.blacklist()
            if user:
                record(request, "logout", user=user)
        except (TokenError, KeyError):
            pass  # already invalid: nothing to revoke
        return Response(status=status.HTTP_204_NO_CONTENT)


class SafeRefreshSerializer(TokenRefreshSerializer):
    """simplejwt looks the user up with .get() and lets DoesNotExist escape, so a refresh token whose user was
    deleted produced a 500. Treat it as an invalid token (401) instead."""

    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except User.DoesNotExist:
            raise InvalidToken("The account for this token no longer exists.")


class RefreshView(TokenRefreshView):
    serializer_class = SafeRefreshSerializer
    throttle_scope = "refresh"


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
            user.must_change_password = False
        user.save()
        payload = user_payload(user)
        if data.get("newPassword"):
            # A password change ends every other session; this one continues on a fresh token pair.
            revoke_sessions(user)
            fresh = RefreshToken.for_user(user)
            payload["tokens"] = {"access": str(fresh.access_token), "refresh": str(fresh)}
            record(request, "password_change")
        return Response(payload)


class AuditList(APIView):
    """GET /api/auth/audit/?q=&page=&pageSize= - newest first. Admin only."""

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = AuditLog.objects.all()
        q = request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(Q(email__icontains=q) | Q(action__icontains=q) | Q(target__icontains=q))

        def row(a):
            return {"id": a.pk, "at": a.created_at.isoformat(), "email": a.email, "action": a.action,
                    "target": a.target, "detail": a.detail, "ip": a.ip}

        if wants_page(request):
            return paginate(request, qs, row)
        return Response([row(a) for a in qs[:200]])
