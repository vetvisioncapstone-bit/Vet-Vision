"""Audit trail and the failed-login lockout that is built on it."""
from datetime import timedelta

from django.utils import timezone

from .models import AuditLog

LOCK_AFTER = 5       # failed sign-ins for one email ...
LOCK_MINUTES = 15    # ... within this window lock further attempts


def client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    return (forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR")) or None


def record(request, action, target="", detail="", user=None, email=""):
    user = user or getattr(request, "user", None)
    if user is not None and not user.is_authenticated:
        user = None
    AuditLog.objects.create(
        user=user, email=(email or (user.email if user else ""))[:254], action=action,
        target=str(target)[:120], detail=str(detail)[:255], ip=client_ip(request),
    )


def is_locked(email):
    """True after LOCK_AFTER failures since the last successful sign-in, inside the window. Keyed on the email
    (not only the IP) so a distributed guessing attack on one account is stopped too."""
    since = timezone.now() - timedelta(minutes=LOCK_MINUTES)
    last_ok = (AuditLog.objects.filter(email=email, action="login", created_at__gte=since)
               .values_list("created_at", flat=True).first())
    failures = AuditLog.objects.filter(email=email, action="login_failed", created_at__gte=last_ok or since)
    return failures.count() >= LOCK_AFTER
