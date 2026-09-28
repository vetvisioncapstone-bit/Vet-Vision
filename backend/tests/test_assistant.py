import io
import json
from datetime import date, time
from urllib.error import HTTPError

import pytest

from accounts.models import AuditLog
from analytics import assistant
from clinic.models import Customer
from sales.models import Sale, SaleDetail

from .conftest import client_for

URL = "/api/analytics/assistant/"


@pytest.fixture
def model(monkeypatch):
    """A fake language model that records what it was sent and answers 'OK'."""
    sent = []

    def fake(system, turns):
        sent.append({"system": system, "turns": turns})
        return "OK"

    monkeypatch.setattr(assistant, "call_model", fake)
    return sent


@pytest.fixture
def one_sale(branches, stocked):
    """A named customer's purchase: the analytics count it, but the name must never reach the AI."""
    ibaan, product = branches[0], stocked[0].product
    customer = Customer.objects.create(customer_id="CUS-I0001", branch=ibaan, customer_name="Juana Dela Cruz",
                                       email="juana.secret@example.com", contact_no="09171112222",
                                       date_registered=date(2026, 1, 5))
    s = Sale.objects.create(sale_id="SAL-1", branch=ibaan, customer=customer, sale_date=date(2026, 7, 1),
                            sale_time=time(9, 0), payment_status="Paid", total_amount=500)
    SaleDetail.objects.create(sale_detail_id="SD-0000001", sale=s, product=product, quantity=2, unit_price=250,
                              unit_capital=180, line_total=500, line_capital=360, line_profit=140)
    return customer


def test_only_the_admin_can_ask(client, staff_ibaan, model):
    assert client.post(URL, {"message": "hi"}, content_type="application/json").status_code == 401
    assert client_for(staff_ibaan).post(URL, {"message": "hi"}, format="json").status_code == 403
    assert model == []


def test_admin_gets_an_answer_and_the_use_is_audited(admin, branches, model):
    history = [{"role": "user", "text": "hi"}, {"role": "assistant", "text": "Hello"}]
    r = client_for(admin).post(URL, {"message": "Kumusta ang benta?", "page": "dashboard", "history": history},
                               format="json")
    assert r.status_code == 200 and r.data["reply"] == "OK"
    sent = model[0]
    assert sent["turns"] == [*history, {"role": "user", "text": "Kumusta ang benta?"}]
    assert "'dashboard' page" in sent["system"] and "Filipino or Taglish" in sent["system"]
    assert AuditLog.objects.filter(action="ai_query", user=admin).exists()
    assert not AuditLog.objects.filter(detail__icontains="benta").exists()  # the question is not stored


def test_only_aggregates_are_sent_never_customer_details(admin, one_sale, model):
    client_for(admin).post(URL, {"message": "Summarise"}, format="json")
    system = model[0]["system"]
    assert "Dog Food 5kg" in system and "500" in system  # the aggregated figures do go
    for secret in ("Juana", "Dela Cruz", "juana.secret@example.com", "09171112222", "CUS-I0001"):
        assert secret not in system


def test_the_context_always_covers_both_branches(admin, one_sale, model):
    client_for(admin).post(URL + "?branch=San%20Jose", {"message": "hi"}, format="json")
    assert "Dog Food 5kg" in model[0]["system"]  # an Ibaan sale is still there


def test_without_a_key_it_says_so(admin, branches):
    r = client_for(admin).post(URL, {"message": "hi"}, format="json")
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.data["detail"]


# ------------------------------- the Gemini call -------------------------------


@pytest.fixture
def gemini(settings, monkeypatch):
    """Fake Gemini endpoint: records each request; `replies` holds what it answers (a dict, or an exception)."""
    settings.GEMINI_API_KEY, settings.GEMINI_MODEL, settings.GEMINI_FALLBACK_MODEL = "test-key", "gemini-test-flash", ""
    calls, replies = [], []

    def fake_urlopen(req, timeout):
        calls.append({"url": req.full_url, "headers": dict(req.header_items()), "body": json.loads(req.data)})
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return io.BytesIO(json.dumps(reply).encode())

    monkeypatch.setattr(assistant, "urlopen", fake_urlopen)
    return calls, replies


def answer(*parts):
    return {"candidates": [{"content": {"role": "model", "parts": list(parts)}, "finishReason": "STOP"}]}


def test_gemini_request_shape_and_reply(gemini):
    calls, replies = gemini
    replies.append(answer({"text": "thinking...", "thought": True}, {"text": "Sales rose **5%**."}))
    turns = [{"role": "user", "text": "hi"}, {"role": "assistant", "text": "Hello"}, {"role": "user", "text": "Sales?"}]
    assert assistant.call_model("RULES", turns) == "Sales rose **5%**."  # the model's private thoughts are dropped
    sent = calls[0]
    assert sent["url"].endswith("/models/gemini-test-flash:generateContent")
    assert sent["headers"]["X-goog-api-key"] == "test-key"  # the key goes in a header, never in the URL
    assert "test-key" not in sent["url"]
    assert sent["body"]["systemInstruction"]["parts"][0]["text"] == "RULES"
    assert [c["role"] for c in sent["body"]["contents"]] == ["user", "model", "user"]


def test_free_limit_reached_is_a_friendly_busy_message(gemini):
    _, replies = gemini
    replies += [HTTPError("u", 429, "Too Many Requests", {}, io.BytesIO(b"{}"))] * 2  # main and fallback
    with pytest.raises(assistant.AssistantError) as e:
        assistant.call_model("RULES", [{"role": "user", "text": "hi"}])
    assert e.value.status == 503 and "free usage limit" in str(e.value)


def test_a_busy_model_falls_back_to_the_second(gemini, settings):
    calls, replies = gemini
    settings.GEMINI_FALLBACK_MODEL = "gemini-test-lite"
    replies += [HTTPError("u", 503, "Unavailable", {}, io.BytesIO(b"{}")), answer({"text": "OK"})]
    assert assistant.call_model("RULES", [{"role": "user", "text": "hi"}]) == "OK"
    assert [c["url"].rsplit("/", 1)[1] for c in calls] == ["gemini-test-flash:generateContent",
                                                            "gemini-test-lite:generateContent"]


def test_when_both_are_busy_it_says_so(gemini, settings):
    _, replies = gemini
    settings.GEMINI_FALLBACK_MODEL = "gemini-test-lite"
    replies += [HTTPError("u", 503, "Unavailable", {}, io.BytesIO(b"{}"))] * 2
    with pytest.raises(assistant.AssistantError) as e:
        assistant.call_model("RULES", [{"role": "user", "text": "hi"}])
    assert e.value.status == 503 and "busy" in str(e.value)


def test_a_blocked_or_empty_answer_is_reported(gemini):
    _, replies = gemini
    replies.append({"candidates": [], "promptFeedback": {"blockReason": "SAFETY"}})
    with pytest.raises(assistant.AssistantError):
        assistant.call_model("RULES", [{"role": "user", "text": "hi"}])


def test_oversized_input_is_refused(admin, model):
    c = client_for(admin)
    assert c.post(URL, {"message": "x" * 2001}, format="json").status_code == 400
    too_long = [{"role": "user", "text": "x"}] * 13
    assert c.post(URL, {"message": "hi", "history": too_long}, format="json").status_code == 400
