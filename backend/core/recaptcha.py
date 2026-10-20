"""Google reCAPTCHA v2 ("I'm not a robot"): proves a sign-in or sign-up came from a person using the real page, not a
script.

The browser widget hands the page a one-time token; the server asks Google whether it is genuine.
"""
import json
import logging
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from django.conf import settings

VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"
log = logging.getLogger("vetvision.recaptcha")


def verify(token, ip=None):
    """True when Google confirms the token. Fails closed: a missing or bad token, or Google being unreachable, all
    return False. Always True when no secret key is set (development and tests only; settings refuses to start
    production without one)."""
    if not settings.RECAPTCHA_SECRET_KEY:
        return True
    if not isinstance(token, str) or not token or len(token) > 4096:
        return False
    data = {"secret": settings.RECAPTCHA_SECRET_KEY, "response": token}
    if ip:
        data["remoteip"] = ip
    try:
        with urlopen(VERIFY_URL, data=urlencode(data).encode(), timeout=5) as r:
            result = json.load(r)
    except (URLError, TimeoutError, ValueError) as e:
        log.warning("event=recaptcha_unreachable error=%s", e)
        return False
    if not result.get("success"):
        log.info("event=recaptcha_rejected codes=%s", ",".join(result.get("error-codes", [])))
    return bool(result.get("success"))
