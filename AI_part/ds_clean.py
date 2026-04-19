"""End-to-end loan scoring pipeline using application, installment, and previous-loan datasets.

Run:
    python ds_clean.py --data-dir . --output-dir artifacts
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


EPS = 1e-6


def to_float(value: Any, default: float = 0.0) -> float:
    """Safely cast values to float and fallback on missing/non-numeric inputs."""
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def clamp(value: float, low: float, high: float) -> float:
    """Clamp a float to a given numeric range."""
    return float(max(low, min(value, high)))


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Loan approval scoring pipeline")
    parser.add_argument("--data-dir", type=Path, default=Path("."), help="Directory containing source CSV files")
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts"), help="Directory for output artifacts")
    parser.add_argument("--application-file", type=str, default="application_trainv2.csv")
    parser.add_argument("--installments-file", type=str, default="installments_paymentsv3.csv")
    parser.add_argument("--previous-file", type=str, default="previous_applications.csv")
    parser.add_argument("--random-state", type=int, default=42)
    return parser.parse_args()


def load_data(data_dir: Path, application_file: str, installments_file: str, previous_file: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load all source datasets."""
    app = pd.read_csv(data_dir / application_file)
    inst = pd.read_csv(data_dir / installments_file)
    prev = pd.read_csv(data_dir / previous_file)
    return app, inst, prev


def profile_dataframe(df: pd.DataFrame, name: str, key_cols: list[str], target_col: str | None = None) -> dict[str, Any]:
    """Create a compact profile report for one dataset."""
    profile: dict[str, Any] = {
        "name": name,
        "shape": [int(df.shape[0]), int(df.shape[1])],
        "columns_count": int(df.shape[1]),
        "dtypes": {k: int(v) for k, v in df.dtypes.astype(str).value_counts().to_dict().items()},
        "top_missing_pct": {k: float(v) for k, v in (df.isna().mean().sort_values(ascending=False).head(10) * 100).round(2).to_dict().items()},
        "duplicates_rows": int(df.duplicated().sum()),
    }
    profile["key_columns"] = {}
    for col in key_cols:
        if col in df.columns:
            profile["key_columns"][col] = {"nunique": int(df[col].nunique(dropna=True)), "missing": int(df[col].isna().sum())}
    if target_col and target_col in df.columns:
        vc = df[target_col].value_counts(dropna=False).to_dict()
        profile["target_distribution"] = {str(k): int(v) for k, v in vc.items()}
        profile["target_rate"] = float(df[target_col].mean())
    return profile


def category_bad_rates(df: pd.DataFrame, column: str, target_col: str = "TARGET", min_count: int = 100, top_n: int = 8) -> list[dict[str, Any]]:
    """Compute highest bad-rate categories for a categorical feature."""
    if column not in df.columns or target_col not in df.columns:
        return []
    grp = df.groupby(column, dropna=False)[target_col].agg(["count", "mean"]).reset_index()
    grp = grp[grp["count"] >= min_count].sort_values("mean", ascending=False).head(top_n)
    out: list[dict[str, Any]] = []
    for _, row in grp.iterrows():
        out.append({"category": str(row[column]), "count": int(row["count"]), "bad_rate": float(round(row["mean"], 4))})
    return out


def build_dataset_report(app: pd.DataFrame, inst: pd.DataFrame, prev: pd.DataFrame) -> dict[str, Any]:
    """Build multi-dataset analytics report with quality and join checks."""
    app_ids = set(app["SK_ID_CURR"].unique())
    report: dict[str, Any] = {
        "datasets": [
            profile_dataframe(app, "application_trainv2.csv", ["SK_ID_CURR", "TARGET"], "TARGET"),
            profile_dataframe(inst, "installments_paymentsv3.csv", ["SK_ID_CURR", "SK_ID_PREV"]),
            profile_dataframe(prev, "previous_applications.csv", ["SK_ID_CURR", "SK_ID_PREV"]),
        ],
        "join_coverage": {
            "installments_record_overlap_with_application_pct": float(round(inst["SK_ID_CURR"].isin(app_ids).mean() * 100, 2)),
            "previous_record_overlap_with_application_pct": float(round(prev["SK_ID_CURR"].isin(app_ids).mean() * 100, 2)),
            "application_clients_with_installments_pct": float(round(app["SK_ID_CURR"].isin(inst["SK_ID_CURR"]).mean() * 100, 2)),
            "application_clients_with_previous_apps_pct": float(round(app["SK_ID_CURR"].isin(prev["SK_ID_CURR"]).mean() * 100, 2)),
        },
        "target_insights": {},
    }

    if "TARGET" in app.columns:
        numeric_cols = [c for c in app.select_dtypes(include=["number"]).columns if c != "TARGET"]
        if numeric_cols:
            corr = app[numeric_cols + ["TARGET"]].corr(numeric_only=True)["TARGET"].drop("TARGET").abs().sort_values(ascending=False).head(10)
            report["target_insights"]["top_numeric_correlations_abs"] = {k: float(round(v, 4)) for k, v in corr.to_dict().items()}
        report["target_insights"]["category_bad_rates"] = {
            "NAME_INCOME_TYPE": category_bad_rates(app, "NAME_INCOME_TYPE"),
            "NAME_EDUCATION_TYPE": category_bad_rates(app, "NAME_EDUCATION_TYPE"),
            "NAME_FAMILY_STATUS": category_bad_rates(app, "NAME_FAMILY_STATUS"),
            "OCCUPATION_TYPE": category_bad_rates(app, "OCCUPATION_TYPE"),
        }
    return report


def build_application_features(app: pd.DataFrame) -> pd.DataFrame:
    """Create robust application-level features."""
    app = app.copy()
    app["DAYS_EMPLOYED"] = app["DAYS_EMPLOYED"].where(app["DAYS_EMPLOYED"] < 0, np.nan)
    app["AGE_YEARS"] = (-app["DAYS_BIRTH"] / 365.25).clip(lower=18, upper=100)
    app["EMPLOYMENT_YEARS"] = (-app["DAYS_EMPLOYED"] / 365.25).clip(lower=0)
    app["EXT_SOURCE_MEAN"] = app[["EXT_SOURCE_1", "EXT_SOURCE_2", "EXT_SOURCE_3"]].mean(axis=1)
    app["CREDIT_INCOME_RATIO"] = app["AMT_CREDIT"] / (app["AMT_INCOME_TOTAL"] + EPS)
    app["ANNUITY_INCOME_RATIO"] = app["AMT_ANNUITY"] / (app["AMT_INCOME_TOTAL"] + EPS)
    app["GOODS_CREDIT_RATIO"] = app["AMT_GOODS_PRICE"] / (app["AMT_CREDIT"] + EPS)
    app["INCOME_PER_FAM_MEMBER"] = app["AMT_INCOME_TOTAL"] / (app["CNT_FAM_MEMBERS"] + EPS)
    app["CHILD_TO_FAMILY_RATIO"] = app["CNT_CHILDREN"] / (app["CNT_FAM_MEMBERS"] + EPS)
    return app


def aggregate_installments(inst: pd.DataFrame) -> pd.DataFrame:
    """Aggregate installment history into client-level repayment signals."""
    inst = inst.copy()
    inst["LATE_DAYS"] = inst["DAYS_ENTRY_PAYMENT"] - inst["DAYS_INSTALMENT"]
    inst["PAYMENT_RATIO"] = inst["AMT_PAYMENT"] / (inst["AMT_INSTALMENT"] + EPS)
    inst["IS_LATE"] = (inst["LATE_DAYS"] > 0).astype(int)
    inst["IS_SEVERE_LATE"] = (inst["LATE_DAYS"] > 30).astype(int)
    inst["IS_UNDERPAID"] = (inst["PAYMENT_RATIO"] < 0.95).astype(int)
    inst["IS_OVERPAID"] = (inst["PAYMENT_RATIO"] > 1.05).astype(int)
    inst["MISSED_PAYMENT"] = (inst["AMT_PAYMENT"] < 1.0).astype(int)
    inst["PAYMENT_GAP"] = inst["AMT_PAYMENT"] - inst["AMT_INSTALMENT"]

    # Payment spike: transaction unusually larger than client's own median payment.
    client_payment_median = inst.groupby("SK_ID_CURR")["AMT_PAYMENT"].transform("median")
    inst["PAYMENT_SPIKE"] = (inst["AMT_PAYMENT"] > (client_payment_median * 2.5 + EPS)).astype(int)

    agg = (
        inst.groupby("SK_ID_CURR")
        .agg(
            INST_COUNT=("SK_ID_PREV", "count"),
            INST_UNIQUE_PREV=("SK_ID_PREV", "nunique"),
            INST_LATE_RATIO=("IS_LATE", "mean"),
            INST_SEVERE_LATE_RATIO=("IS_SEVERE_LATE", "mean"),
            INST_UNDERPAID_RATIO=("IS_UNDERPAID", "mean"),
            INST_OVERPAID_RATIO=("IS_OVERPAID", "mean"),
            INST_MISSED_RATIO=("MISSED_PAYMENT", "mean"),
            INST_PAYMENT_SPIKE_RATIO=("PAYMENT_SPIKE", "mean"),
            INST_LATE_DAYS_MEAN=("LATE_DAYS", "mean"),
            INST_LATE_DAYS_MAX=("LATE_DAYS", "max"),
            INST_PAYMENT_RATIO_MEAN=("PAYMENT_RATIO", "mean"),
            INST_PAYMENT_RATIO_STD=("PAYMENT_RATIO", "std"),
            INST_AMT_INSTALMENT_MEAN=("AMT_INSTALMENT", "mean"),
            INST_AMT_PAYMENT_MEAN=("AMT_PAYMENT", "mean"),
            INST_PAYMENT_GAP_MEAN=("PAYMENT_GAP", "mean"),
        )
        .reset_index()
    )
    return agg


def aggregate_previous(prev: pd.DataFrame) -> pd.DataFrame:
    """Aggregate previous-loan applications into client-level credit history signals."""
    prev = prev.copy()
    prev["PREV_REJECTED"] = (prev["CODE_REJECT_REASON"].fillna("XAP") != "XAP").astype(int)
    prev["PREV_APP_CREDIT_RATIO"] = prev["AMT_APPLICATION"] / (prev["AMT_CREDIT"] + EPS)
    prev["PREV_APP_CREDIT_GAP"] = prev["AMT_APPLICATION"] - prev["AMT_CREDIT"]

    base_agg = (
        prev.groupby("SK_ID_CURR")
        .agg(
            PREV_APP_COUNT=("SK_ID_PREV", "count"),
            PREV_REJECT_RATIO=("PREV_REJECTED", "mean"),
            PREV_AMT_APPLICATION_MEAN=("AMT_APPLICATION", "mean"),
            PREV_AMT_CREDIT_MEAN=("AMT_CREDIT", "mean"),
            PREV_AMT_ANNUITY_MEAN=("AMT_ANNUITY", "mean"),
            PREV_CNT_PAYMENT_MEAN=("CNT_PAYMENT", "mean"),
            PREV_DAYS_DECISION_MAX=("DAYS_DECISION", "max"),
            PREV_DAYS_DECISION_MIN=("DAYS_DECISION", "min"),
            PREV_APP_CREDIT_RATIO_MEAN=("PREV_APP_CREDIT_RATIO", "mean"),
            PREV_APP_CREDIT_GAP_MEAN=("PREV_APP_CREDIT_GAP", "mean"),
        )
        .reset_index()
    )

    contract_counts = prev.pivot_table(
        index="SK_ID_CURR",
        columns="NAME_CONTRACT_TYPE",
        values="SK_ID_PREV",
        aggfunc="count",
        fill_value=0,
    ).reset_index()
    contract_counts.columns = [
        "SK_ID_CURR" if c == "SK_ID_CURR" else f"PREV_CONTRACT_{str(c).upper().replace(' ', '_').replace('/', '_')}"
        for c in contract_counts.columns
    ]

    return base_agg.merge(contract_counts, on="SK_ID_CURR", how="left")


def build_feature_table(app: pd.DataFrame, inst: pd.DataFrame, prev: pd.DataFrame) -> pd.DataFrame:
    """Merge all feature sources into one client-level training table."""
    app_f = build_application_features(app)
    inst_f = aggregate_installments(inst)
    prev_f = aggregate_previous(prev)

    table = app_f.merge(inst_f, on="SK_ID_CURR", how="left").merge(prev_f, on="SK_ID_CURR", how="left")
    table["HAS_INSTALLMENT_HISTORY"] = table["INST_COUNT"].notna().astype(int)
    table["HAS_PREVIOUS_APPLICATIONS"] = table["PREV_APP_COUNT"].notna().astype(int)
    return table


def quantile_risk_summary(df: pd.DataFrame, feature: str, target: str = "TARGET", bins: int = 5) -> list[dict[str, Any]]:
    """Summarize bad-rate progression across feature quantiles."""
    if feature not in df.columns or target not in df.columns:
        return []
    valid = df[[feature, target]].dropna()
    if valid.empty or valid[feature].nunique() < bins:
        return []

    valid = valid.copy()
    valid["bucket"] = pd.qcut(valid[feature], q=bins, duplicates="drop")
    stats = valid.groupby("bucket", observed=False)[target].agg(["count", "mean"]).reset_index()
    out: list[dict[str, Any]] = []
    for _, row in stats.iterrows():
        bucket = row["bucket"]
        out.append(
            {
                "bucket": str(bucket),
                "count": int(row["count"]),
                "bad_rate": float(round(row["mean"], 4)),
                "left": float(round(bucket.left, 6)),
                "right": float(round(bucket.right, 6)),
            }
        )
    return out


def build_feature_risk_report(features: pd.DataFrame) -> dict[str, Any]:
    """Deep risk analysis on engineered features."""
    tracked = [
        "EXT_SOURCE_MEAN",
        "CREDIT_INCOME_RATIO",
        "ANNUITY_INCOME_RATIO",
        "INST_LATE_RATIO",
        "INST_SEVERE_LATE_RATIO",
        "PREV_REJECT_RATIO",
    ]
    report: dict[str, Any] = {"feature_quantile_risk": {}}
    for col in tracked:
        report["feature_quantile_risk"][col] = quantile_risk_summary(features, col)
    return report


def build_credit_model_specs(numeric_cols: list[str], categorical_cols: list[str], random_state: int) -> dict[str, Pipeline | CalibratedClassifierCV]:
    """Create candidate models for supervised credit scoring."""
    log_pre = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric_cols),
            (
                "cat",
                Pipeline(
                    [("impute", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore", min_frequency=0.01))]
                ),
                categorical_cols,
            ),
        ]
    )
    logistic = Pipeline(
        steps=[
            ("preprocess", log_pre),
            ("model", LogisticRegression(max_iter=2000, class_weight="balanced", solver="lbfgs")),
        ]
    )

    rf_pre = ColumnTransformer(
        transformers=[
            ("num", SimpleImputer(strategy="median"), numeric_cols),
            (
                "cat",
                Pipeline(
                    [("impute", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore", min_frequency=0.01))]
                ),
                categorical_cols,
            ),
        ]
    )
    rf_base = Pipeline(
        steps=[
            ("preprocess", rf_pre),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=450,
                    max_depth=12,
                    min_samples_leaf=25,
                    class_weight="balanced_subsample",
                    n_jobs=-1,
                    random_state=random_state,
                ),
            ),
        ]
    )
    rf_calibrated = CalibratedClassifierCV(estimator=rf_base, method="sigmoid", cv=3, n_jobs=-1)

    return {"logistic_regression": logistic, "calibrated_random_forest": rf_calibrated}


def evaluate_predictions(y_true: pd.Series, y_prob: np.ndarray) -> dict[str, float]:
    """Compute core binary-classification quality metrics."""
    return {
        "roc_auc": float(roc_auc_score(y_true, y_prob)),
        "pr_auc": float(average_precision_score(y_true, y_prob)),
        "brier_score": float(brier_score_loss(y_true, y_prob)),
    }


def train_credit_model(features: pd.DataFrame, random_state: int) -> tuple[Any, dict[str, Any], pd.DataFrame]:
    """Train candidate credit models, pick best one, and return holdout predictions."""
    if "TARGET" not in features.columns:
        raise ValueError("TARGET column is required to train credit model.")

    y = features["TARGET"].astype(int)
    X = features.drop(columns=["TARGET"])
    ids = features["SK_ID_CURR"].copy()

    train_idx, test_idx = train_test_split(
        np.arange(len(features)),
        test_size=0.2,
        random_state=random_state,
        stratify=y,
    )
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

    numeric_cols = X.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = [c for c in X.columns if c not in numeric_cols]
    specs = build_credit_model_specs(numeric_cols, categorical_cols, random_state)

    model_metrics: dict[str, dict[str, float]] = {}
    fitted_models: dict[str, Any] = {}
    predictions: dict[str, np.ndarray] = {}
    for name, model in specs.items():
        model.fit(X_train, y_train)
        y_prob = model.predict_proba(X_test)[:, 1]
        model_metrics[name] = evaluate_predictions(y_test, y_prob)
        fitted_models[name] = model
        predictions[name] = y_prob

    # Select best by ROC AUC, with PR AUC tie-breaker.
    best_model_name = max(
        model_metrics,
        key=lambda m: (model_metrics[m]["roc_auc"], model_metrics[m]["pr_auc"]),
    )

    # Refit chosen model on full dataset for deployment.
    deploy_model = specs[best_model_name]
    deploy_model.fit(X, y)

    test_scores = predictions[best_model_name]
    holdout = pd.DataFrame(
        {
            "SK_ID_CURR": ids.iloc[test_idx].values,
            "TARGET": y_test.values,
            "probability_default": test_scores,
        }
    )

    report = {
        "selected_model": best_model_name,
        "model_metrics": model_metrics,
        "holdout_size": int(len(test_idx)),
        "train_size": int(len(train_idx)),
        "target_rate_train": float(y_train.mean()),
        "target_rate_test": float(y_test.mean()),
    }
    return deploy_model, report, holdout


def train_fraud_model(features: pd.DataFrame, random_state: int) -> tuple[IsolationForest, list[str], dict[str, float], pd.Series]:
    """Train an unsupervised anomaly model for fraud/AML flags."""
    fraud_features = [
        c
        for c in [
            "INST_COUNT",
            "INST_UNIQUE_PREV",
            "INST_LATE_RATIO",
            "INST_SEVERE_LATE_RATIO",
            "INST_UNDERPAID_RATIO",
            "INST_MISSED_RATIO",
            "INST_PAYMENT_SPIKE_RATIO",
            "INST_PAYMENT_RATIO_MEAN",
            "INST_PAYMENT_RATIO_STD",
            "PREV_APP_COUNT",
            "PREV_REJECT_RATIO",
            "PREV_APP_CREDIT_RATIO_MEAN",
            "PREV_APP_CREDIT_GAP_MEAN",
            "PREV_CNT_PAYMENT_MEAN",
            "CREDIT_INCOME_RATIO",
            "ANNUITY_INCOME_RATIO",
        ]
        if c in features.columns
    ]
    fraud_matrix = features[fraud_features].fillna(0.0)

    model = IsolationForest(
        n_estimators=250,
        contamination=0.03,
        random_state=random_state,
        n_jobs=-1,
    )
    model.fit(fraud_matrix)

    # Higher score = more anomalous/suspicious.
    anomaly_score = pd.Series(-model.score_samples(fraud_matrix), index=features.index, name="fraud_anomaly_score")
    thresholds = {
        "medium": float(anomaly_score.quantile(0.90)),
        "high": float(anomaly_score.quantile(0.97)),
    }
    return model, fraud_features, thresholds, anomaly_score


def fraud_level_from_score(score: float, medium_threshold: float, high_threshold: float) -> str:
    """Convert anomaly score to categorical fraud risk."""
    if score >= high_threshold:
        return "High"
    if score >= medium_threshold:
        return "Medium"
    return "Low"


def principal_from_installment(monthly_installment: float, annual_rate: float, tenor_months: int) -> float:
    """Convert max monthly installment into principal cap using annuity formula."""
    monthly_installment = max(0.0, monthly_installment)
    r = annual_rate / 12.0
    if monthly_installment <= 0:
        return 0.0
    if r <= 0:
        return monthly_installment * tenor_months
    factor = (1 - (1 + r) ** (-tenor_months)) / r
    return monthly_installment * factor


def expense_ratio_estimate(row: pd.Series) -> float:
    """Estimate normal monthly expense ratio from profile data."""
    children = to_float(row.get("CNT_CHILDREN"), 0.0)
    family = max(to_float(row.get("CNT_FAM_MEMBERS"), 1.0), 1.0)
    income_type = str(row.get("NAME_INCOME_TYPE", ""))

    ratio = 0.50
    ratio += min(children, 4) * 0.03
    ratio += max(family - 1, 0) * 0.01

    if income_type == "Pensioner":
        ratio -= 0.05
    elif income_type == "Working":
        ratio += 0.02
    elif income_type == "Commercial associate":
        ratio += 0.01

    return clamp(ratio, 0.45, 0.78)


def risk_multiplier(pd_value: float) -> float:
    """Map default probability to conservative affordability multiplier."""
    if pd_value <= 0.05:
        return 1.00
    if pd_value <= 0.10:
        return 0.85
    if pd_value <= 0.20:
        return 0.70
    if pd_value <= 0.30:
        return 0.50
    return 0.30


def compute_recommendation(row: pd.Series, annual_rate: float = 0.12, tenors: tuple[int, ...] = (12, 18, 24, 36)) -> dict[str, float]:
    """Compute affordability and loan recommendation from profile + risk."""
    pd_value = to_float(row.get("probability_default"), 0.5)
    monthly_income = to_float(row.get("AMT_INCOME_TOTAL"), 0.0) / 12.0
    expense_ratio = expense_ratio_estimate(row)
    estimated_expenses = monthly_income * expense_ratio
    existing_installments = max(to_float(row.get("INST_AMT_INSTALMENT_MEAN"), 0.0), 0.0)

    disposable = monthly_income - estimated_expenses - existing_installments
    base_max_installment = max(disposable * 0.75, 0.0)
    adjusted_max_installment = base_max_installment * risk_multiplier(pd_value)

    principal_per_tenor = {tenor: principal_from_installment(adjusted_max_installment, annual_rate, tenor) for tenor in tenors}
    best_tenor = max(principal_per_tenor, key=principal_per_tenor.get)
    raw_recommended = principal_per_tenor[best_tenor]

    income_cap_multiplier = 0.45 if pd_value <= 0.10 else 0.35 if pd_value <= 0.20 else 0.25
    income_cap = to_float(row.get("AMT_INCOME_TOTAL"), 0.0) * income_cap_multiplier
    max_recommended = min(raw_recommended, income_cap)

    affordability_score = clamp((adjusted_max_installment / (monthly_income + EPS)) * 2500, 0.0, 1000.0)
    return {
        "monthly_income": monthly_income,
        "estimated_expenses": estimated_expenses,
        "existing_installments_est": existing_installments,
        "max_monthly_installment": adjusted_max_installment,
        "max_recommended_loan": max_recommended,
        "recommended_duration_months": float(best_tenor),
        "affordability_score": affordability_score,
    }


def generate_reasons(row: pd.Series) -> list[str]:
    """Generate concise and explainable reasons behind score/decision."""
    reasons: list[str] = []
    pd_value = to_float(row.get("probability_default"), 0.5)
    ci_ratio = to_float(row.get("CREDIT_INCOME_RATIO"), np.nan)
    annuity_ratio = to_float(row.get("ANNUITY_INCOME_RATIO"), np.nan)
    late_ratio = to_float(row.get("INST_LATE_RATIO"), np.nan)
    reject_ratio = to_float(row.get("PREV_REJECT_RATIO"), np.nan)
    ext_mean = to_float(row.get("EXT_SOURCE_MEAN"), np.nan)
    fraud_level = str(row.get("fraud_risk_level", "Low"))

    if not np.isnan(ext_mean):
        if ext_mean >= 0.60:
            reasons.append("Strong external credit signals")
        elif ext_mean <= 0.35:
            reasons.append("Weak external credit signals")

    if not np.isnan(late_ratio):
        if late_ratio <= 0.10:
            reasons.append("Low late-payment ratio in installment history")
        elif late_ratio >= 0.30:
            reasons.append("Frequent late payments in installment history")

    if not np.isnan(reject_ratio):
        if reject_ratio >= 0.40:
            reasons.append("High ratio of previously rejected applications")
        elif reject_ratio <= 0.10:
            reasons.append("Low historical rejection ratio on previous applications")

    if not np.isnan(ci_ratio):
        if ci_ratio >= 5.0:
            reasons.append("High credit-to-income burden")
        elif ci_ratio <= 2.0:
            reasons.append("Credit amount is reasonable versus income")

    if not np.isnan(annuity_ratio):
        if annuity_ratio >= 0.40:
            reasons.append("High annuity-to-income ratio reduces affordability")
        elif annuity_ratio <= 0.20:
            reasons.append("Healthy annuity-to-income ratio supports affordability")

    if pd_value <= 0.06:
        reasons.append("Low model-estimated probability of default")
    elif pd_value >= 0.20:
        reasons.append("Elevated model-estimated probability of default")

    if fraud_level == "High":
        reasons.append("High anomaly score from fraud/AML monitoring")
    elif fraud_level == "Medium":
        reasons.append("Moderate anomaly score requires additional checks")

    # Keep first 3 unique reasons.
    deduped: list[str] = []
    for reason in reasons:
        if reason not in deduped:
            deduped.append(reason)
        if len(deduped) == 3:
            break
    if not deduped:
        deduped = ["Insufficient historical signals, manual review recommended"]
    return deduped


def decision_engine(row: pd.Series) -> str:
    """Final decision policy combining credit risk, affordability, and fraud flags."""
    pd_value = to_float(row.get("probability_default"), 0.5)
    fraud_level = str(row.get("fraud_risk_level", "Low"))
    requested_amount = to_float(row.get("requested_amount_proxy"), 0.0)
    recommended_amount = to_float(row.get("max_recommended_loan"), 0.0)
    max_installment = to_float(row.get("max_monthly_installment"), 0.0)

    if max_installment <= 0 or pd_value >= 0.35:
        return "Rejected - high default/affordability risk"
    if fraud_level == "High":
        return "Compliance review required"
    if requested_amount > (recommended_amount * 1.10):
        return "Counter-offer recommended amount"
    if pd_value <= 0.06 and fraud_level == "Low":
        return "Eligible with standard conditions"
    if pd_value <= 0.15 and fraud_level in {"Low", "Medium"}:
        return "Eligible with reinforced monitoring"
    return "Manual credit review"


def score_portfolio(features: pd.DataFrame, credit_model: Any, fraud_scores: pd.Series, fraud_thresholds: dict[str, float]) -> pd.DataFrame:
    """Score all clients and compute recommendation + decision outputs."""
    model_input = features.drop(columns=["TARGET"]) if "TARGET" in features.columns else features.copy()
    prob_default = credit_model.predict_proba(model_input)[:, 1]

    scored = features.copy()
    scored["probability_default"] = prob_default
    scored["credit_score"] = np.clip(np.round((1.0 - scored["probability_default"]) * 1000), 0, 1000).astype(int)
    scored["requested_amount_proxy"] = scored["AMT_CREDIT"]
    scored["fraud_anomaly_score"] = fraud_scores.values
    scored["fraud_risk_level"] = scored["fraud_anomaly_score"].apply(
        lambda s: fraud_level_from_score(s, fraud_thresholds["medium"], fraud_thresholds["high"])
    )
    scored["aml_risk_level"] = scored["fraud_risk_level"]

    recs = scored.apply(compute_recommendation, axis=1, result_type="expand")
    scored = pd.concat([scored, recs], axis=1)
    scored["decision"] = scored.apply(decision_engine, axis=1)
    scored["main_reasons"] = scored.apply(lambda row: " | ".join(generate_reasons(row)), axis=1)
    return scored


def save_json(path: Path, data: dict[str, Any]) -> None:
    """Persist dictionary as formatted JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)


def main() -> None:
    """Run the full training + scoring pipeline."""
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading datasets...")
    app, inst, prev = load_data(args.data_dir, args.application_file, args.installments_file, args.previous_file)

    print("Building dataset analysis report...")
    dataset_report = build_dataset_report(app, inst, prev)
    save_json(args.output_dir / "dataset_analysis_report.json", dataset_report)

    print("Creating feature table...")
    features = build_feature_table(app, inst, prev)
    feature_risk_report = build_feature_risk_report(features)
    save_json(args.output_dir / "engineered_feature_risk_report.json", feature_risk_report)

    print("Training supervised credit model candidates...")
    credit_model, credit_report, holdout_scores = train_credit_model(features, random_state=args.random_state)
    save_json(args.output_dir / "credit_model_report.json", credit_report)
    holdout_scores.to_csv(args.output_dir / "credit_holdout_predictions.csv", index=False)

    print("Training fraud/AML anomaly model...")
    fraud_model, fraud_feature_cols, fraud_thresholds, fraud_scores = train_fraud_model(features, random_state=args.random_state)
    save_json(
        args.output_dir / "fraud_model_report.json",
        {
            "fraud_feature_columns": fraud_feature_cols,
            "thresholds": fraud_thresholds,
            "contamination_assumption": 0.03,
        },
    )

    print("Scoring full portfolio and generating decisions...")
    scored = score_portfolio(features, credit_model, fraud_scores, fraud_thresholds)
    export_cols = [
        "SK_ID_CURR",
        "TARGET",
        "credit_score",
        "probability_default",
        "affordability_score",
        "max_recommended_loan",
        "recommended_duration_months",
        "max_monthly_installment",
        "requested_amount_proxy",
        "fraud_anomaly_score",
        "fraud_risk_level",
        "aml_risk_level",
        "decision",
        "main_reasons",
    ]
    scored[export_cols].to_csv(args.output_dir / "loan_scoring_results.csv", index=False)

    print("Saving trained models...")
    joblib.dump({"model": credit_model, "feature_columns": [c for c in features.columns if c != "TARGET"]}, args.output_dir / "credit_model.joblib")
    joblib.dump(
        {"model": fraud_model, "feature_columns": fraud_feature_cols, "thresholds": fraud_thresholds},
        args.output_dir / "fraud_model.joblib",
    )

    # Console summary for quick feedback.
    selected = credit_report["selected_model"]
    selected_metrics = credit_report["model_metrics"][selected]
    print("\n=== Training Summary ===")
    print(f"Selected credit model: {selected}")
    print(f"ROC-AUC: {selected_metrics['roc_auc']:.4f}")
    print(f"PR-AUC: {selected_metrics['pr_auc']:.4f}")
    print(f"Brier score: {selected_metrics['brier_score']:.4f}")
    print(f"Output directory: {args.output_dir.resolve()}")
    print("Generated files:")
    for file_path in sorted(args.output_dir.glob("*")):
        print(f" - {file_path.name}")


if __name__ == "__main__":
    main()
