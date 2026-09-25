import re

import pytest
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.test import APIClient

from accounts.models import AuditLog
from clinic.models import Customer

from .conftest import PASSWORD, client_for

PUBLIC = {"/api/auth/login/", "/api/auth/refresh/", "/api/auth/logout/", "/api/auth/register/", "/api/health/"}
# Everything a customer may reach; the rest of the API must answer 403.
CUSTOMER_OK = {"/api/auth/me/", "/api/me/pets/", "/api/me/reminders/", "/api/events/posts/", "/api/branches/",
               "/api/clinic/calendar/"}
ADMIN_ONLY_PREFIXES = ("/api/analytics/", "/api/staff-accounts/", "/api/auth/audit/", "/api/requests/1/",
                       "/api/consultations/")


def api_routes():
    """Every /api/ route with its <params> filled in, found by walking the URL config."""
    out = []

    def walk(patterns, prefix):
        for p in patterns:
            route = prefix + str(p.pattern)
            if isinstance(p, URLResolver):
                walk(p.url_patterns, route)
            elif isinstance(p, URLPattern) and route.startswith("api/"):
                out.append("/" + re.sub(r"<int:\w+>", "1", re.sub(r"<str:\w+>", "x", route)))

    walk(get_resolver().url_patterns, "")
    return sorted(set(out))


ROUTES = api_routes()


def test_route_walker_finds_the_api():
    assert len(ROUTES) >= 25 and "/api/patients/" in ROUTES


@pytest.mark.parametrize("path", [r for r in ROUTES if r not in PUBLIC])
def test_every_route_rejects_anonymous_callers(api, path):
    for method in ("get", "post", "put", "patch", "delete"):
        assert getattr(api, method)(path).status_code == 401, (method, path)


@pytest.mark.parametrize("path", [r for r in ROUTES if r not in PUBLIC | CUSTOMER_OK])
def test_customers_are_locked_out_of_clinic_endpoints(admin, path):
    from accounts.models import User
    from clinic.models import Branch
    from datetime import date

    branch = Branch.objects.create(branch_id="BR-009", branch_name="B", town="Ibaan", address="a", date_opened=date(2021, 1, 1))
    cust = Customer.objects.create(customer_id="CUS-1", branch=branch, customer_name="C One", email="c@x.ph", is_active=True)
    user = User.objects.create_user("c@x.ph", PASSWORD, name="C One", role="customer", customer=cust)
    c = client_for(user)
    for method in ("get", "post", "put", "patch", "delete"):
        assert getattr(c, method)(path).status_code == 403, (method, path)


@pytest.mark.parametrize("path", [r for r in ROUTES if r.startswith(ADMIN_ONLY_PREFIXES)])
def test_staff_cannot_reach_admin_only_endpoints(staff_ibaan, path):
    c = client_for(staff_ibaan)
    for method in ("get", "post", "put", "patch", "delete"):
        assert getattr(c, method)(path).status_code == 403, (method, path)


def test_account_locks_after_repeated_failures_and_success_resets(api, staff_ibaan):
    for _ in range(5):
        assert api.post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": "bad"}).status_code == 401
    # Even the right password is refused while locked, and the lock is per account, not per address.
    assert api.post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": PASSWORD}).status_code == 429
    assert api.post("/api/auth/login/", {"email": "ben@ecovet.ph", "password": "bad"}).status_code == 401
    assert AuditLog.objects.filter(action="login_locked", email="ana@ecovet.ph").count() == 1


GOOD = {"email": "ana@ecovet.ph", "password": PASSWORD}


def test_a_good_login_clears_earlier_failures(api, staff_ibaan):
    for _ in range(4):
        api.post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": "bad"})
    assert api.post("/api/auth/login/", GOOD).status_code == 200
    for _ in range(4):
        api.post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": "bad"})
    assert api.post("/api/auth/login/", GOOD).status_code == 200


def _login(api, email="ana@ecovet.ph"):
    return api.post("/api/auth/login/", {"email": email, "password": PASSWORD}).data


def test_refresh_rotates_and_the_old_token_dies(api, staff_ibaan):
    first = _login(api)["refresh"]
    second = api.post("/api/auth/refresh/", {"refresh": first}).data["refresh"]
    assert second != first
    assert api.post("/api/auth/refresh/", {"refresh": first}).status_code == 401  # replayed copy is refused
    assert api.post("/api/auth/refresh/", {"refresh": second}).status_code == 200


def test_logout_revokes_the_refresh_token(api, staff_ibaan):
    tokens = _login(api)
    assert api.post("/api/auth/logout/", {"refresh": tokens["refresh"]}).status_code == 204
    assert api.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}).status_code == 401
    assert api.post("/api/auth/logout/", {"refresh": "garbage"}).status_code == 204  # never leaks or errors
    assert AuditLog.objects.filter(action="logout").exists()


def test_password_change_signs_other_sessions_out(api, staff_ibaan):
    other = _login(APIClient())
    mine = _login(api)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {mine['access']}")
    r = c.patch("/api/auth/me/", {"currentPassword": PASSWORD, "newPassword": "An0ther!Passw0rd"})
    assert r.status_code == 200 and r.data["tokens"]["refresh"]
    assert api.post("/api/auth/refresh/", {"refresh": other["refresh"]}).status_code == 401
    assert api.post("/api/auth/refresh/", {"refresh": mine["refresh"]}).status_code == 401
    assert api.post("/api/auth/refresh/", {"refresh": r.data["tokens"]["refresh"]}).status_code == 200


def test_deactivating_staff_stops_an_existing_session(api, admin, staff_ibaan):
    tokens = _login(api)
    assert client_for(admin).delete(f"/api/staff-accounts/{staff_ibaan.staff_id}/").status_code == 204
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert c.get("/api/auth/me/").status_code == 401
    assert api.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}).status_code == 401


def test_audit_log_records_sensitive_actions_for_admin_only(api, admin, staff_ibaan, stocked):
    _login(api)
    api.post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": "bad"})
    client_for(admin).delete(f"/api/inventory/{stocked[0].inventory_id}/")
    rows = client_for(admin).get("/api/auth/audit/").data
    actions = {r["action"] for r in rows}
    assert {"login", "login_failed", "product.delete"} <= actions
    assert client_for(staff_ibaan).get("/api/auth/audit/").status_code == 403


def test_audit_log_is_paginated_and_searchable(admin, staff_ibaan, api):
    _login(api)
    r = client_for(admin).get("/api/auth/audit/", {"page": 1, "pageSize": 5, "q": "ana@"})
    assert r.status_code == 200 and r.data["count"] >= 1
