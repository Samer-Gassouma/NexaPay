"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

type LoginResponse = {
  token: string;
  chain_address: string;
};

type OtpRequestResponse = {
  success: boolean;
  message: string;
  phone_hint: string;
  fallback_available?: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const [cin, setCin] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  
  const [loginMode, setLoginMode] = useState<"password" | "otp">("password");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") ?? "";
    setNextPath(next);

    // If we already have a stored session, skip login form.
    try {
      const savedToken = localStorage.getItem("nexapay_token") ?? "";
      const savedAddress = localStorage.getItem("nexapay_address") ?? "";
      if (savedToken && savedAddress) {
        if (next) {
          const nextUrl = new URL(next, window.location.origin);
          nextUrl.searchParams.set("token", savedToken);
          nextUrl.searchParams.set("address", savedAddress);
          router.replace(`${nextUrl.pathname}${nextUrl.search}`);
          return;
        }
        router.replace("/dashboard");
      }
    } catch {}
  }, []);

  async function completeLogin(data: LoginResponse) {
    try {
      localStorage.setItem("nexapay_token", data.token);
      localStorage.setItem("nexapay_address", data.chain_address);
      localStorage.setItem("nexapay_cin", cin);
    } catch {}

    if (nextPath) {
      const nextUrl = new URL(nextPath, window.location.origin);
      nextUrl.searchParams.set("token", data.token);
      nextUrl.searchParams.set("address", data.chain_address);
      router.push(`${nextUrl.pathname}${nextUrl.search}`);
      return;
    }

    const params = new URLSearchParams({
      token: data.token,
      address: data.chain_address,
    });

    router.push(`/dashboard?${params.toString()}`);
  }

  async function loginWithPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOtpMessage(null);
    setLoading(true);

    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        cin,
        password,
      });

      await completeLogin(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOtpMessage(null);
    setLoading(true);

    try {
      const { data } = await api.post<OtpRequestResponse>("/auth/login/otp/request", {
        cin,
      });
      setOtpRequested(true);
      const fallbackHint = data.fallback_available
        ? " If SMS is delayed, use your configured fallback OTP code."
        : "";
      setOtpMessage(`${data.message} (${data.phone_hint}).${fallbackHint}`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data } = await api.post<LoginResponse>("/auth/login/otp/verify", {
        cin,
        otp,
      });

      await completeLogin(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "OTP verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1160px] px-4 py-10 md:py-14">
      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="rounded-3xl border border-white/10 bg-[linear-gradient(160deg,#10182e,#0b1021)] p-6 md:p-8">
          <BrandLogo size="md" className="mb-2" />
          <p className="text-xs uppercase tracking-[0.24em] text-white/55">NexaPay Banking Access</p>
          <h1 className="mt-3 font-[var(--font-sora)] text-3xl font-semibold leading-tight md:text-4xl">Sign in to your secure wallet</h1>
          <p className="mt-4 text-sm leading-6 text-white/70">
            Access instant transfers, payment checkout, lending tools, and account activity in one protected dashboard.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-white/50">Security</p>
              <p className="mt-1 text-sm text-white/85">CIN-based authentication with password or OTP.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-white/50">Session</p>
              <p className="mt-1 text-sm text-white/85">Tokenized account access for payments, loans, and wallet actions.</p>
            </div>
          </div>
        </aside>

        <Card className="p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Account Login</p>
          <h2 className="mt-2 font-[var(--font-sora)] text-2xl font-semibold">Welcome back</h2>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1 text-sm">
            <button
              type="button"
              className={`rounded-lg px-3 py-2 font-semibold ${loginMode === "password" ? "bg-[var(--brand)] text-[#0d1231]" : "bg-transparent text-white/70"}`}
              onClick={() => {
                setLoginMode("password");
                setError(null);
                setOtpMessage(null);
              }}
            >
              CIN + Password
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-2 font-semibold ${loginMode === "otp" ? "bg-[var(--brand)] text-[#0d1231]" : "bg-transparent text-white/70"}`}
              onClick={() => {
                setLoginMode("otp");
                setError(null);
                setOtpMessage(null);
              }}
            >
              CIN + OTP
            </button>
          </div>

          {loginMode === "password" ? (
            <form className="mt-4 grid gap-3" onSubmit={loginWithPassword}>
              <input
                className="h-11 rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white outline-none transition focus:border-[var(--brand)]"
                placeholder="CIN (8 digits)"
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                required
              />
              <input
                type="password"
                className="h-11 rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white outline-none transition focus:border-[var(--brand)]"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button disabled={loading} className="mt-1">
                {loading ? "Logging in..." : "Login"}
              </Button>
            </form>
          ) : (
            <>
              <form className="mt-4 grid gap-3" onSubmit={requestOtp}>
                <input
                  className="h-11 rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white outline-none transition focus:border-[var(--brand)]"
                  placeholder="CIN (8 digits)"
                  value={cin}
                  onChange={(e) => setCin(e.target.value)}
                  required
                />

                <Button disabled={loading}>{loading ? "Sending OTP..." : "Send OTP"}</Button>
              </form>

              {otpRequested ? (
                <form className="mt-4 grid gap-3" onSubmit={verifyOtp}>
                  <input
                    className="h-11 rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white outline-none transition focus:border-[var(--brand)]"
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                  />
                  <Button disabled={loading}>{loading ? "Verifying..." : "Verify OTP & Login"}</Button>
                </form>
              ) : null}

              {otpMessage ? <p className="mt-3 text-sm text-[var(--brand)]">{otpMessage}</p> : null}
            </>
          )}

          {error ? <p className="mt-3 text-sm text-[#ff9f78]">{error}</p> : null}

          <p className="mt-5 text-sm text-white/65">
            Need an account?{" "}
            <Link href="/register" className="font-semibold text-[var(--brand)] underline underline-offset-4">
              Create one
            </Link>
          </p>
        </Card>
      </section>
    </main>
  );
}
