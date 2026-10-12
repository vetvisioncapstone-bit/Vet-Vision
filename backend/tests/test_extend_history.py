from datetime import date, time

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from inventory.models import InventoryTransaction
from sales.models import Sale, SaleDetail


def test_extend_history_resamples_last_year_with_todays_prices_and_dated_stock(branches, stocked):
    ibaan, product, shelf = branches[0], stocked[0].product, stocked[0]
    for day in (date(2025, 8, 4), date(2025, 8, 11)):  # Mondays a year earlier, at an old price
        s = Sale.objects.create(sale_id=f"SL-I-{day.day:06d}", branch=ibaan, sale_date=day, sale_time=time(9),
                                payment_status="Paid", total_amount=400)
        SaleDetail.objects.create(sale_detail_id=f"SD-{day.day:07d}", sale=s, product=product, quantity=2,
                                  unit_price=200, unit_capital=150, line_total=400, line_capital=300, line_profit=100)

    call_command("extend_history", "--from", "2026-08", "--to", "2026-08")

    new = Sale.objects.filter(sale_date__year=2026)
    assert new.exists() and all(s.sale_date.weekday() == 0 for s in new)  # Mondays only, like the pool
    assert all(d.unit_price == 250 and d.line_total == 500 for d in SaleDetail.objects.filter(sale__in=new))
    moves = InventoryTransaction.objects.filter(product=product, branch=ibaan)
    added = moves.exclude(reference_id__in=["SL-I-000004", "SL-I-000011"])  # the trigger also logged last year's
    assert added and all(date(2026, 8, 1) <= m.txn_date <= date(2026, 8, 31) for m in added)  # not stamped with today
    shelf.refresh_from_db()
    assert shelf.quantity_on_hand >= 0 and shelf.quantity_on_hand == 10 + sum(m.quantity_change for m in moves)
    with pytest.raises(CommandError):  # a month is never filled twice
        call_command("extend_history", "--from", "2026-08", "--to", "2026-08")
