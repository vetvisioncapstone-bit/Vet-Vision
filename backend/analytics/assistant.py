"""Admin AI assistant (thesis section 3.6): Google Gemini (an existing large language model, reached through its API) answers the
administrator's questions about the clinic's analytics. Nothing is trained here.

Only aggregated figures leave the system: sales totals, service counts, inventory movement, KPIs, forecasts and
product/service names, always for both branches. Customer names and contact details, pets and medical records are
never included. The forecasts and the fast/slow classification are computed by the system; the AI only explains them.
The conversation is kept by the browser for the session and is not stored here.
"""
import json
import logging
from types import SimpleNamespace
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from django.conf import settings
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import record
from core.permissions import IsAdmin

from . import views as av

SYSTEM = """You are the VET Vision Assistant for the owner and administrator of EcoVet Animal Clinic, a veterinary \
clinic with two branches (Ibaan and San Jose, Batangas). You help them read the dashboard, sales analytics, \
forecasts and reports, and you give data-driven suggestions about purchasing, stocking, sales and branch operations.

Rules:
- Use only the figures in CLINIC DATA below. If the data does not answer the question, say so plainly. Never invent numbers.
- Copy figures exactly as they appear in CLINIC DATA. Prefer a ready-made total (for example branchShare.transactions) \
over adding numbers yourself; if you must calculate, say that the figure is calculated.
- Money is in Philippine pesos: write it like ₱336,645 (peso sign, thousands separators, no decimals). Say which month or period a figure covers. dataAsOf.latestDate is the newest record.
- The system computes the forecasts and the fast/moderate/slow-moving classification; explain them, do not redo them. \
Forecast: Moving Average of the previous 6 complete months. Fast/slow-moving: top/bottom third of each product \
category by average monthly units sold per branch. MAE, MAPE and WAPE measure forecast error (lower is better).
- Recommendations are suggestions. The final decision stays with clinic management; say so when you recommend buying, cutting or changing something.
- You have no information about individual customers, pets or medical records, and you do not give veterinary medical advice.
- Reply in the language the administrator writes in: English, Filipino or Taglish.
- Be concise and plain: a short paragraph or a few bullet points, about 200 words unless asked for more detail.
- Answer only questions about this clinic's operations and data; politely decline anything else."""

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
log = logging.getLogger("vetvision.assistant")


class AssistantError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


# The analytics views read nothing from the request but its query parameters; an empty set means both branches.
ALL_BRANCHES = SimpleNamespace(query_params={})


def _data(view_cls):
    r = view_cls().get(ALL_BRANCHES)
    return r.data if r.status_code == 200 and not r.data.get("empty") else None


def _pick(row, *keys):
    return {k: row[k] for k in keys if k in row}


def build_context():
    """The aggregated, anonymous snapshot the AI may see (both branches), reusing the dashboard's own analytics."""
    overview = _data(av.Overview)
    if not overview:
        return {"note": "There are no sales or service records yet."}
    sales = _data(av.SalesAnalytics) or {}
    inventory = _data(av.InventoryAnalytics) or {}
    forecast = _data(av.Forecast) or {}
    report = _data(av.ReportData) or {}

    items = inventory.get("items", [])
    item_keys = ("name", "category", "branch", "avgMonthlyUnits", "stock", "reorderPoint")
    slow = sorted((i for i in items if i.get("movement") == "slow"), key=lambda i: i.get("avgMonthlyUnits") or 0)
    reorder = sorted((p for p in forecast.get("products", []) if p.get("toOrder")), key=lambda p: -p["toOrder"])
    patients = report.get("patients") or {}

    return {
        "dataAsOf": overview["asOf"],
        "dashboard": _pick(overview, "kpis", "comparison", "trend", "branchShare", "topServices"),
        "salesAnalytics": _pick(sales, "year", "monthly", "perBranch", "kpis", "topItems", "mostAvailedServices",
                                "leastAvailedServices"),
        "inventory": {
            "movementWindow": inventory.get("window"),
            "movementSummaryByBranch": inventory.get("summary"),
            "stockOutsLast12Months": _pick(inventory.get("stockOuts") or {}, "total", "worst"),
            "fastMoving": [_pick(i, *item_keys) for i in items if i.get("movement") == "fast"][:20],
            "slowMoving": [_pick(i, *item_keys) for i in slow[:20]],
            "atOrBelowReorderPoint": [_pick(i, "name", "branch", "stock", "reorderPoint") for i in items
                                      if (i.get("stock") or 0) <= (i.get("reorderPoint") or 0)][:30],
        },
        "forecast": {
            **_pick(forecast, "method", "overall", "accuracy"),
            "suggestedReorders": [_pick(p, "name", "category", "forecast", "stock", "toOrder", "movement")
                                  for p in reorder[:20]],
        },
        "latestMonthReport": {
            **_pick(report, "period", "sales", "services"),
            "patientsBySpecies": patients.get("bySpecies"),
            "newPets": patients.get("newPets"),
        },
    }


def call_model(system, turns):
    """Send the instructions plus the conversation (list of {"role": "user"|"assistant", "text"}) to Google Gemini
    and return its reply text. Free tier only: the key comes from a Google AI Studio project without billing, so
    going over the free limits returns "busy" instead of costing money. Google may use free-tier prompts to improve
    its products, which is one more reason only aggregated figures are ever sent."""
    if not settings.GEMINI_API_KEY:
        raise AssistantError("The AI assistant is not set up yet: add GEMINI_API_KEY to backend/.env.", 503)
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "model" if t["role"] == "assistant" else "user", "parts": [{"text": t["text"]}]}
                     for t in turns],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096},
    }
    try:
        data = _post(body)
    except HTTPError as e:
        log.warning("event=gemini_error status=%s body=%s", e.code, e.read()[:300])
        if e.code in (500, 503):
            raise AssistantError("Gemini is very busy right now (high demand on Google's side). Try again in a moment.", 503)
        if e.code == 429:
            raise AssistantError("The AI assistant has reached its free usage limit for now. Try again in a minute "
                                 "(or tomorrow if the daily limit is used up).", 503)
        if e.code in (400, 401, 403, 404):
            raise AssistantError("Gemini refused the request. Check GEMINI_API_KEY and GEMINI_MODEL in backend/.env.")
        raise AssistantError("Gemini had a problem. Try again shortly.")
    except (URLError, TimeoutError, ValueError) as e:
        log.warning("event=gemini_unreachable error=%s", e)
        raise AssistantError("Could not reach Gemini. Check the internet connection and try again.")

    candidate = (data.get("candidates") or [{}])[0]
    parts = (candidate.get("content") or {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()  # thinking models: skip thoughts
    if not text:
        log.info("event=gemini_empty finish=%s block=%s", candidate.get("finishReason"),
                 (data.get("promptFeedback") or {}).get("blockReason"))
        raise AssistantError("Gemini gave no answer to that. Try rephrasing the question.")
    return text


def _post(body):
    """Ask GEMINI_MODEL; if it is overloaded or its free quota is used up, ask GEMINI_FALLBACK_MODEL, which has a
    quota of its own. Free-tier Flash models are often busy, so this keeps the assistant answering."""
    models = list(dict.fromkeys(m for m in (settings.GEMINI_MODEL, settings.GEMINI_FALLBACK_MODEL) if m))
    for i, model in enumerate(models):
        req = Request(GEMINI_URL.format(model=quote(model, safe="")), data=json.dumps(body).encode(), method="POST",
                      headers={"Content-Type": "application/json", "x-goog-api-key": settings.GEMINI_API_KEY})
        try:
            with urlopen(req, timeout=60) as r:
                data = json.load(r)
            log.info("event=gemini_answer model=%s", model)  # which model answered, for QA of answer quality
            return data
        except HTTPError as e:
            if e.code not in (429, 500, 503) or i == len(models) - 1:
                raise
            log.info("event=gemini_fallback from=%s status=%s", model, e.code)


class Turn(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    text = serializers.CharField(max_length=4000, trim_whitespace=False)


class AssistantInput(serializers.Serializer):
    message = serializers.CharField(max_length=2000)
    history = Turn(many=True, required=False, max_length=12)
    page = serializers.CharField(max_length=60, required=False, allow_blank=True)


class Assistant(APIView):
    """POST {message, history?, page?} -> {reply}. Administrators only."""

    permission_classes = [IsAdmin]
    throttle_scope = "assistant"

    def post(self, request):
        s = AssistantInput(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        system = SYSTEM
        if d.get("page"):
            system += f"\n\nThe administrator is on the '{d['page']}' page of the dashboard."
        system += "\n\nCLINIC DATA (JSON):\n" + json.dumps(build_context(), default=str, separators=(",", ":"))
        turns = [*d.get("history", []), {"role": "user", "text": d["message"]}]
        try:
            reply = call_model(system, turns)
        except AssistantError as e:
            return Response({"detail": str(e)}, status=e.status)
        record(request, "ai_query")  # who asked and when; the question itself is not stored
        return Response({"reply": reply})
