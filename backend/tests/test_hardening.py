import pytest
from rest_framework import serializers

from core.validators import MAX_DATA_URL_CHARS, data_url


def test_data_url_accepts_images_and_pdf():
    for ok in ("data:image/png;base64,AAAA", "data:image/jpeg;base64,AAAA", "data:application/pdf;base64,AAAA"):
        assert data_url(ok) == ok


@pytest.mark.parametrize("bad", ["javascript:alert(1)", "hello", "data:text/html;base64,AAAA", "data:image/svg+xml;base64,AAAA"])
def test_data_url_rejects_other_content(bad):
    with pytest.raises(serializers.ValidationError):
        data_url(bad)


def test_data_url_rejects_huge_files():
    with pytest.raises(serializers.ValidationError):
        data_url("data:image/png;base64," + "A" * MAX_DATA_URL_CHARS)


@pytest.mark.django_db
def test_every_response_carries_a_request_id(client):
    r = client.get("/api/health/")
    assert r["X-Request-ID"]
    assert client.get("/api/health/", HTTP_X_REQUEST_ID="abc-123")["X-Request-ID"] == "abc-123"
