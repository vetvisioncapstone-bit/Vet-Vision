"""Admin AI assistant (thesis section 3.6): Google Gemini (an existing large language model, reached through its API) answers the
administrator's questions about the clinic's analytics. Nothing is trained here.

Only aggregated figures leave the system: sales totals, service counts, inventory movement, KPIs, forecasts and
product/service names, always for both branches, plus day-by-day totals when a question needs them (Gemini asks
for them through function calling, see daily_report). Customer names and contact details, pets and medical records are
never included. The forecasts and the fast/slow classification are computed by the system; the AI only explains them.
The conversation is kept by the browser for the session and is not stored here.
"""
import json
import logging
import time
from datetime import date
from types import SimpleNamespace
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from django.conf import settings
from django.utils import timezone
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
- CLINIC DATA is monthly. For particular days, a week, or any dates it does not break down, call get_daily_report \
(at most 31 days per call; split longer periods). Read words like today, yesterday or last week against today's date \
below; if that period has no records, say so and mention dataAsOf.latestDate.
- The system computes the forecasts and the fast/moderate/slow-moving classification; explain them, do not redo them. \
Forecast: Moving Average of the previous 6 complete months. Fast/slow-moving: top/bottom third of each product \
category by average monthly units sold per branch. MAE and MAPE measure forecast error (lower is better).
- Recommendations are suggestions. The final decision stays with clinic management; say so when you recommend buying, cutting or changing something.
- You have no information about individual customers, pets or medical records, and you do not give veterinary medical advice.
- Reply in the language of the administrator's latest message: English, Filipino or Taglish.
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
        "salesAnalytics": _pick(sales, "year", "monthly", "perBranch", "kpis", "topProducts", "topServices", "mostAvailedServices",
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
        "tools": [{"functionDeclarations": [DAILY_REPORT_TOOL]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096},
    }
    # When the question needs figures for particular days, Gemini asks for them (a functionCall), the system runs
    # daily_report and sends the aggregates back (a functionResponse), and Gemini answers with them. The model's own
    # turn goes back unchanged: Gemini 3 models check the "thought signature" inside it.
    for round_no in range(TOOL_ROUNDS + 1):
        if round_no == TOOL_ROUNDS:
            body["toolConfig"] = {"functionCallingConfig": {"mode": "NONE"}}  # enough lookups: answer now
        candidate, data = _ask(body)
        parts = (candidate.get("content") or {}).get("parts", [])
        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        if not calls:
            break
        body["contents"] += [candidate["content"], {"role": "user", "parts": [
            {"functionResponse": {"name": c.get("name"), "response": run_tool(c)}} for c in calls]}]

    text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()  # thinking models: skip thoughts
    if not text:
        log.info("event=gemini_empty finish=%s block=%s", candidate.get("finishReason"),
                 (data.get("promptFeedback") or {}).get("blockReason"))
        raise AssistantError("Gemini gave no answer to that. Try rephrasing the question.")
    return text


def _ask(body):
    """One Gemini call; returns (first candidate, whole response). Failures become friendly AssistantErrors."""
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
    except (URLError, ConnectionError, TimeoutError, ValueError) as e:
        log.warning("event=gemini_unreachable error=%s", e)
        raise AssistantError("Could not reach Gemini. Check the internet connection and try again.")
    return (data.get("candidates") or [{}])[0], data


# ------------------------------- daily reports (function calling) -------------------------------

TOOL_ROUNDS = 3  # lookups Gemini may make for one question
MAX_DAYS = 31
DAILY_REPORT_TOOL = {
    "name": "get_daily_report",
    "description": "Day-by-day clinic figures for both branches between two dates (at most 31 days): product sales, "
                   "service visits, gross profit, stock received and adjusted, plus the top products and services and "
                   "visits by species for the period. Use it whenever a question is about particular days, a week, "
                   "or dates that the monthly CLINIC DATA does not break down.",
    "parameters": {
        "type": "object",
        "properties": {
            "start_date": {"type": "string", "description": "First day, YYYY-MM-DD."},
            "end_date": {"type": "string", "description": "Last day, YYYY-MM-DD. Same as start_date for one day."},
        },
        "required": ["start_date"],
    },
}


def run_tool(call):
    args = call.get("args") or {}
    if call.get("name") != DAILY_REPORT_TOOL["name"]:
        return {"error": "Unknown function."}
    try:
        start = date.fromisoformat(str(args.get("start_date")))
        end = date.fromisoformat(str(args.get("end_date") or start))
    except ValueError:
        return {"error": "Dates must be written YYYY-MM-DD."}
    log.info("event=assistant_daily_report days=%s", (end - start).days + 1)  # dates only, never the question
    return daily_report(start, end)


def daily_report(start, end):
    """Aggregated figures per day and branch between `start` and `end`. Only totals and product/service names:
    no customer, pet, staff or transaction-level detail."""
    if end < start:
        start, end = end, start
    if (end - start).days >= MAX_DAYS:
        return {"error": f"Ask for at most {MAX_DAYS} days at a time; split longer periods into months or weeks."}
    first, latest = av.rows(
        "SELECT LEAST((SELECT min(sale_date) FROM sale), (SELECT min(txn_date) FROM service_transaction)) AS a, "
        "GREATEST((SELECT max(sale_date) FROM sale), (SELECT max(txn_date) FROM service_transaction)) AS b")[0].values()
    towns = av.branch_towns()
    span = (start, end)
    empty = {"sales": 0, "salesTxns": 0, "unitsSold": 0, "services": 0, "serviceVisits": 0, "grossProfit": 0,
             "stockReceived": 0, "stockAdjusted": 0}
    days = {}

    def cell(d, branch_id):
        day = days.setdefault(d.isoformat(), {})
        return day.setdefault(towns.get(branch_id, branch_id), dict(empty))

    for r in av.rows("SELECT sale_date AS d, branch_id, sum(line_total) AS g, sum(line_profit) AS p, "
                     "count(DISTINCT sale_id) AS n, sum(quantity) AS u FROM v_sale_lines "
                     "WHERE sale_date BETWEEN %s AND %s GROUP BY 1, 2", span):
        c = cell(r["d"], r["branch_id"])
        c.update(sales=av.num(r["g"]), salesTxns=r["n"], unitsSold=av.num(r["u"]))
        c["grossProfit"] += float(r["p"] or 0)
    for r in av.rows("SELECT txn_date AS d, branch_id, sum(line_total) AS g, sum(line_profit) AS p, "
                     "count(DISTINCT service_txn_id) AS n FROM v_service_lines "
                     "WHERE txn_date BETWEEN %s AND %s GROUP BY 1, 2", span):
        c = cell(r["d"], r["branch_id"])
        c.update(services=av.num(r["g"]), serviceVisits=r["n"])
        c["grossProfit"] += float(r["p"] or 0)
    for r in av.rows("SELECT txn_date AS d, branch_id, txn_type, sum(quantity_change) AS q FROM inventory_transaction "
                     "WHERE txn_date BETWEEN %s AND %s AND txn_type IN ('restock', 'adjustment') GROUP BY 1, 2, 3",
                     span):
        cell(r["d"], r["branch_id"])["stockReceived" if r["txn_type"] == "restock" else "stockAdjusted"] = av.num(r["q"])

    totals = {}
    for branches in days.values():
        for town, c in branches.items():
            c["grossProfit"] = av.num(c["grossProfit"])
            c["total"] = av.num(c["sales"] + c["services"])
            t = totals.setdefault(town, dict(empty, total=0))
            for k in t:
                t[k] = av.num(t[k] + c[k])
    totals["Both branches"] = {k: av.num(sum(t[k] for t in totals.values())) for k in dict(empty, total=0)}

    return {
        "from": start.isoformat(), "to": end.isoformat(),
        "recordsExistFrom": first and first.isoformat(), "recordsExistTo": latest and latest.isoformat(),
        "note": "Days missing from `days` have no records (the clinic was closed or nothing was recorded).",
        "days": dict(sorted(days.items())),
        "totals": totals,
        "topProducts": [{k: av.num(v) for k, v in r.items()} for r in av.rows(
            "SELECT product_name AS name, b.town AS branch, sum(quantity) AS units, sum(line_total) AS revenue "
            "FROM v_sale_lines JOIN branch b USING (branch_id) WHERE sale_date BETWEEN %s AND %s "
            "GROUP BY 1, 2 ORDER BY revenue DESC LIMIT 10", span)],
        "topServices": [{k: av.num(v) for k, v in r.items()} for r in av.rows(
            "SELECT service_name AS name, b.town AS branch, count(DISTINCT service_txn_id) AS visits, "
            "sum(line_total) AS revenue FROM v_service_lines JOIN branch b USING (branch_id) "
            "WHERE txn_date BETWEEN %s AND %s GROUP BY 1, 2 ORDER BY visits DESC LIMIT 10", span)],
        "visitsBySpecies": {r["species"] or "Unknown": r["visits"] for r in av.rows(
            "SELECT species, count(DISTINCT service_txn_id) AS visits FROM v_service_lines "
            "WHERE txn_date BETWEEN %s AND %s GROUP BY 1 ORDER BY 2 DESC", span)},
    }


# Model -> time.monotonic() until which it is skipped after answering "busy" or "limit reached".
# ponytail: per-process memory; fine for one web worker, share it through the cache if more workers are added.
_resting = {}
REST_SECONDS = 60
DEADLINE_SECONDS = 45  # the web server gives a request 60 s; stop trying models before that


def _models():
    """GEMINI_MODEL first, then each GEMINI_FALLBACK_MODEL (comma-separated). Every free-tier model has its own
    quota and its own load, so a longer list means the assistant almost always finds one that answers."""
    names = [settings.GEMINI_MODEL, *settings.GEMINI_FALLBACK_MODEL.split(",")]
    models = list(dict.fromkeys(m.strip() for m in names if m.strip()))
    now = time.monotonic()
    ready = [m for m in models if _resting.get(m, 0) <= now]
    return ready or models  # all resting: try them all anyway rather than refuse


def _send(req, tries=4):
    """One request. A connection dropped before an answer (seen on some networks: many TLS handshakes with Google are
    reset) is retried at once; the model is fine, so it is not rested for it. Timeouts and HTTP errors pass through."""
    for attempt in range(tries):
        try:
            with urlopen(req, timeout=25) as r:
                return json.load(r)
        except (URLError, ConnectionError) as e:  # a reset while reading the answer is a bare ConnectionError
            dropped = isinstance(e, ConnectionError) or isinstance(getattr(e, "reason", None), ConnectionError)
            if isinstance(e, HTTPError) or not dropped or attempt == tries - 1:
                raise
            log.info("event=gemini_retry reason=%s", type(getattr(e, "reason", e)).__name__)
            time.sleep(0.3 * (attempt + 1))


def _post(body):
    """Ask each model in turn until one answers. A model that is overloaded (500/503), out of free quota (429),
    retired (404) or unreachable is rested for a minute and the next one is asked; other errors (bad key, bad
    request) would fail the same way on every model, so they stop at once."""
    models = _models()
    start = time.monotonic()
    for i, model in enumerate(models):
        req = Request(GEMINI_URL.format(model=quote(model, safe="")), data=json.dumps(body).encode(), method="POST",
                      headers={"Content-Type": "application/json", "x-goog-api-key": settings.GEMINI_API_KEY})
        try:
            data = _send(req)
            log.info("event=gemini_answer model=%s", model)  # which model answered, for QA of answer quality
            return data
        except (HTTPError, URLError, ConnectionError, TimeoutError) as e:
            code = getattr(e, "code", None)
            last = i == len(models) - 1 or time.monotonic() - start > DEADLINE_SECONDS
            if code not in (None, 404, 429, 500, 503) or last:
                raise
            _resting[model] = time.monotonic() + REST_SECONDS
            log.info("event=gemini_fallback from=%s status=%s", model, code or "unreachable")


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
        system = SYSTEM + f"\n\nToday's date is {timezone.localdate():%A, %Y-%m-%d}."
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
