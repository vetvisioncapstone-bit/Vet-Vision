"""Custom DRF authentication: decode the JWT the normal simplejwt way, but
instead of loading a Django `auth_user` row (which doesn't exist in this
schema), load the `Staff` or `Customer` row named in the token's own claims.

request.user ends up being an actual Staff or Customer model instance, with
one extra `user_type` attribute ("staff" or "customer") so views/permissions
can tell the two apart.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from .models import Customer, Staff


class VetVisionJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user_type = validated_token.get("user_type")

        if user_type == "staff":
            staff_id = validated_token.get("staff_id")
            try:
                staff = Staff.objects.select_related("branch").get(
                    staff_id=staff_id, is_active=True
                )
            except Staff.DoesNotExist as exc:
                raise AuthenticationFailed("Staff account not found or inactive.") from exc
            staff.user_type = "staff"
            staff.is_authenticated = True
            return staff

        if user_type == "customer":
            customer_id = validated_token.get("customer_id")
            try:
                customer = Customer.objects.select_related("branch").get(
                    customer_id=customer_id, is_active=True
                )
            except Customer.DoesNotExist as exc:
                raise AuthenticationFailed("Customer account not found or inactive.") from exc
            customer.user_type = "customer"
            customer.is_authenticated = True
            return customer

        raise AuthenticationFailed("Token is missing a valid user_type claim.")
