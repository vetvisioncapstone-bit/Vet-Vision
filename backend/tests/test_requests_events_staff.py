from rest_framework.test import APIClient

from accounts.models import AuditLog, User
from clinic.models import Staff
from inventory.models import Inventory

from .conftest import PASSWORD, client_for


def test_delete_request_flow(staff_ibaan, admin, stocked):
    a, _ = stocked
    r = client_for(staff_ibaan).post("/api/requests/", {"type": "inventory-product", "targetId": a.inventory_id,
                                                        "label": "Dog Food 5kg"})
    assert r.status_code == 201 and r.data["requestedByName"] == staff_ibaan.name and r.data["branch"] == "Ibaan"
    assert client_for(staff_ibaan).get("/api/requests/").data == []  # staff never see the queue
    assert len(client_for(admin).get("/api/requests/").data) == 1
    assert client_for(staff_ibaan).post(f"/api/requests/{r.data['id']}/approve/").status_code == 403
    assert client_for(admin).post(f"/api/requests/{r.data['id']}/approve/").status_code == 200
    assert not Inventory.objects.filter(pk=a.pk).exists()
    assert client_for(admin).get("/api/requests/").data == []


def test_deny_keeps_target_and_restock_is_dismissed(staff_ibaan, admin, stocked):
    a, _ = stocked
    d = client_for(staff_ibaan).post("/api/requests/", {"type": "inventory-product", "targetId": a.inventory_id,
                                                        "label": "x"}).data
    client_for(admin).post(f"/api/requests/{d['id']}/deny/")
    assert Inventory.objects.filter(pk=a.pk).exists()
    rs = client_for(staff_ibaan).post("/api/requests/", {"type": "restock", "targetId": a.inventory_id,
                                                         "label": "Dog Food 5kg"}).data
    assert client_for(admin).post(f"/api/requests/{rs['id']}/approve/").status_code == 400
    assert client_for(admin).post(f"/api/requests/{rs['id']}/dismiss/").status_code == 200


def test_staff_cannot_request_for_other_branch(staff_ibaan, stocked):
    _, b = stocked
    r = client_for(staff_ibaan).post("/api/requests/", {"type": "restock", "targetId": b.inventory_id, "label": "x"})
    assert r.status_code == 403


def test_events_posts_and_availability(admin, staff_ibaan, branches):
    assert client_for(staff_ibaan).post("/api/events/posts/", {"text": "hi"}).status_code == 403
    p = client_for(admin).post("/api/events/posts/", {"text": "Closed on Friday"})
    assert p.status_code == 201 and p.data["authorName"] == "Owner Admin"
    assert client_for(admin).post("/api/events/posts/", {"text": "  "}).status_code == 400
    assert [x["text"] for x in client_for(staff_ibaan).get("/api/events/posts/").data] == ["Closed on Friday"]
    put = client_for(admin).put("/api/events/availability/", {"branch": "Ibaan", "date": "2026-09-26",
                                                              "state": "unavailable"})
    assert put.status_code == 204
    assert client_for(staff_ibaan).get("/api/events/availability/").data["Ibaan"] == {"2026-09-26": "unavailable"}
    assert client_for(staff_ibaan).put("/api/events/availability/", {}).status_code == 403
    client_for(admin).put("/api/events/availability/", {"branch": "Ibaan", "date": "2026-09-26", "state": None})
    assert client_for(staff_ibaan).get("/api/events/availability/").data["Ibaan"] == {}


def test_staff_account_management(admin, branches):
    c = client_for(admin)
    body = {"name": "Carla Cruz", "email": "carla@ecovet.ph", "branch": "San Jose", "position": "Groomer",
            "mobile": "0917", "password": PASSWORD}
    r = c.post("/api/staff-accounts/", body)
    assert r.status_code == 201 and r.data["hasLogin"] and r.data["branch"] == "San Jose"
    sid = r.data["id"]
    assert "password" not in r.data
    login = APIClient().post("/api/auth/login/", {"email": "carla@ecovet.ph", "password": PASSWORD}, format="json")
    assert login.status_code == 200 and login.data["user"]["branch"] == "San Jose"
    assert c.post("/api/staff-accounts/", {**body, "email": "x@gmail.com"}).status_code == 400  # domain rule
    assert c.post("/api/staff-accounts/", {**body, "email": "d@ecovet.ph", "password": "weak"}).status_code == 400
    assert c.post("/api/staff-accounts/", body).status_code == 400  # duplicate email
    assert c.delete(f"/api/staff-accounts/{sid}/").status_code == 204
    assert Staff.objects.get(pk=sid).is_active is False
    assert sid not in [s["id"] for s in c.get("/api/staff-accounts/").data]
    relog = APIClient().post("/api/auth/login/", {"email": "carla@ecovet.ph", "password": PASSWORD}, format="json")
    assert relog.status_code == 401


def test_admin_position_grants_and_removes_admin_access(admin, branches):
    c = client_for(admin)
    body = {"name": "Ana Reyes", "email": "ana@ecovet.ph", "branch": "Ibaan", "position": "Admin", "password": PASSWORD}
    r = c.post("/api/staff-accounts/", body)
    assert r.status_code == 201 and r.data["role"] == "Admin"
    sid = r.data["id"]
    login = APIClient().post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": PASSWORD}, format="json")
    assert login.data["user"]["role"] == "admin" and login.data["user"]["branch"] is None  # both branches, not Ibaan
    ana = User.objects.get(email="ana@ecovet.ph")
    assert client_for(ana).get("/api/staff-accounts/").status_code == 200

    # An admin cannot lock themselves out, which also means the last admin can never be removed.
    assert client_for(ana).put(f"/api/staff-accounts/{sid}/", {**body, "position": "Secretary"}).status_code == 400
    assert client_for(ana).delete(f"/api/staff-accounts/{sid}/").status_code == 400

    # Another admin can take it away: the access ends at once and the old session stops working.
    assert c.put(f"/api/staff-accounts/{sid}/", {**body, "position": "Secretary", "password": ""}).status_code == 200
    ana.refresh_from_db()
    assert ana.role == User.ROLE_STAFF
    assert client_for(ana).get("/api/staff-accounts/").status_code == 403
    assert APIClient().post("/api/auth/refresh/", {"refresh": login.data["refresh"]}, format="json").status_code == 401
    assert AuditLog.objects.filter(action="staff.update", detail="admin access removed").exists()
