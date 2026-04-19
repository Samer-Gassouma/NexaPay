"""Manual single-case tester for the trained loan scoring artifacts.

Usage:
    python manual_case_test.py
"""

from __future__ import annotations

import json
import hashlib
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ds_clean import compute_recommendation, decision_engine, fraud_level_from_score, generate_reasons


# Fill this dictionary manually for each test case.
# Amount fields are in the same unit as your training dataset.
CASE: dict[str, Any] = {
    "CIN_NUMBER": "12345678",
    "SK_ID_CURR": None,
    "requested_loan_amount": 35000.0,
    "AMT_INCOME_TOTAL": 48000.0,
    "AMT_CREDIT": 35000.0,
    "AMT_ANNUITY": 4200.0,
    "AMT_GOODS_PRICE": 33000.0,
    "CNT_CHILDREN": 1,
    "CNT_FAM_MEMBERS": 3,
    "NAME_INCOME_TYPE": "Working",
    "NAME_EDUCATION_TYPE": "Higher education",
    "NAME_FAMILY_STATUS": "Married",
    "NAME_TYPE_SUITE": "Family",
    "OCCUPATION_TYPE": "Core staff",
    "DAYS_BIRTH": -12000,          # around 33 years old
    "DAYS_EMPLOYED": -2200,        # around 6 years employed
    "EXT_SOURCE_1": 0.62,
    "EXT_SOURCE_2": 0.70,
    "EXT_SOURCE_3": 0.66,
    # Repayment behavior proxies (if unknown, keep defaults)
    "INST_COUNT": 18,
    "INST_UNIQUE_PREV": 2,
    "INST_LATE_RATIO": 0.05,
    "INST_SEVERE_LATE_RATIO": 0.00,
    "INST_UNDERPAID_RATIO": 0.03,
    "INST_MISSED_RATIO": 0.00,
    "INST_PAYMENT_SPIKE_RATIO": 0.00,
    "INST_PAYMENT_RATIO_MEAN": 1.01,
    "INST_PAYMENT_RATIO_STD": 0.12,
    "INST_AMT_INSTALMENT_MEAN": 250.0,
    "PREV_APP_COUNT": 2,
    "PREV_REJECT_RATIO": 0.00,
    "PREV_APP_CREDIT_RATIO_MEAN": 0.98,
    "PREV_APP_CREDIT_GAP_MEAN": -500.0,
    "PREV_CNT_PAYMENT_MEAN": 18.0,
}


def to_float(value: Any, default: float = 0.0) -> float:
    """Safe float cast."""
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def cin_to_internal_id(cin_number: str) -> int:
    """Create a stable numeric internal id from CIN string."""
    digest = hashlib.sha256(cin_number.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % 900_000_000 + 100_000_000


def installment_from_principal(principal: float, annual_rate: float, tenor_months: int) -> float:
    """Estimate monthly installment from principal using annuity formula."""
    principal = max(float(principal), 0.0)
    tenor_months = max(int(tenor_months), 1)
    r = annual_rate / 12.0
    if principal <= 0:
        return 0.0
    if r <= 0:
        return principal / tenor_months
    return principal * (r / (1 - (1 + r) ** (-tenor_months)))


def build_manual_row(feature_columns: list[str], case: dict[str, Any]) -> pd.DataFrame:
    """Build a one-row DataFrame with all model-required columns."""
    row = {col: np.nan for col in feature_columns}
    row.update(case)

    cin_number = str(case.get("CIN_NUMBER", "")).strip()
    if row.get("SK_ID_CURR") is None or pd.isna(row.get("SK_ID_CURR")):
        if cin_number:
            row["SK_ID_CURR"] = cin_to_internal_id(cin_number)
        else:
            row["SK_ID_CURR"] = 999001

    # Use user-requested amount for decision step; keep model input AMT_CREDIT if provided.
    row["requested_amount_proxy"] = to_float(case.get("requested_loan_amount", case.get("AMT_CREDIT", 0.0)))

    # Derived features expected by model.
    amt_income = to_float(row.get("AMT_INCOME_TOTAL"), 0.0)
    amt_credit = to_float(row.get("AMT_CREDIT"), 0.0)
    amt_annuity = to_float(row.get("AMT_ANNUITY"), 0.0)
    amt_goods = to_float(row.get("AMT_GOODS_PRICE"), 0.0)
    days_birth = to_float(row.get("DAYS_BIRTH"), np.nan)
    days_employed = to_float(row.get("DAYS_EMPLOYED"), np.nan)
    ext1 = to_float(row.get("EXT_SOURCE_1"), np.nan)
    ext2 = to_float(row.get("EXT_SOURCE_2"), np.nan)
    ext3 = to_float(row.get("EXT_SOURCE_3"), np.nan)
    cnt_child = to_float(row.get("CNT_CHILDREN"), 0.0)
    cnt_fam = max(to_float(row.get("CNT_FAM_MEMBERS"), 1.0), 1.0)

    if "AGE_YEARS" in row:
        row["AGE_YEARS"] = np.clip((-days_birth / 365.25), 18, 100) if not np.isnan(days_birth) else np.nan
    if "EMPLOYMENT_YEARS" in row:
        row["EMPLOYMENT_YEARS"] = max((-days_employed / 365.25), 0.0) if not np.isnan(days_employed) else np.nan
    if "EXT_SOURCE_MEAN" in row:
        row["EXT_SOURCE_MEAN"] = np.nanmean([ext1, ext2, ext3]) if not (np.isnan(ext1) and np.isnan(ext2) and np.isnan(ext3)) else np.nan
    if "CREDIT_INCOME_RATIO" in row:
        row["CREDIT_INCOME_RATIO"] = amt_credit / (amt_income + 1e-6)
    if "ANNUITY_INCOME_RATIO" in row:
        row["ANNUITY_INCOME_RATIO"] = amt_annuity / (amt_income + 1e-6)
    if "GOODS_CREDIT_RATIO" in row:
        row["GOODS_CREDIT_RATIO"] = amt_goods / (amt_credit + 1e-6)
    if "INCOME_PER_FAM_MEMBER" in row:
        row["INCOME_PER_FAM_MEMBER"] = amt_income / (cnt_fam + 1e-6)
    if "CHILD_TO_FAMILY_RATIO" in row:
        row["CHILD_TO_FAMILY_RATIO"] = cnt_child / (cnt_fam + 1e-6)
    if "HAS_INSTALLMENT_HISTORY" in row:
        row["HAS_INSTALLMENT_HISTORY"] = 1 if to_float(row.get("INST_COUNT"), 0.0) > 0 else 0
    if "HAS_PREVIOUS_APPLICATIONS" in row:
        row["HAS_PREVIOUS_APPLICATIONS"] = 1 if to_float(row.get("PREV_APP_COUNT"), 0.0) > 0 else 0

    return pd.DataFrame([row], columns=feature_columns)


def main() -> None:
    """Load artifacts, score one manual case, and print the result."""
    credit_bundle = joblib.load("artifacts/credit_model.joblib")
    fraud_bundle = joblib.load("artifacts/fraud_model.joblib")

    feature_columns = credit_bundle["feature_columns"]
    credit_model = credit_bundle["model"]
    fraud_model = fraud_bundle["model"]
    fraud_features = fraud_bundle["feature_columns"]
    fraud_thresholds = fraud_bundle["thresholds"]

    x_case = build_manual_row(feature_columns, CASE)
    pd_value = float(credit_model.predict_proba(x_case)[:, 1][0])
    credit_score = int(np.clip(np.round((1.0 - pd_value) * 1000), 0, 1000))

    fraud_input = x_case[fraud_features].fillna(0.0)
    fraud_score = float(-fraud_model.score_samples(fraud_input)[0])
    fraud_level = fraud_level_from_score(fraud_score, fraud_thresholds["medium"], fraud_thresholds["high"])

    enriched = x_case.copy()
    enriched["probability_default"] = pd_value
    enriched["credit_score"] = credit_score
    enriched["fraud_anomaly_score"] = fraud_score
    enriched["fraud_risk_level"] = fraud_level
    enriched["aml_risk_level"] = fraud_level
    enriched["requested_amount_proxy"] = to_float(CASE.get("requested_loan_amount", CASE.get("AMT_CREDIT", 0.0)))

    rec = compute_recommendation(enriched.iloc[0])
    for k, v in rec.items():
        enriched[k] = float(v)

    annual_rate = to_float(CASE.get("annual_interest_rate", 0.12), 0.12)
    requested_amount = to_float(CASE.get("requested_loan_amount", CASE.get("AMT_CREDIT", 0.0)), 0.0)
    requested_tenor = int(to_float(CASE.get("requested_duration_months", rec["recommended_duration_months"]), rec["recommended_duration_months"]))
    requested_monthly = installment_from_principal(requested_amount, annual_rate, requested_tenor)
    requested_total = requested_monthly * requested_tenor

    recommended_amount = float(rec["max_recommended_loan"])
    recommended_tenor = int(rec["recommended_duration_months"])
    recommended_monthly = installment_from_principal(recommended_amount, annual_rate, recommended_tenor)
    recommended_total = recommended_monthly * recommended_tenor

    decision = decision_engine(enriched.iloc[0])
    reasons = generate_reasons(enriched.iloc[0])

    output = {
        "input_summary": {
            "CIN_NUMBER": str(CASE.get("CIN_NUMBER", "")),
            "SK_ID_CURR": int(to_float(enriched.iloc[0].get("SK_ID_CURR"), 0)),
            "requested_loan_amount": to_float(CASE.get("requested_loan_amount"), 0.0),
            "income_total": to_float(CASE.get("AMT_INCOME_TOTAL"), 0.0),
            "income_type": str(CASE.get("NAME_INCOME_TYPE", "")),
        },
        "result": {
            "credit_score": credit_score,
            "probability_default": round(pd_value * 100, 2),
            "max_recommended_loan": round(rec["max_recommended_loan"], 2),
            "recommended_duration_months": int(rec["recommended_duration_months"]),
            "max_monthly_installment": round(rec["max_monthly_installment"], 2),
            "fraud_risk_level": fraud_level,
            "aml_risk_level": fraud_level,
            "decision": decision,
            "main_reasons": reasons,
            "repayment_estimates": {
                "assumed_annual_interest_rate": annual_rate,
                "requested_loan": {
                    "amount": requested_amount,
                    "duration_months": requested_tenor,
                    "estimated_monthly_installment": round(requested_monthly, 2),
                    "estimated_total_repayment": round(requested_total, 2),
                    "within_affordability_limit": bool(requested_monthly <= rec["max_monthly_installment"] + 1e-9),
                },
                "recommended_loan": {
                    "amount": round(recommended_amount, 2),
                    "duration_months": recommended_tenor,
                    "estimated_monthly_installment": round(recommended_monthly, 2),
                    "estimated_total_repayment": round(recommended_total, 2),
                },
            },
        },
    }
    print(json.dumps(output, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
