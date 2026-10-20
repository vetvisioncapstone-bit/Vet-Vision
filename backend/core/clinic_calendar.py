"""When the clinic is open: one source of truth for the customer calendar and the data reshaping command.

Closed on Sundays and the public holidays below; half days on the eves and Black Saturday. The admin can override any
date per branch (engagement.BranchAvailability); that is applied on top by the calendar endpoint.
"""
from datetime import date, timedelta

FULL_HOURS = "8:00 AM – 5:00 PM"
HALF_HOURS = "8:00 AM – 12:00 PM"
OPENS, FULL_CLOSE, HALF_CLOSE = "08:00", "17:00", "12:00"  # 24-hour times, for "open right now"

# The regular week, Monday first (jsDay matches JavaScript's Date.getDay(): Sunday = 0).
WEEKLY = [{"day": d, "jsDay": j, "hours": FULL_HOURS, "closed": False}
          for d, j in (("Monday", 1), ("Tuesday", 2), ("Wednesday", 3), ("Thursday", 4), ("Friday", 5), ("Saturday", 6))]
WEEKLY.append({"day": "Sunday", "jsDay": 0, "hours": "Closed", "closed": True})


def easter(year):
    """Easter Sunday (Anonymous Gregorian algorithm)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    g = (b - (b + 8) // 25 + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    x = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * x) // 451
    month, day = divmod(h + x - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _named_days(year):
    e = easter(year)
    heroes = max(date(year, 8, x) for x in range(25, 32) if date(year, 8, x).weekday() == 0)
    closed = {
        date(year, 1, 1): "New Year's Day", date(year, 4, 9): "Araw ng Kagitingan",
        e - timedelta(days=3): "Maundy Thursday", e - timedelta(days=2): "Good Friday",
        date(year, 5, 1): "Labor Day", date(year, 6, 12): "Independence Day", heroes: "National Heroes Day",
        date(year, 11, 30): "Bonifacio Day", date(year, 12, 25): "Christmas Day", date(year, 12, 30): "Rizal Day",
    }
    half = {
        e - timedelta(days=1): "Black Saturday", date(year, 11, 1): "All Saints' Day",
        date(year, 12, 24): "Christmas Eve", date(year, 12, 31): "New Year's Eve",
    }
    return closed, half


def day_info(d):
    """{'state': 'open'|'half'|'closed', 'hours': str, 'reason': str|None, 'opens'/'closes': 'HH:MM'|None} from the regular schedule."""
    closed, half = _named_days(d.year)
    if d in closed:
        return {"state": "closed", "hours": "Closed", "reason": closed[d], "opens": None, "closes": None}
    if d.weekday() == 6:
        return {"state": "closed", "hours": "Closed", "reason": "Weekly rest day", "opens": None, "closes": None}
    if d in half:
        return {"state": "half", "hours": HALF_HOURS, "reason": half[d], "opens": OPENS, "closes": HALF_CLOSE}
    return {"state": "open", "hours": FULL_HOURS, "reason": None, "opens": OPENS, "closes": FULL_CLOSE}


def opening_weight(d):
    """1 = full day, 0.5 = half day, 0 = closed (used to shape the transaction history)."""
    return {"open": 1.0, "half": 0.5, "closed": 0.0}[day_info(d)["state"]]
