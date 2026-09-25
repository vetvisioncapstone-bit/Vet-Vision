from .conftest import PASSWORD, client_for


def test_login_returns_tokens_and_profile(api, staff_ibaan):
    r = api.post("/api/auth/login/", {"email": "ANA@ecovet.ph", "password": PASSWORD})
    assert r.status_code == 200
    assert r.data["user"]["role"] == "staff" and r.data["user"]["branch"] == "Ibaan"
    assert r.data["access"] and r.data["refresh"]


def test_login_rejects_bad_password(api, staff_ibaan):
    r = api.post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": "nope"})
    assert r.status_code == 401


def test_deactivated_staff_cannot_login(api, staff_ibaan):
    staff_ibaan.staff.is_active = False
    staff_ibaan.staff.save()
    assert api.post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": PASSWORD}).status_code == 401


def test_endpoints_require_authentication(api):
    for url in ("/api/inventory/", "/api/patients/", "/api/sales/", "/api/staff-accounts/", "/api/events/posts/"):
        assert api.get(url).status_code == 401


def test_me_requires_current_password_for_password_change(admin):
    c = client_for(admin)
    assert c.patch("/api/auth/me/", {"newPassword": "An0ther!Passw0rd"}).status_code == 400
    ok = c.patch("/api/auth/me/", {"newPassword": "An0ther!Passw0rd", "currentPassword": PASSWORD})
    assert ok.status_code == 200
    admin.refresh_from_db()
    assert admin.check_password("An0ther!Passw0rd")


def test_staff_cannot_use_admin_endpoints(staff_ibaan):
    c = client_for(staff_ibaan)
    assert c.get("/api/staff-accounts/").status_code == 403


def test_health_check_is_public(api, db):
    r = api.get("/api/health/")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
