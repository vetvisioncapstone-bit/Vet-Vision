from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User


def test_refresh_for_a_deleted_user_is_a_401_not_a_server_error(api, db):
    user = User.objects.create(email="gone@example.com", name="Gone", role="customer")
    token = str(RefreshToken.for_user(user))
    user.delete()
    r = api.post("/api/auth/refresh/", {"refresh": token})
    assert r.status_code == 401


def test_refresh_with_garbage_token_is_401(api):
    assert api.post("/api/auth/refresh/", {"refresh": "not-a-token"}).status_code == 401
