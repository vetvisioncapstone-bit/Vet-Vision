from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission

from clinic.models import Branch


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role == "admin")


class IsClinicStaff(BasePermission):
    """Admin or staff (not customers)."""

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role in ("admin", "staff"))


class IsCustomer(BasePermission):
    """A pet owner signed in to the customer portal, linked to a customer row."""

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role == "customer" and u.customer_id)


# What each staff position may do, besides viewing its own branch and sending requests to the admin (the admin may do
# everything). Abilities:
#   patients.edit  register owners and pets, edit their details
#   consult        log a visit: findings, weight, services, signed waivers
#   clinical       prescriptions and laboratory results on a visit
#   sales          counter sales, and products handed out on a visit
#   inventory      receive deliveries, add products, edit product details (never the stock count: admin only)
VET = {"patients.edit", "consult", "clinical", "sales", "inventory"}
FRONT_DESK = {"patients.edit", "sales", "inventory"}
ASSISTANT = {"consult"}
POSITION_ABILITIES = {
    "Owner": VET,
    "Veterinarian": VET,
    "Secretary": FRONT_DESK,
    "Receptionist": FRONT_DESK,
    "Groomer": ASSISTANT,
    "Groomer / Vet Assistant": ASSISTANT,
    "Veterinary Assistant": ASSISTANT,
    "Veterinary Technician": ASSISTANT,
    "Inventory Clerk": {"inventory"},
}  # a position not listed here can only view (least privilege)
ALL_ABILITIES = sorted(VET)


def abilities(user):
    if user.role == "admin":
        return set(ALL_ABILITIES)
    if user.role == "staff" and user.staff_id:
        return POSITION_ABILITIES.get(user.staff.role, set())
    return set()


def require(user, ability, message):
    if ability not in abilities(user):
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied(message)


def branch_by_town(town):
    """The frontend identifies branches by town ('Ibaan' / 'San Jose')."""
    try:
        return Branch.objects.get(town=town)
    except Branch.DoesNotExist:
        raise ValidationError({"branch": f"Unknown branch '{town}'."})


def user_branch_id(user):
    """Branch a staff user is confined to; None for admins (all branches)."""
    if user.role == "admin":
        return None
    return user.branch_id


def scope_branch(qs, user, field="branch_id", requested_town=None):
    """Limit a queryset to the user's branch (staff) or an optional ?branch=<town> filter (admin)."""
    bid = user_branch_id(user)
    if bid is not None:
        return qs.filter(**{field: bid})
    if requested_town and requested_town != "All Branches":
        return qs.filter(**{f"{field.rsplit('_id', 1)[0]}__town": requested_town})
    return qs


def assert_branch_access(user, branch_id):
    """Staff may only touch rows of their own branch."""
    bid = user_branch_id(user)
    if bid is not None and bid != branch_id:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("This record belongs to another branch.")
