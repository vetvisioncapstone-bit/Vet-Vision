from rest_framework.test import APIClient

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
