"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    setNextPath(params.get("next") ?? "");
  }, []);

  async function completeLogin(data: LoginResponse) {
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
      setOtpMessage(`${data.message} (${data.phone_hint})`);
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
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-xs uppercase tracking-[0.3em] text-ink/45">NexaPay Access</p>
      <h1 className="mt-2 font-[var(--font-sora)] text-3xl font-semibold">Login to Your Account</h1>

      <Card className="mt-6 p-6">
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-ink/10 p-1 text-sm">
          <button
            type="button"
            className={`rounded-lg px-3 py-2 ${loginMode === "password" ? "bg-tide text-paper" : "bg-transparent text-ink"}`}
            onClick={() => {
              setLoginMode("password");
              setError(null);
            }}
          >
            CIN + Password
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 ${loginMode === "otp" ? "bg-tide text-paper" : "bg-transparent text-ink"}`}
            onClick={() => {
              setLoginMode("otp");
              setError(null);
            }}
          >
            CIN + OTP
          </button>
        </div>

        {loginMode === "password" ? (
          <form className="grid gap-3" onSubmit={loginWithPassword}>
            <input
              className="h-10 rounded-xl border border-ink/15 px-3"
              placeholder="CIN (8 digits)"
              value={cin}
              onChange={(e) => setCin(e.target.value)}
              required
            />
            <input
              type="password"
              className="h-10 rounded-xl border border-ink/15 px-3"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            

            <Button disabled={loading}>{loading ? "Logging in..." : "Login"}</Button>
          </form>
        ) : (
          <>
            <form className="grid gap-3" onSubmit={requestOtp}>
              <input
                className="h-10 rounded-xl border border-ink/15 px-3"
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
                  className="h-10 rounded-xl border border-ink/15 px-3"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
                <Button disabled={loading}>{loading ? "Verifying..." : "Verify OTP & Login"}</Button>
              </form>
            ) : null}

            {otpMessage ? <p className="mt-3 text-sm text-tide">{otpMessage}</p> : null}
          </>
        )}

        {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      </Card>

      <p className="mt-4 text-sm text-ink/70">
        Need an account?{" "}
        <Link href="/register" className="font-semibold text-tide underline">
          Create one
        </Link>
      </p>
    </main>
  );
}
