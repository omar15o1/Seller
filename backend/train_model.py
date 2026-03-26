from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder


BASE_DIR = Path(__file__).resolve().parent
CSV_PATH = BASE_DIR / "car_price_prediction.csv"
MODEL_PATH = BASE_DIR / "cars_predictions.joblib"
ENCODERS_PATH = BASE_DIR / "encoders.joblib"


def _clean_int(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.replace(r"[^\d\-]", "", regex=True)
    out = pd.to_numeric(s, errors="coerce").fillna(0).astype(int)
    return out


def _clean_float(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.replace(r"[^0-9.\-]", "", regex=True)
    out = pd.to_numeric(s, errors="coerce").fillna(0.0).astype(float)
    return out


def main() -> None:
    if not CSV_PATH.exists():
        raise SystemExit(f"CSV not found: {CSV_PATH}")

    df = pd.read_csv(CSV_PATH)

    # Normalize column names -> match FastAPI schema keys.
    df = df.rename(
        columns={
            "Fuel type": "Fuel_type",
            "Gear box type": "Gear_box_type",
            "Drive wheels": "Drive_wheels",
            "Engine volume": "Engine_volume",
            "Prod. year": "Prod_year",
        }
    )

    # Clean numeric fields
    df["Mileage"] = _clean_int(df["Mileage"])
    df["Levy"] = _clean_int(df["Levy"])
    df["Cylinders"] = _clean_int(df["Cylinders"])
    df["Airbags"] = _clean_int(df["Airbags"])
    df["Engine_volume"] = _clean_float(df["Engine_volume"])

    # Age feature used by API
    current_year = int(pd.Timestamp.now().year)
    df["age"] = (current_year - pd.to_numeric(df["Prod_year"], errors="coerce").fillna(current_year)).clip(lower=0).astype(int)

    feature_columns = [
        "Manufacturer",
        "Model",
        "Category",
        "Fuel_type",
        "Gear_box_type",
        "Drive_wheels",
        "Wheel",
        "Color",
        "Engine_volume",
        "Mileage",
        "Levy",
        "Cylinders",
        "Airbags",
        "age",
    ]

    # Drop rows with missing target or features.
    df = df.dropna(subset=["Price"])
    X = df[feature_columns].copy()
    y = pd.to_numeric(df["Price"], errors="coerce").fillna(0).astype(float)

    cat_cols = [
        "Manufacturer",
        "Model",
        "Category",
        "Fuel_type",
        "Gear_box_type",
        "Drive_wheels",
        "Wheel",
        "Color",
    ]

    encoders: dict[str, LabelEncoder] = {}
    for c in cat_cols:
        le = LabelEncoder()
        X[c] = X[c].astype(str).fillna("")
        le.fit(X[c].values)
        X[c] = le.transform(X[c].values)
        encoders[c] = le

    X_num = X.astype(float).values

    X_train, X_test, y_train, y_test = train_test_split(
        X_num, y.values, test_size=0.15, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=300,
        random_state=42,
        n_jobs=-1,
        min_samples_leaf=2,
    )
    model.fit(X_train, y_train)

    score = model.score(X_test, y_test)
    print(f"Trained RandomForestRegressor. R^2 on holdout: {score:.4f}")

    joblib.dump(model, MODEL_PATH)
    joblib.dump(encoders, ENCODERS_PATH)
    print(f"Saved model -> {MODEL_PATH}")
    print(f"Saved encoders -> {ENCODERS_PATH}")


if __name__ == "__main__":
    main()
