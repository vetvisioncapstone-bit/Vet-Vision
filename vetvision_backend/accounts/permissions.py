from rest_framework.permissions import BasePermission


class IsStaff(BasePermission):
    """Any authenticated staff member (any job title) — the admin/employee
    side of the app, as opposed to the customer portal."""

    def has_permission(self, request, view):
        return getattr(request.user, "user_type", None) == "staff"


class IsAdminStaff(BasePermission):
    """Staff whose job title is in settings.ADMIN_JOB_ROLES — branch
    comparisons, user management, system settings, etc. See
    accounts/models.py Staff.is_admin for why this isn't a schema column."""

    def has_permission(self, request, view):
        return (
            getattr(request.user, "user_type", None) == "staff"
            and getattr(request.user, "is_admin", False)
        )


class IsCustomer(BasePermission):
    """Authenticated customer-portal user."""

    def has_permission(self, request, view):
        return getattr(request.user, "user_type", None) == "customer"


class IsSameBranchOrAdmin(BasePermission):
    """Object-level check: staff can only touch records in their own
    branch, unless they're an admin-tier staff member."""

    def has_object_permission(self, request, view, obj):
        if getattr(request.user, "user_type", None) != "staff":
            return False
        if request.user.is_admin:
            return True
        obj_branch_id = getattr(obj, "branch_id", None)
        return obj_branch_id == request.user.branch_id
