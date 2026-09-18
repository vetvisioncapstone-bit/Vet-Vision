"""Demand forecasting exactly as scoped in the thesis (Section 3.6):
Pandas for aggregation, a simple Moving Average for the forecast itself,
and Scikit-learn's metrics module ONLY to score that forecast (MAE, MAPE) —
no model training, per the thesis's explicit scope boundary.

This intentionally does not use scikit-learn to *produce* the forecast,
only to *grade* it, matching:
    "the package will not be used to build machine-learning models;
     instead, it will be employed only for its metrics module"
"""

import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error

from .models import SaleLine


def monthly_units_sold(branch_id: str, product_id: str) -> pd.DataFrame:
    rows = SaleLine.objects.filter(branch_id=branch_id, product_id=product_id).values(
        "month", "quantity"
    )
    df = pd.DataFrame.from_records(rows)
    if df.empty:
        return pd.DataFrame(columns=["month", "units_sold"])

    df["month"] = pd.to_datetime(df["month"])
    monthly = df.groupby("month", as_index=False)["quantity"].sum()
    monthly = monthly.rename(columns={"quantity": "units_sold"}).sort_values("month")
    return monthly.reset_index(drop=True)


def moving_average_forecast(branch_id: str, product_id: str, window: int = 3) -> dict:
    """Returns the monthly history, a moving-average forecast for the
    month after the last observed one, and MAE/MAPE of that same
    moving-average method backtested over the observed history (i.e. "if
    we'd been forecasting this way all along, how far off would we have
    been each month")."""
    monthly = monthly_units_sold(branch_id, product_id)

    if len(monthly) < window + 1:
        return {
            "branch_id": branch_id,
            "product_id": product_id,
            "window": window,
            "history": monthly.assign(
                month=monthly["month"].dt.strftime("%Y-%m")
            ).to_dict("records"),
            "forecast_next_month_units": None,
            "mae": None,
            "mape": None,
            "note": f"Need at least {window + 1} months of sales history to "
            "backtest a moving average of this window size.",
        }

    monthly["moving_avg"] = monthly["units_sold"].rolling(window=window).mean().shift(1)
    backtest = monthly.dropna(subset=["moving_avg"])

    mae = mean_absolute_error(backtest["units_sold"], backtest["moving_avg"])
    mape = mean_absolute_percentage_error(backtest["units_sold"], backtest["moving_avg"])

    forecast_next_month = monthly["units_sold"].tail(window).mean()

    return {
        "branch_id": branch_id,
        "product_id": product_id,
        "window": window,
        "history": monthly.assign(
            month=monthly["month"].dt.strftime("%Y-%m")
        )[["month", "units_sold"]].to_dict("records"),
        "forecast_next_month_units": round(float(forecast_next_month), 2),
        "mae": round(float(mae), 3),
        "mape": round(float(mape) * 100, 2),  # as a percentage, matching thesis wording
    }
