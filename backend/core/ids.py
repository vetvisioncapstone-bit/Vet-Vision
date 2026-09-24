import re

from django.db import transaction


def branch_letter(branch_id):
    """BR-001 (Ibaan) -> 'I', BR-002 (San Jose) -> 'S'. Falls back to 'X'."""
    return {"BR-001": "I", "BR-002": "S"}.get(branch_id, "X")


def next_id(model, field, prefix, width):
    """
    Next string ID for legacy-format keys such as 'SL-I-000123'.
    Reads the highest numeric suffix under `prefix`; callers must run inside a
    transaction (the table is locked by the caller's INSERT, and the clinic's
    write volume is tiny, so a max()+1 scheme is sufficient here).
    """
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    with transaction.atomic():
        latest = (
            model.objects.filter(**{f"{field}__startswith": prefix})
            .order_by(f"-{field}")
            .values_list(field, flat=True)
            .first()
        )
        number = 0
        if latest:
            match = pattern.match(latest)
            if match:
                number = int(match.group(1))
    return f"{prefix}{number + 1:0{width}d}"
