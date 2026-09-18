"""ID generation matching the existing seeded-data conventions.

None of the transactional tables (sale, sale_detail, service_transaction,
service_detail, pet, customer, medical_record, notification) have a real
Postgres SEQUENCE or IDENTITY column backing their varchar primary keys —
only `inventory` and `inventory_transaction` do (see
inventory/views.py::_next_txn_id, which uses those real sequences instead
of this module). Everything else was populated by whatever script built
the seed dataset, using patterns like:

    SL-I-000001   (sale, Ibaan)         SD-0000001    (sale_detail, global)
    SV-I-000001   (service_txn, Ibaan)  VD-0000001    (service_detail, global)
    CUS-I0001     (customer, Ibaan)     PET-I00001    (pet, Ibaan)

We replicate that shape here so new rows created through the API sort and
read the same way as the seeded ones. This is inherently a "read max,
increment" strategy — fine at this app's write volume (a vet clinic POS,
not a high-concurrency system), but if concurrent double-booking ever
becomes a real risk, swap this for real Postgres sequences instead.

`branch_code` is the single letter used in branch-scoped ids. It comes from
`branch.town` (Ibaan -> "I", San Jose -> "S"), not from branch_id, because
that's what the seeded data actually used.
"""

def branch_code(branch) -> str:
    return branch.town.strip()[0].upper()


def next_id(model_cls, id_field: str, prefix: str, width: int, branch=None) -> str:
    """
    prefix examples: "SL-{b}-", "SD-", "CUS-{b}", "PET-{b}0"
    Use "{b}" inside prefix wherever the branch letter goes; omit it for
    globally-sequential ids (sale_detail, service_detail).
    """
    resolved_prefix = prefix.format(b=branch_code(branch)) if branch else prefix

    existing = (
        model_cls.objects.filter(**{f"{id_field}__startswith": resolved_prefix})
        .values_list(id_field, flat=True)
    )
    max_n = 0
    for value in existing:
        tail = value[len(resolved_prefix):]
        if tail.isdigit():
            max_n = max(max_n, int(tail))

    return f"{resolved_prefix}{max_n + 1:0{width}d}"
