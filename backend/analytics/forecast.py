"""Forecasting and classification maths for the analytics dashboard.

Pure functions, no database access, so they can be unit-tested against hand-computed values. As the thesis specifies
(sections 3.5 and 3.6), Pandas does the Moving Average and scikit-learn's metrics module scores it (MAE, MAPE).

Method (thesis section 3.4 / 3.6): a simple Moving Average over the previous WINDOW (six) months projects the
following month. Accuracy is measured by back-testing: for each month that has WINDOW months of history before it,
forecast it and compare with what actually happened, then report MAE and MAPE.
"""

import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error

WINDOW = 6
BACKTEST_MONTHS = 12


def moving_average(values, window=WINDOW):
    """Forecast of the next value: mean of the last `window` values. None when there is no history."""
    tail = pd.Series(list(values), dtype="float64").tail(window)
    return None if tail.empty else float(tail.mean())


def backtest(values, window=WINDOW, months=BACKTEST_MONTHS):
    """Pairs (forecast, actual) for the last `months` values that have a full `window` of history before them."""
    actual = pd.Series(list(values), dtype="float64")
    forecast = actual.rolling(window).mean().shift(1)  # the mean of the `window` months before each month
    forecast = forecast.dropna().tail(months)
    return list(zip(forecast.tolist(), actual[forecast.index].tolist()))


def mae(pairs):
    """Mean Absolute Error. None when there is nothing to compare."""
    if not pairs:
        return None
    forecast, actual = zip(*pairs)
    return float(mean_absolute_error(actual, forecast))


def mape(pairs):
    """Mean Absolute Percentage Error, in percent. Months whose actual value is 0 are skipped because the
    percentage is undefined there. None when no month can be scored."""
    scored = [(f, a) for f, a in pairs if a]
    if not scored:
        return None
    forecast, actual = zip(*scored)
    return float(mean_absolute_percentage_error(actual, forecast)) * 100


def accuracy(values, window=WINDOW, months=BACKTEST_MONTHS, pairs=None):
    """MAE / MAPE of the back-test. Pass `pairs` (from backtest) to avoid computing it twice."""
    pairs = backtest(values, window, months) if pairs is None else pairs
    return {"mae": _round(mae(pairs)), "mape": _round(mape(pairs)), "months": len(pairs)}


def seasonal_check(forecast, last_year, before, recent):
    """What the moving average cannot see, shown next to it (the forecast itself is unchanged, as the thesis
    specifies). A six-month average lags a rising or falling trend and misses yearly peaks.

    last_year: the forecast month one year earlier; before: the six months before that one; recent: the latest six
    months. Returns the change last year from those six months to the same month (a seasonal swing), the forecast
    scaled by that swing ("if this year repeats last year"), and the change of the latest three months against the
    three before them (the trend). Percentages are None when there is nothing to compare with."""
    base = sum(before) / len(before) if before else 0
    swing = growth_rate(last_year, base)
    older, newer = sum(recent[:3]), sum(recent[3:])
    return {
        "lastYear": _round(last_year), "lastYearBefore": _round(base), "seasonalChange": _round(swing, 1),
        "ifLikeLastYear": None if swing is None else _round(forecast * (1 + swing / 100)),
        "trendChange": _round(growth_rate(newer, older), 1) if len(recent) == 6 else None,
    }


def lost_demand(sold_in_stock, days_in_stock, sold_out_of_stock, days_out):
    """Units customers probably wanted but could not buy while the shelf was empty: the item's daily rate on the
    days it was in stock, times the days it was out, less anything still sold on those days. None when the item was
    out the whole period (no in-stock days to measure the rate from); 0 when it never ran out."""
    if not days_out:
        return 0.0
    if not days_in_stock:
        return None
    return max(0.0, sold_in_stock / days_in_stock * days_out - sold_out_of_stock)


def growth_rate(current, previous):
    """((current - previous) / previous) * 100. None when there is no previous value to compare with."""
    if not previous:
        return None
    return (current - previous) / previous * 100


def classify_movers(rows, key="avg_units"):
    """Fast / moderate / slow by the tercile rule: within a group, the top third by average monthly units is
    fast-moving, the bottom third slow-moving, the rest moderate. `rows` is a list of dicts for ONE group
    (one branch + one category). Adds a "movement" key to each row and returns the list, best seller first."""
    ranked = sorted(rows, key=lambda r: (-r[key], r["name"]))
    n = len(ranked)
    fast_n = n // 3
    slow_n = n // 3
    for i, row in enumerate(ranked):
        if i < fast_n:
            row["movement"] = "fast"
        elif i >= n - slow_n:
            row["movement"] = "slow"
        else:
            row["movement"] = "moderate"
    return ranked


def _round(x, places=2):
    return None if x is None else round(x, places)
