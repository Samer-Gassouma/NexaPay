"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

type RegisterResult = {
  success: boolean;
  chain_address: string;
  account: {
    account_number: string;
    rib: string;
    iban: string;
    bic: string;
    currency: string;
  };
  card: {
    card_number: string;
    card_holder: string;
    expiry: string;
    cvv: string;
    type: string;
  };
  private_key: string;
  message: string;
  phone_hint?: string;
  dev_otp?: string;
  fallback_available?: boolean;
};

type RegistrationDraft = {
  full_name: string;
  cin: string;
  date_of_birth: string;
  phone: string;
  password: string;
  email: string;
  address_line: string;
  city: string;
  governorate: string;
};

type CinOcrFields = {
  cin_number?: string;
  document_number?: string;
  address?: string;
  date_of_birth?: string;
  given_names?: string;
  surname?: string;
  nationality?: string;
  country_code?: string;
  date_of_issue?: string;
};

type CinOcrResponse = {
  success: boolean;
  provider?: string;
  runtime_ms?: number;
  extraction_quality?: number;
  fields?: CinOcrFields;
  warnings?: string[];
};

const initialDraft: RegistrationDraft = {
  full_name: "",
  cin: "",
  date_of_birth: "",
  phone: "",
  password: "",
  email: "",
  address_line: "",
  city: "",
  governorate: "",
};

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  const [otpRequested, setOtpRequested] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [registeredCin, setRegisteredCin] = useState("");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<RegistrationDraft>(initialDraft);

  const [cinFrontFile, setCinFrontFile] = useState<File | null>(null);
  const [cinBackFile, setCinBackFile] = useState<File | null>(null);
  const [cinFrontPreview, setCinFrontPreview] = useState<string | null>(null);
  const [cinBackPreview, setCinBackPreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);

  useEffect(() => {
    // If already authenticated, skip registration and go to dashboard.
    try {
      const savedToken = localStorage.getItem("nexapay_token") ?? "";
      const savedAddress = localStorage.getItem("nexapay_address") ?? "";
      if (savedToken && savedAddress) {
        router.replace("/dashboard");
      }
    } catch {}

    return () => {
      if (cinFrontPreview) URL.revokeObjectURL(cinFrontPreview);
      if (cinBackPreview) URL.revokeObjectURL(cinBackPreview);
    };
  }, [cinFrontPreview, cinBackPreview, router]);

  function setPreviewImage(
    file: File | null,
    setFile: (value: File | null) => void,
    setPreview: (value: string | null) => void,
    currentPreview: string | null,
  ) {
    if (currentPreview) URL.revokeObjectURL(currentPreview);
    setFile(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function normalizeDate(raw?: string): string {
    if (!raw) return "";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function normalizeWhitespace(value?: string): string {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function buildFullName(fields: CinOcrFields): string {
    return normalizeWhitespace([fields.given_names, fields.surname].filter(Boolean).join(" "));
  }

  function splitAddress(address: string) {
    const lines = address
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return {
        addressLine: "",
        city: "",
        governorate: "",
      };
    }

    const lastLine = lines[lines.length - 1];
    const chunks = lastLine.split(/\s+/).filter(Boolean);
    const governorate = chunks[chunks.length - 1] || "";
    const city = chunks.length > 1 ? chunks.slice(0, -1).join(" ") : governorate;

    return {
      addressLine: lines.join(", "),
      city: normalizeWhitespace(city),
      governorate: normalizeWhitespace(governorate),
    };
  }

  async function extractCinData(frontFileArg?: File | null, backFileArg?: File | null) {
    setError(null);
    setOcrMessage(null);

    const frontFile = frontFileArg ?? cinFrontFile;
    const backFile = backFileArg ?? cinBackFile;

    if (!frontFile || !backFile) {
      setError("Upload both CIN front and back images before extraction");
      return;
    }

    setOcrLoading(true);
    try {
      const payload = new FormData();
      payload.append("front_file", frontFile);
      payload.append("back_file", backFile);

      const response = await fetch("/api/kyc/cin/ocr", {
        method: "POST",
        body: payload,
      });

      const data: CinOcrResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error((data as any)?.error || "Failed to extract CIN data");
      }

      const fields = data.fields ?? {};
      const fullName = buildFullName(fields);
      const cinValue = (fields.cin_number || fields.document_number || "").replace(/\D/g, "").slice(0, 8);
      const address = (fields.address || "").trim();
      const location = splitAddress(address);

      setDraft((prev) => ({
        ...prev,
        full_name: fullName || prev.full_name,
        cin: cinValue || prev.cin,
        date_of_birth: normalizeDate(fields.date_of_birth) || prev.date_of_birth,
        address_line: location.addressLine || prev.address_line,
        city: location.city || prev.city,
        governorate: location.governorate || prev.governorate,
      }));

      const messageParts = [
        data.provider ? `AI provider: ${data.provider}.` : null,
        typeof data.extraction_quality === "number"
          ? `Extraction quality: ${Math.round(data.extraction_quality * 100)}%.`
          : null,
        data.warnings && data.warnings.length > 0
          ? `Warnings: ${data.warnings.join(" | ")}.`
          : "CIN data extracted successfully.",
        "Review the prefilled form and complete the missing contact details.",
      ].filter(Boolean);

      setOcrMessage(messageParts.join(" "));
      setStep(3);
    } catch (err: any) {
      setError(err?.message || "Failed to extract CIN data");
    } finally {
      setOcrLoading(false);
    }
  }

  async function submitRegistration() {
    if (!cinFrontFile) {
      setError("Please upload or capture the CIN front side");
      setStep(1);
      return;
    }

    if (!cinBackFile) {
      setError("Please upload or capture the CIN back side");
      setStep(2);
      return;
    }

    setLoading(true);
    setError(null);
    setOcrMessage(null);

    if (!draft.full_name.trim()) {
      setError("Full name is required");
      setLoading(false);
      setStep(3);
      return;
    }

    const cinDigits = draft.cin.replace(/\D/g, "");
    if (cinDigits.length !== 8) {
      setError("CIN must be exactly 8 digits");
      setLoading(false);
      setStep(3);
      return;
    }

    if (!draft.date_of_birth) {
      setError("Date of birth is required");
      setLoading(false);
      setStep(3);
      return;
    }

    if ((draft.password || "").length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      setStep(3);
      return;
    }

    const phoneDigits = draft.phone.trim().replace(/\D/g, "");
    if (phoneDigits.length !== 8) {
      setError("Phone must be 8 digits (without country code)");
      setLoading(false);
      setStep(3);
      return;
    }

    const phone = `216${phoneDigits}`;

    try {
      const { data } = await api.post<RegisterResult>("/auth/register", {
        full_name: draft.full_name,
        cin: cinDigits,
        date_of_birth: draft.date_of_birth,
        phone,
        password: draft.password,
        email: draft.email,
        address_line: draft.address_line,
        city: draft.city,
        governorate: draft.governorate,
        cin_front_filename: cinFrontFile.name,
        cin_back_filename: cinBackFile.name,
      });

      setResult(data);
      setRegisteredCin(draft.cin);

      if (data.dev_otp) {
        try {
          setLoading(true);
          const { data: verify } = await api.post<{ token: string; chain_address: string }>(
            "/auth/login/otp/verify",
            { cin: draft.cin, otp: data.dev_otp },
          );
          try {
            localStorage.setItem("nexapay_token", verify.token);
            localStorage.setItem("nexapay_address", verify.chain_address);
            localStorage.setItem("nexapay_cin", draft.cin);
          } catch {}
          setOtpRequested(false);
          setOtpMessage(null);
        } catch (err: any) {
          setError(err?.response?.data?.error ?? "OTP verification failed");
        } finally {
          setLoading(false);
        }
      } else if (data.phone_hint) {
        setOtpRequested(true);
        const fallbackHint = data.fallback_available
          ? " If SMS is delayed, use your configured fallback OTP code."
          : "";
        setOtpMessage(`${data.message} (${data.phone_hint}).${fallbackHint}`);
      } else {
        try {
          const { data: otpResp } = await api.post<{ success: boolean; message: string; phone_hint: string; fallback_available?: boolean }>(
            "/auth/login/otp/request",
            { cin: draft.cin },
          );
          setOtpRequested(true);
          const fallbackHint = otpResp.fallback_available
            ? " If SMS is delayed, use your configured fallback OTP code."
            : "";
          setOtpMessage(`${otpResp.message} (${otpResp.phone_hint}).${fallbackHint}`);
        } catch (err: any) {
          setError(err?.response?.data?.error ?? "Failed to request OTP");
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!registeredCin) return;
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post<{ token: string; chain_address: string }>(
        "/auth/login/otp/verify",
        { cin: registeredCin, otp },
      );

      setOtpRequested(false);
      setOtpMessage(null);
      setError(null);
      try {
        localStorage.setItem("nexapay_token", data.token);
        localStorage.setItem("nexapay_address", data.chain_address);
        localStorage.setItem("nexapay_cin", registeredCin);
      } catch {}
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "OTP verification failed");
    } finally {
      setLoading(false);
    }
  }

  if (result && !otpRequested) {
    return (
      <main className="mx-auto max-w-[1120px] px-4 py-10 md:py-14">
        <p className="text-xs uppercase tracking-[0.24em] text-white/55">Account Created</p>
        <h1 className="mt-2 font-[var(--font-sora)] text-3xl font-semibold">Your NexaPay account is ready</h1>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="overflow-hidden border-white/15 bg-[linear-gradient(145deg,#1a2253,#0f1735)] p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-white/65">NexaPay {result.card.type}</p>
            <p className="mt-7 text-2xl tracking-[0.22em]">{result.card.card_number}</p>
            <div className="mt-8 flex items-end justify-between text-sm">
              <div>
                <p className="text-white/60">Card Holder</p>
                <p className="font-semibold tracking-wide">{result.card.card_holder}</p>
              </div>
              <div>
                <p className="text-white/60">Expiry</p>
                <p className="font-semibold">{result.card.expiry}</p>
              </div>
              <div>
                <p className="text-white/60">CVV</p>
                <p className="font-semibold">{result.card.cvv}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold">Account Details</h2>
            <div className="mt-4 space-y-2 text-sm text-white/85">
              <p>Address: {result.chain_address}</p>
              <p>Account Number: {result.account.account_number}</p>
              <p>RIB: {result.account.rib}</p>
              <p>IBAN: {result.account.iban}</p>
              <p>BIC: {result.account.bic}</p>
            </div>
          </Card>
        </div>

        <Card className="mt-4 border-[#ff8f5a]/40 bg-[#ff8f5a]/10 p-5">
          <p className="text-sm font-semibold text-[#ffd7c5]">Important: Save your private key now</p>
          <p className="mt-1 break-all text-sm text-white">{result.private_key}</p>
          <p className="mt-2 text-xs text-white/70">{result.message}</p>
        </Card>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => window.print()}>Download as PDF</Button>
          <Button variant="ghost" onClick={() => setResult(null)}>
            Open Another Account
          </Button>
        </div>
      </main>
    );
  }

  if (result && otpRequested) {
    return (
      <main className="mx-auto max-w-[840px] px-4 py-10 md:py-14">
        <section className="rounded-3xl border border-white/10 bg-[linear-gradient(160deg,#10182e,#0b1021)] p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-white/55">Phone verification</p>
          <h1 className="mt-2 font-[var(--font-sora)] text-3xl font-semibold">Verify your phone to activate account</h1>
          <p className="mt-2 text-sm text-white/70">We sent a verification code to your registered number.</p>
          {otpMessage ? <p className="mt-2 text-sm text-[var(--brand)]">{otpMessage}</p> : null}

          <form className="mt-5 grid gap-3 md:max-w-md" onSubmit={verifyOtp}>
            <input
              className="h-11 rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white outline-none transition focus:border-[var(--brand)]"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
            <Button disabled={loading}>{loading ? "Verifying..." : "Verify & Finish"}</Button>
          </form>

          {error ? <p className="mt-3 text-sm text-[#ff9f78]">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1160px] px-4 py-10 md:py-14">
      <section className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="rounded-3xl border border-white/10 bg-[linear-gradient(160deg,#10182e,#0b1021)] p-6 md:p-8">
          <BrandLogo size="md" className="mb-2" />
          <p className="text-xs uppercase tracking-[0.24em] text-white/55">NexaPay Onboarding</p>
          <h1 className="mt-3 font-[var(--font-sora)] text-3xl font-semibold leading-tight md:text-4xl">Create your banking account online</h1>
          <p className="mt-4 text-sm leading-6 text-white/70">
            Upload the front and back of your CIN first, let AI prefill your information, then review and finish creating the account.
          </p>

          <div className="mt-6 flex gap-2 text-xs">
            <StepBadge label="1. CIN Front" active={step === 1} done={step > 1} />
            <StepBadge label="2. CIN Back" active={step === 2} done={step > 2} />
            <StepBadge label="3. Review Data" active={step === 3} done={false} />
          </div>

          <div className="mt-6 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-white/50">Identity OCR</p>
              <p className="mt-1 text-sm text-white/85">Your CIN images are sent to the OCR service to extract name, CIN number, birth date, and address details.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-white/50">Verification</p>
              <p className="mt-1 text-sm text-white/85">After OCR prefill and registration, OTP verification finalizes your secure onboarding.</p>
            </div>
          </div>
        </aside>

        <Card className="p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Create Profile</p>
          <h2 className="mt-2 font-[var(--font-sora)] text-2xl font-semibold">Step {step} of 3</h2>

          {step === 1 ? (
            <div className="mt-5 grid gap-4">
              <p className="text-sm text-white/75">Upload or take a photo of the front side of your CIN to start the AI prefill.</p>
              <label className="rounded-2xl border border-dashed border-white/25 bg-white/5 p-4">
                <span className="text-sm text-white/75">CIN Front Image</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="mt-2 block w-full text-sm text-white/75"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setPreviewImage(file, setCinFrontFile, setCinFrontPreview, cinFrontPreview);
                  }}
                />
              </label>

              {cinFrontPreview ? (
                <img src={cinFrontPreview} alt="CIN front preview" className="h-44 w-full rounded-xl object-cover" />
              ) : null}

              {error ? <p className="text-sm text-[#ff9f78]">{error}</p> : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    if (!cinFrontFile) {
                      setError("Please upload or capture the CIN front side");
                      return;
                    }
                    setError(null);
                    setStep(2);
                  }}
                >
                  Next: CIN Back
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-5 grid gap-4">
              <p className="text-sm text-white/75">Now upload the back side. As soon as both images are present, the AI OCR call can prefill the form for you.</p>
              <label className="rounded-2xl border border-dashed border-white/25 bg-white/5 p-4">
                <span className="text-sm text-white/75">CIN Back Image</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="mt-2 block w-full text-sm text-white/75"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setPreviewImage(file, setCinBackFile, setCinBackPreview, cinBackPreview);
                    if (file && cinFrontFile) {
                      void extractCinData(cinFrontFile, file);
                    }
                  }}
                />
              </label>

              {cinBackPreview ? (
                <img src={cinBackPreview} alt="CIN back preview" className="h-44 w-full rounded-xl object-cover" />
              ) : null}

              {error ? <p className="text-sm text-[#ff9f78]">{error}</p> : null}
              {ocrLoading ? <p className="text-sm text-[var(--brand)]">Sending CIN images to AI OCR...</p> : null}
              {ocrMessage ? <p className="text-sm text-[var(--brand)]">{ocrMessage}</p> : null}

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={ocrLoading || !cinFrontFile || !cinBackFile}
                  onClick={() => void extractCinData()}
                >
                  {ocrLoading ? "Extracting..." : "Retry OCR"}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(3);
                  }}
                >
                  Review Form Manually
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <form
              className="mt-5 grid gap-3 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submitRegistration();
              }}
            >
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75 md:col-span-2">
                <p className="font-medium text-white">Review the information extracted from your CIN</p>
                <p className="mt-1 text-white/70">You can edit any field before the account is created. Phone and password still need to be entered manually.</p>
                {ocrMessage ? <p className="mt-2 text-[var(--brand)]">{ocrMessage}</p> : null}
              </div>

              <Input
                name="full_name"
                label="Full Name"
                required
                value={draft.full_name}
                onChange={(e) => setDraft((prev) => ({ ...prev, full_name: e.target.value }))}
              />
              <Input
                name="cin"
                label="CIN"
                required
                maxLength={8}
                value={draft.cin}
                onChange={(e) => setDraft((prev) => ({ ...prev, cin: e.target.value }))}
              />
              <Input
                name="date_of_birth"
                label="Date of Birth"
                type="date"
                required
                value={draft.date_of_birth}
                onChange={(e) => setDraft((prev) => ({ ...prev, date_of_birth: e.target.value }))}
              />
              <Input
                name="phone"
                label="Phone (8 digits)"
                required
                placeholder="12345678"
                maxLength={8}
                value={draft.phone}
                onChange={(e) => setDraft((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <Input
                name="password"
                label="Password (min 6 chars)"
                type="password"
                minLength={6}
                required
                value={draft.password}
                onChange={(e) => setDraft((prev) => ({ ...prev, password: e.target.value }))}
              />
              <Input
                name="email"
                label="Email"
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
              />
              <Input
                name="address_line"
                label="Address"
                className="md:col-span-2"
                value={draft.address_line}
                onChange={(e) => setDraft((prev) => ({ ...prev, address_line: e.target.value }))}
              />
              <Input
                name="city"
                label="City"
                value={draft.city}
                onChange={(e) => setDraft((prev) => ({ ...prev, city: e.target.value }))}
              />
              <Input
                name="governorate"
                label="Governorate"
                value={draft.governorate}
                onChange={(e) => setDraft((prev) => ({ ...prev, governorate: e.target.value }))}
              />

              {error ? <p className="text-sm text-[#ff9f78] md:col-span-2">{error}</p> : null}

              <div className="mt-1 flex flex-wrap gap-3 md:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                  Back to CIN Images
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Setting up your account..." : "Continue Registration"}
                </Button>
              </div>
            </form>
          ) : null}
        </Card>
      </section>
    </main>
  );
}

function StepBadge({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 ${active ? "border-[var(--brand)] bg-[var(--brand)]/20 text-[var(--brand)]" : "border-white/15 text-white/65"} ${done ? "border-[#7cf4bd] text-[#7cf4bd]" : ""}`}
    >
      {label}
    </span>
  );
}

function Input({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`grid gap-1 text-sm font-medium text-white/80 ${className ?? ""}`}>
      <span>{label}</span>
      <input
        className="h-11 rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white outline-none transition focus:border-[var(--brand)]"
        {...props}
      />
    </label>
  );
}
