"""StructOCR-based Tunisian CIN extraction service (ready-to-use, no fine-tuning)."""

from __future__ import annotations

import base64
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


MAX_FILE_BYTES = int(4.5 * 1024 * 1024)  # StructOCR limit from docs


@dataclass
class StructOcrApiError(Exception):
    """Provider error wrapper with status and payload."""

    status_code: int
    payload: dict[str, Any]

    def __str__(self) -> str:
        code = self.payload.get("code") or self.payload.get("error") or "STRUCTOCR_ERROR"
        message = self.payload.get("message") or "StructOCR request failed."
        return f"{code}: {message}"


def normalize_mime_type(mime_type: str | None) -> str:
    """Keep only allowed MIME types; fallback to JPEG."""
    if not mime_type:
        return "image/jpeg"
    mime = mime_type.lower().strip()
    allowed = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    if mime in allowed:
        if mime == "image/jpg":
            return "image/jpeg"
        return mime
    return "image/jpeg"


def digits_only(value: str | None) -> str | None:
    """Extract digits from value if present."""
    if not value:
        return None
    d = re.sub(r"\D+", "", value)
    return d or None


class StructOcrNationalIdService:
    """Server-side client for StructOCR National ID endpoint."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = "https://api.structocr.com/v1",
        timeout_seconds: float = 30.0,
        max_retries: int = 2,
    ) -> None:
        self._load_dotenv_if_present()
        self.api_key = (api_key or os.getenv("STRUCTOCR_API_KEY", "")).strip()
        self.base_url = base_url.rstrip("/")
        self.timeout = httpx.Timeout(timeout_seconds)
        self.max_retries = max(0, int(max_retries))

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _load_dotenv_if_present(self) -> None:
        """Load .env key-values into process env when present (no external deps)."""
        candidates = [
            Path.cwd() / ".env",
            Path(__file__).resolve().parent / ".env",
        ]
        env_path = next((p for p in candidates if p.exists()), None)
        if env_path is None:
            return

        try:
            for raw in env_path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if key.lower().startswith("$env:"):
                    key = key[5:].strip()
                value = value.strip().strip("'").strip('"')
                if key and key not in os.environ:
                    os.environ[key] = value
        except Exception:
            # Ignore dotenv parsing errors; env vars can still be provided by OS.
            return

    def _headers(self) -> dict[str, str]:
        if not self.configured:
            raise ValueError("STRUCTOCR_API_KEY is not configured.")
        return {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
        }

    def _decode_base64_payload(self, image_base64: str) -> tuple[str, bytes]:
        """Normalize data URI/raw base64 and return (data_uri, decoded_bytes)."""
        payload = image_base64.strip()
        if not payload:
            raise ValueError("image_base64 is empty.")

        if payload.lower().startswith("data:") and "," in payload:
            header, b64 = payload.split(",", 1)
            mime = "image/jpeg"
            match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64$", header.strip(), flags=re.IGNORECASE)
            if match:
                mime = normalize_mime_type(match.group(1))
            try:
                decoded = base64.b64decode(b64, validate=True)
            except Exception as exc:
                raise ValueError("Invalid base64 image payload.") from exc
            data_uri = f"data:{mime};base64,{base64.b64encode(decoded).decode('ascii')}"
            return data_uri, decoded

        # Raw base64 case
        try:
            decoded = base64.b64decode(payload, validate=True)
        except Exception as exc:
            raise ValueError("Invalid base64 image payload.") from exc
        data_uri = f"data:image/jpeg;base64,{base64.b64encode(decoded).decode('ascii')}"
        return data_uri, decoded

    def _data_uri_from_bytes(self, image_bytes: bytes, mime_type: str | None) -> str:
        mime = normalize_mime_type(mime_type)
        encoded = base64.b64encode(image_bytes).decode("ascii")
        return f"data:{mime};base64,{encoded}"

    def _check_size(self, image_bytes: bytes) -> None:
        if len(image_bytes) > MAX_FILE_BYTES:
            raise ValueError(f"Image too large ({len(image_bytes)} bytes). Max allowed is {MAX_FILE_BYTES} bytes.")

    def _post_national_id(self, image_data_uri: str) -> dict[str, Any]:
        url = f"{self.base_url}/national-id"
        payload = {"img": image_data_uri}
        last_error: Exception | None = None

        with httpx.Client(timeout=self.timeout) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    response = client.post(url, headers=self._headers(), json=payload)
                except httpx.RequestError as exc:
                    last_error = exc
                    if attempt < self.max_retries:
                        time.sleep(0.5 * (attempt + 1))
                        continue
                    raise StructOcrApiError(
                        status_code=503,
                        payload={"error": "NETWORK_ERROR", "message": f"Unable to reach StructOCR: {exc}"},
                    ) from exc

                content_type = response.headers.get("content-type", "").lower()
                if "application/json" in content_type:
                    try:
                        body = response.json()
                    except Exception:
                        body = {"message": response.text}
                else:
                    body = {"message": response.text}

                # Retry on temporary provider overload.
                if response.status_code in {429, 503} and attempt < self.max_retries:
                    time.sleep(0.8 * (attempt + 1))
                    continue

                if response.status_code != 200:
                    raise StructOcrApiError(status_code=response.status_code, payload=body)

                if body.get("success") is False:
                    raise StructOcrApiError(status_code=422, payload=body)
                return body

        # Defensive fallback (normally unreachable due return/raise above).
        raise StructOcrApiError(status_code=500, payload={"error": "UNKNOWN", "message": str(last_error or "Unknown error")})

    def _normalize_output(self, provider_response: dict[str, Any], runtime_ms: int, include_raw_response: bool) -> dict[str, Any]:
        data = provider_response.get("data") or {}

        document_number = data.get("document_number")
        personal_number = data.get("personal_number")
        cin_candidate = personal_number or document_number
        cin_digits = digits_only(cin_candidate)
        cin_number = cin_digits if cin_digits and len(cin_digits) >= 6 else cin_candidate

        fields = {
            "type": data.get("type", "national_id"),
            "country_code": data.get("country_code"),
            "nationality": data.get("nationality"),
            "document_number": document_number,
            "personal_number": personal_number,
            "card_series": data.get("card_series"),
            "tramite_number": data.get("tramite_number"),
            "ejemplar": data.get("ejemplar"),
            "cin_number": cin_number,
            "surname": data.get("surname"),
            "given_names": data.get("given_names"),
            "sex": data.get("sex"),
            "date_of_birth": data.get("date_of_birth"),
            "place_of_birth": data.get("place_of_birth"),
            "address": data.get("address"),
            "date_of_issue": data.get("date_of_issue"),
            "date_of_expiry": data.get("date_of_expiry"),
            "issuing_authority": data.get("issuing_authority"),
        }

        required_for_kyc = ["cin_number", "surname", "given_names", "date_of_birth"]
        filled = sum(1 for k in required_for_kyc if fields.get(k))
        extraction_quality = round(filled / len(required_for_kyc), 4)

        warnings: list[str] = []
        cc = (fields.get("country_code") or "").upper()
        if cc and cc != "TUN":
            warnings.append(f"country_code is '{cc}', not 'TUN'. Check document type/country routing.")
        if not fields.get("cin_number"):
            warnings.append("cin_number not found in provider response.")
        if extraction_quality < 0.75:
            warnings.append("Low extraction completeness. Consider manual verification.")

        response: dict[str, Any] = {
            "provider": "structocr",
            "provider_endpoint": "/v1/national-id",
            "success": bool(provider_response.get("success", True)),
            "runtime_ms": runtime_ms,
            "fields": fields,
            "extraction_quality": extraction_quality,
            "warnings": warnings,
        }
        if include_raw_response:
            response["provider_response"] = provider_response
        return response

    def _merge_side_outputs(
        self,
        front_result: dict[str, Any],
        back_result: dict[str, Any],
        include_raw_response: bool,
    ) -> dict[str, Any]:
        """Merge front/back extraction outputs into a single KYC payload."""
        front_fields = front_result.get("fields", {})
        back_fields = back_result.get("fields", {})

        prefer_back = {
            "address",
            "place_of_birth",
            "date_of_issue",
            "date_of_expiry",
            "issuing_authority",
            "tramite_number",
            "ejemplar",
            "card_series",
        }
        merged_fields: dict[str, Any] = {}
        all_keys = set(front_fields.keys()) | set(back_fields.keys())
        for key in all_keys:
            if key in prefer_back:
                merged_fields[key] = back_fields.get(key) or front_fields.get(key)
            else:
                merged_fields[key] = front_fields.get(key) or back_fields.get(key)

        # Ensure CIN fallback with digit normalization.
        cin_candidate = merged_fields.get("cin_number") or merged_fields.get("personal_number") or merged_fields.get("document_number")
        cin_digits = digits_only(cin_candidate) if isinstance(cin_candidate, str) else None
        if cin_digits and len(cin_digits) >= 6:
            merged_fields["cin_number"] = cin_digits

        required_for_kyc = ["cin_number", "surname", "given_names", "date_of_birth", "address"]
        filled = sum(1 for k in required_for_kyc if merged_fields.get(k))
        extraction_quality = round(filled / len(required_for_kyc), 4)

        warnings: list[str] = []
        if not merged_fields.get("cin_number"):
            warnings.append("cin_number not found after merging front/back sides.")
        if not merged_fields.get("address"):
            warnings.append("address not found after merging front/back sides.")
        if extraction_quality < 0.8:
            warnings.append("Low extraction completeness across both sides; consider manual verification.")

        response: dict[str, Any] = {
            "provider": "structocr",
            "provider_endpoint": "/v1/national-id",
            "success": bool(front_result.get("success") and back_result.get("success")),
            "runtime_ms": int(front_result.get("runtime_ms", 0)) + int(back_result.get("runtime_ms", 0)),
            "fields": merged_fields,
            "extraction_quality": extraction_quality,
            "warnings": warnings,
            "sides": {
                "front": {
                    "runtime_ms": front_result.get("runtime_ms"),
                    "extraction_quality": front_result.get("extraction_quality"),
                    "warnings": front_result.get("warnings", []),
                },
                "back": {
                    "runtime_ms": back_result.get("runtime_ms"),
                    "extraction_quality": back_result.get("extraction_quality"),
                    "warnings": back_result.get("warnings", []),
                },
            },
        }
        if include_raw_response:
            response["provider_response"] = {
                "front": front_result.get("provider_response", front_result),
                "back": back_result.get("provider_response", back_result),
            }
        return response

    def extract_from_image_bytes(
        self,
        image_bytes: bytes,
        mime_type: str | None = None,
        include_raw_response: bool = False,
    ) -> dict[str, Any]:
        """Extract structured fields from an image file bytes."""
        if not image_bytes:
            raise ValueError("Empty image bytes.")
        self._check_size(image_bytes)
        data_uri = self._data_uri_from_bytes(image_bytes=image_bytes, mime_type=mime_type)
        start = time.time()
        provider_response = self._post_national_id(data_uri)
        runtime_ms = int((time.time() - start) * 1000)
        return self._normalize_output(provider_response, runtime_ms, include_raw_response=include_raw_response)

    def extract_from_base64(
        self,
        image_base64: str,
        include_raw_response: bool = False,
    ) -> dict[str, Any]:
        """Extract structured fields from data URI or raw base64 image string."""
        data_uri, decoded = self._decode_base64_payload(image_base64)
        self._check_size(decoded)
        start = time.time()
        provider_response = self._post_national_id(data_uri)
        runtime_ms = int((time.time() - start) * 1000)
        return self._normalize_output(provider_response, runtime_ms, include_raw_response=include_raw_response)

    def extract_two_sides_from_image_bytes(
        self,
        front_image_bytes: bytes,
        back_image_bytes: bytes,
        front_mime_type: str | None = None,
        back_mime_type: str | None = None,
        include_raw_response: bool = False,
    ) -> dict[str, Any]:
        """Extract and merge fields from front and back CIN images."""
        front = self.extract_from_image_bytes(
            image_bytes=front_image_bytes,
            mime_type=front_mime_type,
            include_raw_response=include_raw_response,
        )
        back = self.extract_from_image_bytes(
            image_bytes=back_image_bytes,
            mime_type=back_mime_type,
            include_raw_response=include_raw_response,
        )
        return self._merge_side_outputs(front, back, include_raw_response=include_raw_response)

    def extract_two_sides_from_base64(
        self,
        front_image_base64: str,
        back_image_base64: str,
        include_raw_response: bool = False,
    ) -> dict[str, Any]:
        """Extract and merge fields from front/back base64 CIN images."""
        front = self.extract_from_base64(front_image_base64, include_raw_response=include_raw_response)
        back = self.extract_from_base64(back_image_base64, include_raw_response=include_raw_response)
        return self._merge_side_outputs(front, back, include_raw_response=include_raw_response)
