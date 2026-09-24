from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission

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


class AdminWriteStaffRead(BasePermission):
    """Any clinic user may read; only admins may write."""

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated and u.role in ("admin", "staff")):
            return False
        return request.method in SAFE_METHODS or u.role == "admin"


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
