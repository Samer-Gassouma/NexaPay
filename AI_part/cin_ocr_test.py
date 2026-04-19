"""CLI tester for StructOCR Tunisian CIN extraction.

Usage:
    # Preferred: set env var once
    #   PowerShell: $env:STRUCTOCR_API_KEY="YOUR_KEY"
    python cin_ocr_test.py --front CIN_front.jpg --back CIN_back.jpg

    # Optional inline key for quick local test
    python cin_ocr_test.py --front CIN_front.jpg --back CIN_back.jpg --api-key YOUR_KEY --raw
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from structocr_cin_service import StructOcrNationalIdService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run StructOCR CIN extraction on front + back images.")
    parser.add_argument("--front", type=Path, required=True, help="Path to CIN front image")
    parser.add_argument("--back", type=Path, required=True, help="Path to CIN back image")
    parser.add_argument("--api-key", type=str, default=None, help="Optional StructOCR API key override")
    parser.add_argument("--raw", action="store_true", help="Include raw provider response")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.front.exists():
        raise FileNotFoundError(f"Front image not found: {args.front}")
    if not args.back.exists():
        raise FileNotFoundError(f"Back image not found: {args.back}")

    service = StructOcrNationalIdService(api_key=args.api_key)
    if not service.configured:
        raise RuntimeError("StructOCR key not configured. Set STRUCTOCR_API_KEY or pass --api-key.")

    with args.front.open("rb") as f_front, args.back.open("rb") as f_back:
        result = service.extract_two_sides_from_image_bytes(
            front_image_bytes=f_front.read(),
            back_image_bytes=f_back.read(),
            front_mime_type="image/jpeg",
            back_mime_type="image/jpeg",
            include_raw_response=args.raw,
        )
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
