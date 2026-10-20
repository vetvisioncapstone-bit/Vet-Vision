import io
import json
from urllib.error import URLError

import pytest

from accounts.models import AuditLog
from core import recaptcha

from .conftest import PASSWORD


@pytest.fixture
def on(settings):
    settings.RECAPTCHA_SECRET_KEY = "test-secret"


def google_says(monkeypatch, success):
    calls = []

    def fake_urlopen(url, data, timeout):
        calls.append(data.decode())
        return io.BytesIO(json.dumps({"success": success, "error-codes": [] if success else ["invalid-input-response"]}).encode())

    monkeypatch.setattr(recaptcha, "urlopen", fake_urlopen)
    return calls


def test_login_without_token_is_refused_before_the_password_is_checked(on, client, admin):
    r = client.post("/api/auth/login/", {"email": admin.email, "password": PASSWORD}, content_type="application/json")
    assert r.status_code == 400
    assert AuditLog.objects.filter(action="captcha_failed").count() == 1
    assert not AuditLog.objects.filter(action="login_failed").exists()  # does not count towards the lockout


def test_login_with_a_rejected_token_is_refused(on, client, admin, monkeypatch):
    google_says(monkeypatch, False)
    r = client.post("/api/auth/login/", {"email": admin.email, "password": PASSWORD, "captcha": "tok"},
                    content_type="application/json")
    assert r.status_code == 400


def test_login_with_a_genuine_token_signs_in(on, client, admin, monkeypatch):
    calls = google_says(monkeypatch, True)
    r = client.post("/api/auth/login/", {"email": admin.email, "password": PASSWORD, "captcha": "tok"},
                    content_type="application/json")
    assert r.status_code == 200
    assert "secret=test-secret" in calls[0] and "response=tok" in calls[0]


def test_register_needs_the_check_too(on, client, branches):
    r = client.post("/api/auth/register/", {"firstName": "A", "lastName": "B", "email": "a@b.ph", "password": PASSWORD},
                    content_type="application/json")
    assert r.status_code == 400


def test_google_unreachable_fails_closed(on, monkeypatch):
    def down(*a, **k):
        raise URLError("offline")

    monkeypatch.setattr(recaptcha, "urlopen", down)
    assert recaptcha.verify("tok") is False


def test_no_secret_means_no_check(settings):
    settings.RECAPTCHA_SECRET_KEY = ""
    assert recaptcha.verify(None) is True
