import logging
import re
import time
import uuid

log = logging.getLogger("vetvision.request")


class RequestLogMiddleware:
    """One log line per API request: id, method, path, status, milliseconds.

    The id is also returned in the X-Request-ID header, so a user's failed request can be found in the logs.
    Only the path is logged, never the query string, headers or body (they can hold passwords and tokens).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        rid = re.sub(r"[^\w-]", "", request.headers.get("X-Request-ID", ""))[:64] or uuid.uuid4().hex[:12]
        start = time.monotonic()
        response = self.get_response(request)
        response["X-Request-ID"] = rid
        if request.path != "/api/health/":  # uptime pings would drown everything else
            level = logging.ERROR if response.status_code >= 500 else logging.INFO
            log.log(level, "event=request id=%s method=%s path=%s status=%s ms=%d",
                    rid, request.method, request.path, response.status_code, (time.monotonic() - start) * 1000)
        return response
