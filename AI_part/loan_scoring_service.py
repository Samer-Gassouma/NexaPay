"""Runtime scoring service for loan decisions (credit + affordability + fraud/AML)."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ds_clean import compute_recommendation, decision_engine, fraud_level_from_score, generate_reasons


def to_float(value: Any, default: float = 0.0) -> float:
    """Safely cast values to float."""
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def cin_to_internal_id(cin_number: str) -> int:
    """Create a stable internal numeric id from CIN string."""
    digest = hashlib.sha256(cin_number.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % 900_000_000 + 100_000_000


def installment_from_principal(principal: float, annual_rate: float, tenor_months: int) -> float:
    """Estimate monthly installment using annuity formula."""
    principal = max(float(principal), 0.0)
    tenor_months = max(int(tenor_months), 1)
    r = annual_rate / 12.0
    if principal <= 0:
        return 0.0
    if r <= 0:
        return principal / tenor_months
    return principal * (r / (1 - (1 + r) ** (-tenor_months)))


def nested_get(data: dict[str, Any], path: tuple[str, ...], default: Any = None) -> Any:
    """Read nested dictionaries safely."""
    current: Any = data
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


class LoanScoringService:
    """Loads trained artifacts and scores one or many loan applications."""

    def __init__(self, artifacts_dir: Path | str = "artifacts") -> None:
        self.artifacts_dir = Path(artifacts_dir)
        credit_bundle = joblib.load(self.artifacts_dir / "credit_model.joblib")
        fraud_bundle = joblib.load(self.artifacts_dir / "fraud_model.joblib")
        self.credit_model = credit_bundle["model"]
        self.credit_feature_columns: list[str] = credit_bundle["feature_columns"]
        self.fraud_model = fraud_bundle["model"]
        self.fraud_feature_columns: list[str] = fraud_bundle["feature_columns"]
        self.fraud_thresholds: dict[str, float] = fraud_bundle["thresholds"]

    def _base_defaults(self) -> dict[str, Any]:
        """Default values to keep scoring robust when optional fields are missing."""
        return {
            "NAME_TYPE_SUITE": "Unaccompanied",
            "NAME_INCOME_TYPE": "Working",
            "NAME_EDUCATION_TYPE": "Higher education",
            "NAME_FAMILY_STATUS": "Single / not married",
            "OCCUPATION_TYPE": "Core staff",
            "DAYS_BIRTH": -12000,
            "DAYS_EMPLOYED": -2000,
            "CNT_CHILDREN": 0,
            "CNT_FAM_MEMBERS": 1,
            "INST_COUNT": 0,
            "INST_UNIQUE_PREV": 0,
            "INST_LATE_RATIO": 0.0,
            "INST_SEVERE_LATE_RATIO": 0.0,
            "INST_UNDERPAID_RATIO": 0.0,
            "INST_OVERPAID_RATIO": 0.0,
            "INST_MISSED_RATIO": 0.0,
            "INST_PAYMENT_SPIKE_RATIO": 0.0,
            "INST_PAYMENT_RATIO_MEAN": 1.0,
            "INST_PAYMENT_RATIO_STD": 0.0,
            "INST_AMT_INSTALMENT_MEAN": 0.0,
            "PREV_APP_COUNT": 0,
            "PREV_REJECT_RATIO": 0.0,
            "PREV_APP_CREDIT_RATIO_MEAN": 1.0,
            "PREV_APP_CREDIT_GAP_MEAN": 0.0,
            "PREV_CNT_PAYMENT_MEAN": 0.0,
        }

    def _build_feature_row(self, payload: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, Any]]:
        """Convert API payload to one-row feature frame expected by trained model."""
        cin_number = str(payload.get("cin_number", "")).strip()
        if not cin_number:
            raise ValueError("cin_number is required.")
        sk_id_curr = cin_to_internal_id(cin_number)

        requested_amount = to_float(nested_get(payload, ("loan", "requested_amount"), 0.0), 0.0)
        requested_duration = int(to_float(nested_get(payload, ("loan", "requested_duration_months"), 36), 36))
        annual_rate = to_float(nested_get(payload, ("loan", "annual_interest_rate"), 0.12), 0.12)

        row = {col: np.nan for col in self.credit_feature_columns}
        row.update(self._base_defaults())

        # Existing engineered contract count columns are numeric; default to zero.
        for col in self.credit_feature_columns:
            if col.startswith("PREV_CONTRACT_"):
                row[col] = 0.0

        row["SK_ID_CURR"] = sk_id_curr
        row["AMT_CREDIT"] = to_float(nested_get(payload, ("financial", "amt_credit"), requested_amount), requested_amount)
        row["AMT_INCOME_TOTAL"] = to_float(nested_get(payload, ("financial", "amt_income_total"), 0.0), 0.0)
        row["AMT_GOODS_PRICE"] = to_float(nested_get(payload, ("financial", "amt_goods_price"), row["AMT_CREDIT"]), row["AMT_CREDIT"])

        annuity_from_input = nested_get(payload, ("financial", "amt_annuity"), None)
        if annuity_from_input is None:
            row["AMT_ANNUITY"] = installment_from_principal(row["AMT_CREDIT"], annual_rate, requested_duration)
        else:
            row["AMT_ANNUITY"] = to_float(annuity_from_input, 0.0)

        # Profile fields.
        row["NAME_TYPE_SUITE"] = nested_get(payload, ("profile", "name_type_suite"), row["NAME_TYPE_SUITE"])
        row["NAME_INCOME_TYPE"] = nested_get(payload, ("profile", "name_income_type"), row["NAME_INCOME_TYPE"])
        row["NAME_EDUCATION_TYPE"] = nested_get(payload, ("profile", "name_education_type"), row["NAME_EDUCATION_TYPE"])
        row["NAME_FAMILY_STATUS"] = nested_get(payload, ("profile", "name_family_status"), row["NAME_FAMILY_STATUS"])
        row["OCCUPATION_TYPE"] = nested_get(payload, ("profile", "occupation_type"), row["OCCUPATION_TYPE"])
        row["DAYS_BIRTH"] = to_float(nested_get(payload, ("profile", "days_birth"), row["DAYS_BIRTH"]), row["DAYS_BIRTH"])
        row["DAYS_EMPLOYED"] = to_float(nested_get(payload, ("profile", "days_employed"), row["DAYS_EMPLOYED"]), row["DAYS_EMPLOYED"])
        row["CNT_CHILDREN"] = to_float(nested_get(payload, ("profile", "cnt_children"), row["CNT_CHILDREN"]), row["CNT_CHILDREN"])
        row["CNT_FAM_MEMBERS"] = to_float(
            nested_get(payload, ("profile", "cnt_fam_members"), row["CNT_FAM_MEMBERS"]), row["CNT_FAM_MEMBERS"]
        )

        # External credit scores.
        row["EXT_SOURCE_1"] = nested_get(payload, ("external_scores", "ext_source_1"), np.nan)
        row["EXT_SOURCE_2"] = nested_get(payload, ("external_scores", "ext_source_2"), np.nan)
        row["EXT_SOURCE_3"] = nested_get(payload, ("external_scores", "ext_source_3"), np.nan)

        # Optional housing signals.
        for col, key in [
            ("APARTMENTS_AVG", "apartments_avg"),
            ("BASEMENTAREA_AVG", "basementarea_avg"),
            ("YEARS_BEGINEXPLUATATION_AVG", "years_beginexpluatation_avg"),
            ("YEARS_BUILD_AVG", "years_build_avg"),
            ("COMMONAREA_AVG", "commonarea_avg"),
            ("ELEVATORS_AVG", "elevators_avg"),
            ("ENTRANCES_AVG", "entrances_avg"),
        ]:
            row[col] = nested_get(payload, ("housing", key), row.get(col, np.nan))

        # Repayment behavior features.
        for col, key in [
            ("INST_COUNT", "inst_count"),
            ("INST_UNIQUE_PREV", "inst_unique_prev"),
            ("INST_LATE_RATIO", "inst_late_ratio"),
            ("INST_SEVERE_LATE_RATIO", "inst_severe_late_ratio"),
            ("INST_UNDERPAID_RATIO", "inst_underpaid_ratio"),
            ("INST_OVERPAID_RATIO", "inst_overpaid_ratio"),
            ("INST_MISSED_RATIO", "inst_missed_ratio"),
            ("INST_PAYMENT_SPIKE_RATIO", "inst_payment_spike_ratio"),
            ("INST_PAYMENT_RATIO_MEAN", "inst_payment_ratio_mean"),
            ("INST_PAYMENT_RATIO_STD", "inst_payment_ratio_std"),
            ("INST_AMT_INSTALMENT_MEAN", "inst_amt_instalment_mean"),
        ]:
            row[col] = to_float(nested_get(payload, ("repayment_behavior", key), row.get(col, np.nan)), row.get(col, np.nan))

        # Previous credit features.
        for col, key in [
            ("PREV_APP_COUNT", "prev_app_count"),
            ("PREV_REJECT_RATIO", "prev_reject_ratio"),
            ("PREV_APP_CREDIT_RATIO_MEAN", "prev_app_credit_ratio_mean"),
            ("PREV_APP_CREDIT_GAP_MEAN", "prev_app_credit_gap_mean"),
            ("PREV_CNT_PAYMENT_MEAN", "prev_cnt_payment_mean"),
        ]:
            row[col] = to_float(nested_get(payload, ("previous_credit", key), row.get(col, np.nan)), row.get(col, np.nan))

        # Derived features used in training.
        amt_income = to_float(row.get("AMT_INCOME_TOTAL"), 0.0)
        amt_credit = to_float(row.get("AMT_CREDIT"), 0.0)
        amt_annuity = to_float(row.get("AMT_ANNUITY"), 0.0)
        amt_goods = to_float(row.get("AMT_GOODS_PRICE"), 0.0)
        days_birth = to_float(row.get("DAYS_BIRTH"), np.nan)
        days_employed = to_float(row.get("DAYS_EMPLOYED"), np.nan)
        ext1 = to_float(row.get("EXT_SOURCE_1"), np.nan)
        ext2 = to_float(row.get("EXT_SOURCE_2"), np.nan)
        ext3 = to_float(row.get("EXT_SOURCE_3"), np.nan)
        cnt_children = max(to_float(row.get("CNT_CHILDREN"), 0.0), 0.0)
        cnt_family = max(to_float(row.get("CNT_FAM_MEMBERS"), 1.0), 1.0)

        row["AGE_YEARS"] = np.clip((-days_birth / 365.25), 18, 100) if not np.isnan(days_birth) else np.nan
        row["EMPLOYMENT_YEARS"] = max((-days_employed / 365.25), 0.0) if not np.isnan(days_employed) else np.nan
        row["EXT_SOURCE_MEAN"] = np.nanmean([ext1, ext2, ext3]) if not (np.isnan(ext1) and np.isnan(ext2) and np.isnan(ext3)) else np.nan
        row["CREDIT_INCOME_RATIO"] = amt_credit / (amt_income + 1e-6)
        row["ANNUITY_INCOME_RATIO"] = amt_annuity / (amt_income + 1e-6)
        row["GOODS_CREDIT_RATIO"] = amt_goods / (amt_credit + 1e-6)
        row["INCOME_PER_FAM_MEMBER"] = amt_income / (cnt_family + 1e-6)
        row["CHILD_TO_FAMILY_RATIO"] = cnt_children / (cnt_family + 1e-6)
        row["HAS_INSTALLMENT_HISTORY"] = 1 if to_float(row.get("INST_COUNT"), 0.0) > 0 else 0
        row["HAS_PREVIOUS_APPLICATIONS"] = 1 if to_float(row.get("PREV_APP_COUNT"), 0.0) > 0 else 0

        # Feature frame exactly aligned to trained model.
        frame = pd.DataFrame([row], columns=self.credit_feature_columns)
        meta = {
            "cin_number": cin_number,
            "sk_id_curr": sk_id_curr,
            "requested_amount": requested_amount,
            "requested_duration_months": requested_duration,
            "annual_interest_rate": annual_rate,
            "loan_reason": nested_get(payload, ("loan", "reason"), None),
        }
        return frame, meta

    def score(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Run full scoring pipeline for one case and return frontend-ready response."""
        x_case, meta = self._build_feature_row(payload)

        # Credit score.
        pd_value = float(self.credit_model.predict_proba(x_case)[:, 1][0])
        credit_score = int(np.clip(np.round((1.0 - pd_value) * 1000), 0, 1000))

        # Fraud/AML anomaly score.
        fraud_input = x_case[self.fraud_feature_columns].fillna(0.0)
        fraud_score = float(-self.fraud_model.score_samples(fraud_input)[0])
        fraud_level = fraud_level_from_score(fraud_score, self.fraud_thresholds["medium"], self.fraud_thresholds["high"])

        enriched = x_case.copy()
        enriched["probability_default"] = pd_value
        enriched["credit_score"] = credit_score
        enriched["fraud_anomaly_score"] = fraud_score
        enriched["fraud_risk_level"] = fraud_level
        enriched["aml_risk_level"] = fraud_level
        enriched["requested_amount_proxy"] = meta["requested_amount"]

        recommendation = compute_recommendation(enriched.iloc[0], annual_rate=meta["annual_interest_rate"])
        for key, value in recommendation.items():
            enriched[key] = float(value)

        decision = decision_engine(enriched.iloc[0])
        reasons = generate_reasons(enriched.iloc[0])

        requested_monthly = installment_from_principal(meta["requested_amount"], meta["annual_interest_rate"], meta["requested_duration_months"])
        requested_total = requested_monthly * meta["requested_duration_months"]

        recommended_amount = float(recommendation["max_recommended_loan"])
        recommended_duration = int(recommendation["recommended_duration_months"])
        recommended_monthly = installment_from_principal(recommended_amount, meta["annual_interest_rate"], recommended_duration)
        recommended_total = recommended_monthly * recommended_duration

        within_affordability = bool(
            requested_monthly <= recommendation["max_monthly_installment"] + 1e-9
            and meta["requested_amount"] <= recommendation["max_recommended_loan"] + 1e-9
        )

        return {
            "input_summary": {
                "cin_number": meta["cin_number"],
                "sk_id_curr": meta["sk_id_curr"],
                "loan_reason": meta["loan_reason"],
                "requested_loan_amount": round(meta["requested_amount"], 2),
                "requested_duration_months": meta["requested_duration_months"],
                "annual_interest_rate": round(meta["annual_interest_rate"], 6),
                "income_total": round(to_float(x_case.iloc[0]["AMT_INCOME_TOTAL"], 0.0), 2),
                "income_type": str(x_case.iloc[0]["NAME_INCOME_TYPE"]),
            },
            "result": {
                "credit_score": credit_score,
                "probability_default_pct": round(pd_value * 100, 4),
                "max_recommended_loan": round(recommended_amount, 2),
                "recommended_duration_months": recommended_duration,
                "max_monthly_installment": round(float(recommendation["max_monthly_installment"]), 2),
                "affordability_score": round(float(recommendation["affordability_score"]), 2),
                "fraud_anomaly_score": round(fraud_score, 6),
                "fraud_risk_level": fraud_level,
                "aml_risk_level": fraud_level,
                "decision": decision,
                "counter_offer_required": bool(meta["requested_amount"] > recommended_amount + 1e-9),
                "main_reasons": reasons,
                "repayment_estimates": {
                    "requested_loan": {
                        "amount": round(meta["requested_amount"], 2),
                        "duration_months": meta["requested_duration_months"],
                        "estimated_monthly_installment": round(requested_monthly, 2),
                        "estimated_total_repayment": round(requested_total, 2),
                        "within_affordability_limit": within_affordability,
                    },
                    "recommended_loan": {
                        "amount": round(recommended_amount, 2),
                        "duration_months": recommended_duration,
                        "estimated_monthly_installment": round(recommended_monthly, 2),
                        "estimated_total_repayment": round(recommended_total, 2),
                    },
                },
            },
        }
