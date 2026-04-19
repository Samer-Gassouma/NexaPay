import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_LOAN_SCORE_ENDPOINT = "http://20.199.106.44:8000/api/loan/score";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { success: false, error: "A valid JSON payload is required" },
      { status: 400 },
    );
  }

  const endpoint = process.env.LOAN_SCORE_ENDPOINT || DEFAULT_LOAN_SCORE_ENDPOINT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await response.text();

    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { success: false, error: "Invalid loan score response", raw: rawText };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Loan scoring request failed",
          status: response.status,
          provider_response: data,
        },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    const message =
      error?.name === "AbortError" ? "Loan scoring request timed out" : "Loan scoring service unavailable";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
