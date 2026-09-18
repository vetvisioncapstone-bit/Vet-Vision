"""Manual JWT issuance for the two login flows (staff / customer).

We deliberately don't use AUTH_USER_MODEL + TokenObtainPairView here: there
is no single "user" table in this schema, just `staff` and `customer`, each
with its own login. simplejwt's RefreshToken can be built with no user at
all — you just set whatever claims you want on it directly — which is the
documented pattern for exactly this situation.
"""

from rest_framework_simplejwt.tokens import RefreshToken


def issue_tokens_for_staff(staff) -> dict:
    refresh = RefreshToken()
    refresh["user_type"] = "staff"
    refresh["staff_id"] = staff.staff_id
    refresh["branch_id"] = staff.branch_id
    refresh["role"] = staff.role
    refresh["is_admin"] = staff.is_admin
    refresh["name"] = staff.staff_name
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


def issue_tokens_for_customer(customer) -> dict:
    refresh = RefreshToken()
    refresh["user_type"] = "customer"
    refresh["customer_id"] = customer.customer_id
    refresh["branch_id"] = customer.branch_id
    refresh["name"] = customer.customer_name
    return {"refresh": str(refresh), "access": str(refresh.access_token)}
