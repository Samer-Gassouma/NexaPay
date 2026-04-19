import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_OCR_ENDPOINT = "http://20.199.106.44:8000/api/kyc/cin/ocr";

export async function POST(request: Request) {
  const formData = await request.formData();
  const frontFile = formData.get("front_file");
  const backFile = formData.get("back_file");

  if (!(frontFile instanceof File) || !(backFile instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Both front_file and back_file are required" },
      { status: 400 },
    );
  }

  const upstreamBody = new FormData();
  upstreamBody.append("front_file", frontFile, frontFile.name || "cin_front.jpg");
  upstreamBody.append("back_file", backFile, backFile.name || "cin_back.jpg");

  const endpoint = process.env.KYC_OCR_ENDPOINT || DEFAULT_OCR_ENDPOINT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: upstreamBody,
      signal: controller.signal,
    });

    const rawText = await response.text();

    let payload: any;
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { success: false, error: "Invalid OCR response", raw: rawText };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.error || "OCR request failed",
          status: response.status,
          provider_response: payload,
        },
        { status: response.status },
      );
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error: any) {
    const message = error?.name === "AbortError" ? "OCR request timed out" : "OCR service unavailable";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
