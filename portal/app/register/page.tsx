"use client";

import { FormEvent, useState } from "react";

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
};

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  const [otpRequested, setOtpRequested] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [registeredCin, setRegisteredCin] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    // normalize phone: expect 8 digits from user, prepend country code 216
    const phoneRaw = String(form.get("phone") ?? "").trim();
    const phoneDigits = phoneRaw.replace(/\D/g, "");
    if (phoneDigits.length !== 8) {
      setError("Phone must be 8 digits (without country code)");
      setLoading(false);
      return;
    }
    const phone = `216${phoneDigits}`;

    try {
      const { data } = await api.post<RegisterResult>("/auth/register", {
        full_name: String(form.get("full_name") ?? ""),
        cin: String(form.get("cin") ?? ""),
        date_of_birth: String(form.get("date_of_birth") ?? ""),
        phone: phone,
        password: String(form.get("password") ?? ""),
        email: String(form.get("email") ?? ""),
        address_line: String(form.get("address_line") ?? ""),
        city: String(form.get("city") ?? ""),
        governorate: String(form.get("governorate") ?? ""),
      });

      // store registration result but don't reveal private key yet
      setResult(data);
      setRegisteredCin(String(form.get("cin") ?? ""));

      // If server returned a dev OTP (development fallback), auto-verify it.
      if (data.dev_otp) {
        try {
          setLoading(true);
          const { data: verify } = await api.post<{ token: string; chain_address: string }>(
            "/auth/login/otp/verify",
            { cin: String(form.get("cin") ?? ""), otp: data.dev_otp }
          );
          try {
            localStorage.setItem("nexapay_token", verify.token);
          } catch {}
          setOtpRequested(false);
          setOtpMessage(null);
        } catch (err: any) {
          setError(err?.response?.data?.error ?? "OTP verification failed");
        } finally {
          setLoading(false);
        }
      } else if (data.phone_hint) {
        // Server already sent an OTP during registration; show OTP UI with hint
        setOtpRequested(true);
        setOtpMessage(`${data.message} (${data.phone_hint})`);
      } else {
        // Fallback: explicitly request an OTP as before
        try {
          const { data: otpResp } = await api.post<{ success: boolean; message: string; phone_hint: string }>(
            "/auth/login/otp/request",
            { cin: String(form.get("cin") ?? "") }
          );
          setOtpRequested(true);
          setOtpMessage(`${otpResp.message} (${otpResp.phone_hint})`);
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
        { cin: registeredCin, otp }
      );

      // OTP verified — now reveal registration result (including private key)
      setOtpRequested(false);
      setOtpMessage(null);
      setError(null);
      // Optionally store the token in localStorage and redirect to dashboard
      try {
        localStorage.setItem("nexapay_token", data.token);
      } catch {}
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "OTP verification failed");
    } finally {
      setLoading(false);
    }
  }

  if (result && !otpRequested) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="font-[var(--font-sora)] text-3xl font-semibold">Your NexaPay Account Is Ready</h1>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="card-sheen overflow-hidden bg-gradient-to-br from-tide to-ink p-6 text-paper">
            <p className="text-xs uppercase tracking-[0.3em] text-paper/70">NexaPay {result.card.type}</p>
            <p className="mt-7 text-2xl tracking-[0.22em]">{result.card.card_number}</p>
            <div className="mt-8 flex items-end justify-between text-sm">
              <div>
                <p className="text-paper/70">Card Holder</p>
                <p className="font-semibold tracking-wide">{result.card.card_holder}</p>
              </div>
              <div>
                <p className="text-paper/70">Expiry</p>
                <p className="font-semibold">{result.card.expiry}</p>
              </div>
              <div>
                <p className="text-paper/70">CVV</p>
                <p className="font-semibold">{result.card.cvv}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold">Account Details</h2>
            <div className="mt-4 space-y-2 text-sm">
              <p>Address: {result.chain_address}</p>
              <p>Account Number: {result.account.account_number}</p>
              <p>RIB: {result.account.rib}</p>
              <p>IBAN: {result.account.iban}</p>
              <p>BIC: {result.account.bic}</p>
            </div>
          </Card>
        </div>

        <Card className="mt-4 border-ember/30 bg-ember/10 p-5">
          <p className="text-sm font-semibold text-ember">Important: Save your private key now</p>
          <p className="mt-1 break-all text-sm">{result.private_key}</p>
          <p className="mt-2 text-xs text-ink/70">{result.message}</p>
        </Card>

        <div className="mt-6 flex gap-3">
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
      <main className="mx-auto max-w-lg px-4 py-10">
        <h1 className="font-[var(--font-sora)] text-2xl font-semibold">Verify Your Phone</h1>
        <Card className="mt-6 p-6">
          <p className="text-sm">We sent a verification code to your phone.</p>
          {otpMessage ? <p className="mt-2 text-sm text-tide">{otpMessage}</p> : null}

          <form className="mt-4 grid gap-3" onSubmit={verifyOtp}>
            <input
              className="h-10 rounded-xl border border-ink/15 px-3"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
            <Button disabled={loading}>{loading ? "Verifying..." : "Verify & Finish"}</Button>
          </form>

          {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-[var(--font-sora)] text-3xl font-semibold">Open Your NexaPay Account</h1>
      <p className="mt-2 text-sm text-ink/70">KYC data is stored securely off-chain. Only hashes are anchored on-chain.</p>

      <form className="mt-6 grid gap-3" onSubmit={onSubmit}>
        <Input name="full_name" label="Full Name" required />
        <Input name="cin" label="CIN" required maxLength={8} />
        <Input name="date_of_birth" label="Date of Birth" type="date" required />
        <Input name="phone" label="Phone (8 digits — country code +216 added)" required placeholder="12345678" maxLength={8} />
        <Input name="password" label="Password (min 6 chars)" type="password" minLength={6} required />
        <Input name="email" label="Email" type="email" />
        <Input name="address_line" label="Address" />
        <Input name="city" label="City" />
        <Input name="governorate" label="Governorate" />

        {error ? <p className="text-sm text-ember">{error}</p> : null}

        <Button disabled={loading} className="mt-3">
          {loading ? "Setting up your account..." : "Create Account"}
        </Button>
      </form>
    </main>
  );
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input
        className="h-11 rounded-xl border border-ink/15 bg-white px-3 outline-none ring-tide transition focus:ring-2"
        {...props}
      />
    </label>
  );
}
