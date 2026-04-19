from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from loan_scoring_service import LoanScoringService
from structocr_cin_service import StructOcrApiError, StructOcrNationalIdService


class LoanInput(BaseModel):
    requested_amount: float = Field(..., gt=0)
    requested_duration_months: int = Field(default=36, ge=1, le=120)
    annual_interest_rate: float = Field(default=0.12, ge=0.0, le=1.0)
    reason: str | None = None


class FinancialInput(BaseModel):
    amt_income_total: float = Field(..., ge=0)
    amt_credit: float | None = Field(default=None, ge=0)
    amt_annuity: float | None = Field(default=None, ge=0)
    amt_goods_price: float | None = Field(default=None, ge=0)


class ProfileInput(BaseModel):
    name_type_suite: str = "Unaccompanied"
    name_income_type: str = "Working"
    name_education_type: str = "Higher education"
    name_family_status: str = "Single / not married"
    occupation_type: str = "Core staff"
    days_birth: int = -12000
    days_employed: int = -2000
    cnt_children: int = Field(default=0, ge=0)
    cnt_fam_members: int = Field(default=1, ge=1)


class ExternalScoresInput(BaseModel):
    ext_source_1: float | None = None
    ext_source_2: float | None = None
    ext_source_3: float | None = None


class RepaymentBehaviorInput(BaseModel):
    inst_count: int = Field(default=0, ge=0)
    inst_unique_prev: int = Field(default=0, ge=0)
    inst_late_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    inst_severe_late_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    inst_underpaid_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    inst_overpaid_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    inst_missed_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    inst_payment_spike_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    inst_payment_ratio_mean: float = Field(default=1.0, ge=0.0)
    inst_payment_ratio_std: float = Field(default=0.0, ge=0.0)
    inst_amt_instalment_mean: float = Field(default=0.0, ge=0.0)


class PreviousCreditInput(BaseModel):
    prev_app_count: int = Field(default=0, ge=0)
    prev_reject_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    prev_app_credit_ratio_mean: float = Field(default=1.0, ge=0.0)
    prev_app_credit_gap_mean: float = 0.0
    prev_cnt_payment_mean: float = Field(default=0.0, ge=0.0)


class HousingInput(BaseModel):
    apartments_avg: float | None = None
    basementarea_avg: float | None = None
    years_beginexpluatation_avg: float | None = None
    years_build_avg: float | None = None
    commonarea_avg: float | None = None
    elevators_avg: float | None = None
    entrances_avg: float | None = None


class LoanScoreRequest(BaseModel):
    cin_number: str = Field(..., min_length=4, max_length=64)
    loan: LoanInput
    financial: FinancialInput
    profile: ProfileInput = Field(default_factory=ProfileInput)
    repayment_behavior: RepaymentBehaviorInput = Field(default_factory=RepaymentBehaviorInput)
    previous_credit: PreviousCreditInput = Field(default_factory=PreviousCreditInput)
    external_scores: ExternalScoresInput = Field(default_factory=ExternalScoresInput)
    housing: HousingInput = Field(default_factory=HousingInput)

    @field_validator("cin_number")
    @classmethod
    def normalize_cin(cls, value: str) -> str:
        return value.strip()


class BatchLoanScoreRequest(BaseModel):
    items: list[LoanScoreRequest] = Field(..., min_length=1, max_length=100)


class CinOcrBase64Request(BaseModel):
    front_image_base64: str = Field(..., min_length=64)
    back_image_base64: str = Field(..., min_length=64)
    include_raw_response: bool = False


def example_payload() -> dict[str, Any]:
    """Return a sample request payload for frontend integration."""
    return {
        "cin_number": "12345678",
        "loan": {
            "requested_amount": 35000,
            "requested_duration_months": 36,
            "annual_interest_rate": 0.12,
            "reason": "Home improvement",
        },
        "financial": {
            "amt_income_total": 48000,
            "amt_credit": 35000,
            "amt_annuity": 4200,
            "amt_goods_price": 33000,
        },
        "profile": {
            "name_type_suite": "Family",
            "name_income_type": "Working",
            "name_education_type": "Higher education",
            "name_family_status": "Married",
            "occupation_type": "Core staff",
            "days_birth": -12000,
            "days_employed": -2200,
            "cnt_children": 1,
            "cnt_fam_members": 3,
        },
        "external_scores": {"ext_source_1": 0.62, "ext_source_2": 0.70, "ext_source_3": 0.66},
        "repayment_behavior": {
            "inst_count": 18,
            "inst_unique_prev": 2,
            "inst_late_ratio": 0.05,
            "inst_severe_late_ratio": 0.0,
            "inst_underpaid_ratio": 0.03,
            "inst_missed_ratio": 0.0,
            "inst_payment_spike_ratio": 0.0,
            "inst_payment_ratio_mean": 1.01,
            "inst_payment_ratio_std": 0.12,
            "inst_amt_instalment_mean": 250,
        },
        "previous_credit": {
            "prev_app_count": 2,
            "prev_reject_ratio": 0.0,
            "prev_app_credit_ratio_mean": 0.98,
            "prev_app_credit_gap_mean": -500,
            "prev_cnt_payment_mean": 18,
        },
    }


app = FastAPI(
    title="Loan Scoring API",
    version="1.0.0",
    description="Credit scoring + affordability recommendation + fraud/AML anomaly API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

service: LoanScoringService | None = None
cin_ocr_service: StructOcrNationalIdService | None = None


@app.on_event("startup")
def load_service() -> None:
    """Load model artifacts once when API starts."""
    global service, cin_ocr_service
    service = LoanScoringService(artifacts_dir=Path("artifacts"))
    cin_ocr_service = StructOcrNationalIdService()


@app.get("/health")
def health() -> dict[str, Any]:
    """Basic health endpoint for deployment checks."""
    return {
        "status": "ok",
        "models_loaded": service is not None,
        "cin_ocr_loaded": cin_ocr_service is not None,
        "structocr_configured": bool(cin_ocr_service and cin_ocr_service.configured),
        "artifacts_dir": str(Path("artifacts").resolve()),
    }


@app.get("/api/loan/score/example")
def score_example_payload() -> dict[str, Any]:
    """Sample request body for frontend/backend developers."""
    return example_payload()


@app.post("/api/loan/score")
def score_loan(request: LoanScoreRequest) -> dict[str, Any]:
    """Score one application and return decision + explanations."""
    if service is None:
        raise HTTPException(status_code=503, detail="Scoring service not initialized.")
    try:
        return service.score(request.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Scoring failed: {exc}") from exc


@app.post("/api/loan/score/batch")
def score_loan_batch(request: BatchLoanScoreRequest) -> dict[str, Any]:
    """Score many applications in one call."""
    if service is None:
        raise HTTPException(status_code=503, detail="Scoring service not initialized.")
    outputs: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for idx, item in enumerate(request.items):
        try:
            outputs.append(service.score(item.model_dump()))
        except Exception as exc:
            errors.append({"index": idx, "cin_number": item.cin_number, "error": str(exc)})
    return {
        "total": len(request.items),
        "scored": len(outputs),
        "failed": len(errors),
        "results": outputs,
        "errors": errors,
    }


@app.post("/api/kyc/cin/ocr")
async def extract_cin_ocr(
    front_file: UploadFile = File(...),
    back_file: UploadFile = File(...),
    include_raw_response: bool = False,
) -> dict[str, Any]:
    """Extract Tunisian CIN fields via StructOCR using both front and back images."""
    if cin_ocr_service is None:
        raise HTTPException(status_code=503, detail="CIN OCR service not initialized.")
    if not cin_ocr_service.configured:
        raise HTTPException(status_code=503, detail="StructOCR API key is not configured (set STRUCTOCR_API_KEY).")
    try:
        front_image_bytes = await front_file.read()
        back_image_bytes = await back_file.read()
        if not front_image_bytes:
            raise HTTPException(status_code=400, detail="front_file is empty.")
        if not back_image_bytes:
            raise HTTPException(status_code=400, detail="back_file is empty.")
        return cin_ocr_service.extract_two_sides_from_image_bytes(
            front_image_bytes=front_image_bytes,
            back_image_bytes=back_image_bytes,
            front_mime_type=front_file.content_type,
            back_mime_type=back_file.content_type,
            include_raw_response=include_raw_response,
        )
    except HTTPException:
        raise
    except StructOcrApiError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"provider": "structocr", "error": exc.payload},
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"StructOCR CIN extraction failed: {exc}") from exc


@app.post("/api/kyc/cin/ocr/base64")
def extract_cin_ocr_base64(request: CinOcrBase64Request) -> dict[str, Any]:
    """Extract Tunisian CIN fields via StructOCR from front/back base64 payload."""
    if cin_ocr_service is None:
        raise HTTPException(status_code=503, detail="CIN OCR service not initialized.")
    if not cin_ocr_service.configured:
        raise HTTPException(status_code=503, detail="StructOCR API key is not configured (set STRUCTOCR_API_KEY).")
    try:
        return cin_ocr_service.extract_two_sides_from_base64(
            front_image_base64=request.front_image_base64,
            back_image_base64=request.back_image_base64,
            include_raw_response=request.include_raw_response,
        )
    except StructOcrApiError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"provider": "structocr", "error": exc.payload},
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"StructOCR CIN extraction failed: {exc}") from exc
