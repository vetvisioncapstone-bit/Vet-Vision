"""Opt-in page/pageSize pagination shared by the list endpoints.

Sending `page` or `pageSize` switches a list endpoint to an envelope:

    { "results": [...], "count": 2980, "page": 1, "pageSize": 25, "totalPages": 120, ...extra }

Without either parameter an endpoint keeps returning its plain array, so existing callers do not break.
"""

import math

from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


def wants_page(request):
    params = request.query_params
    return "page" in params or "pageSize" in params


def _positive_int(request, name, default):
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ValidationError({name: "Must be a whole number."})
    if value < 1:
        raise ValidationError({name: "Must be 1 or more."})
    return value


def paginate(request, queryset, serialize, extra=None):
    """Return one page of `queryset` (a queryset or list) as the envelope above.
    A page past the end is clamped to the last page, so the UI stays valid after rows are deleted."""
    size = min(_positive_int(request, "pageSize", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    page = _positive_int(request, "page", 1)
    count = queryset.count() if hasattr(queryset, "count") and not isinstance(queryset, list) else len(queryset)
    total_pages = max(1, math.ceil(count / size))
    page = min(page, total_pages)
    start = (page - 1) * size
    body = {
        "results": [serialize(obj) for obj in queryset[start:start + size]],
        "count": count,
        "page": page,
        "pageSize": size,
        "totalPages": total_pages,
    }
    if extra:
        body.update(extra)
    return Response(body)
