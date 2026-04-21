"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, LockKeyhole, User, Key } from "lucide-react";

import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { developerPlans } from "@/lib/subscriptions";
import { api } from "@/lib/api";
import {
  readDeveloperSession,
  writeDeveloperSession,
  type DeveloperProfile,
} from "@/lib/developer-portal";

type RegisterResponse = {
  api_key: string;
  api_key_prefix: string;
  plan: string;
  call_limit: number;
  docs_url: string;
  session_token: string;
  developer: DeveloperProfile;
};

type LoginResponse = {
  success: boolean;
  session_token: string;
  api_key_prefix: string;
  developer: DeveloperProfile;
};

export default function DevPortalPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [busy, setBusy] = useState<"register" | "login" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingCompany, setExistingCompany] = useState<string | null>(null);

  const [registerForm, setRegisterForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    password: "",
    plan: "starter",
  });

  const [loginForm, setLoginForm] = useState({
    identifier: "",
    password: "",
  });

  useEffect(() => {
    const session = readDeveloperSession();
    if (session?.developer?.company_name) {
      setExistingCompany(session.developer.company_name);
    }
  }, []);

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("register");
    setError(null);

    try {
      const { data } = await api.post<RegisterResponse>(
        "/dev/register",
        registerForm,
      );
      writeDeveloperSession({
        sessionToken: data.session_token,
        developer: data.developer,
        developerApiKey: data.api_key,
        developerApiKeyPrefix: data.api_key_prefix,
        merchantKeys: {},
      });
      router.push("/dev/dashboard");
    } catch (err: any) {
      setError(
        err?.response?.data?.error ?? "Unable to create developer workspace",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("login");
    setError(null);

    try {
      const previous = readDeveloperSession();
      const { data } = await api.post<LoginResponse>("/dev/login", loginForm);
      writeDeveloperSession({
        sessionToken: data.session_token,
        developer: data.developer,
        developerApiKey:
          previous?.developer?.email === data.developer.email
            ? previous.developerApiKey
            : undefined,
        developerApiKeyPrefix: data.api_key_prefix,
        merchantKeys:
          previous?.developer?.email === data.developer.email
            ? previous.merchantKeys
            : {},
      });
      router.push("/dev/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to sign in");
    } finally {
      setBusy(null);
    }
  }

  const currentPlan = developerPlans.find(
    (plan) => plan.id === registerForm.plan,
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#070911] to-[#0b0f1e] p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo size="md" />
            <span className="text-lg font-semibold text-white">NexaPay</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/subscription"
              className="text-sm font-medium text-white/70 hover:text-white"
            >
              Pricing
            </Link>
            {existingCompany && (
              <Link
                href="/dev/dashboard"
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                Open {existingCompany}
              </Link>
            )}
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left side - Intro */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white">
                Developer Portal
              </h1>
              <p className="mt-2 text-lg text-white/70">
                Build, test, and manage your payment integrations
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-[#2de6c4]/20 p-2">
                    <Building2 className="h-5 w-5 text-[#2de6c4]" />
                  </div>
                  <h3 className="font-semibold text-white">
                    Merchant Workspaces
                  </h3>
                </div>
                <p className="text-sm text-white/60">
                  Create and manage merchant accounts with separate API keys
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-[#57c8ff]/20 p-2">
                    <LockKeyhole className="h-5 w-5 text-[#57c8ff]" />
                  </div>
                  <h3 className="font-semibold text-white">Hosted Checkout</h3>
                </div>
                <p className="text-sm text-white/60">
                  Customer-ready payment pages with built-in security
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-[#a1ffe2]/20 p-2">
                    <Key className="h-5 w-5 text-[#a1ffe2]" />
                  </div>
                  <h3 className="font-semibold text-white">Key Management</h3>
                </div>
                <p className="text-sm text-white/60">
                  Rotate and secure API credentials with lifecycle controls
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-[#ff8f5a]/20 p-2">
                    <User className="h-5 w-5 text-[#ff8f5a]" />
                  </div>
                  <h3 className="font-semibold text-white">Revenue Tracking</h3>
                </div>
                <p className="text-sm text-white/60">
                  Monitor payment success rates and merchant performance
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-gradient-to-r from-[#0d1328]/50 to-[#121a2f]/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Why use the developer portal?
              </h3>
              <p className="text-white/70">
                Get access to merchant onboarding, hosted checkout generation,
                API key management, and revenue analytics—all in one
                professional console designed for serious payment integrations.
              </p>
            </div>
          </div>

          {/* Right side - Auth Form */}
          <div className="space-y-6">
            <Card className="p-6 border-white/10 bg-[#0d1328]">
              <div className="flex border-b border-white/10 mb-6">
                <button
                  type="button"
                  className={`flex-1 pb-3 text-center font-medium ${mode === "register" ? "text-white border-b-2 border-[#2de6c4]" : "text-white/50 hover:text-white/80"}`}
                  onClick={() => setMode("register")}
                >
                  Register
                </button>
                <button
                  type="button"
                  className={`flex-1 pb-3 text-center font-medium ${mode === "login" ? "text-white border-b-2 border-[#2de6c4]" : "text-white/50 hover:text-white/80"}`}
                  onClick={() => setMode("login")}
                >
                  Login
                </button>
              </div>

              {mode === "register" ? (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={registerForm.company_name}
                      onChange={(e) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          company_name: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#2de6c4] focus:outline-none"
                      placeholder="Your company"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Contact Name
                    </label>
                    <input
                      type="text"
                      value={registerForm.contact_name}
                      onChange={(e) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          contact_name: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#2de6c4] focus:outline-none"
                      placeholder="Your name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={registerForm.email}
                      onChange={(e) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#2de6c4] focus:outline-none"
                      placeholder="you@company.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={registerForm.phone}
                      onChange={(e) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#2de6c4] focus:outline-none"
                      placeholder="+216 12 345 678"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Password
                    </label>
                    <input
                      type="password"
                      value={registerForm.password}
                      onChange={(e) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#2de6c4] focus:outline-none"
                      placeholder="Minimum 8 characters"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Plan
                    </label>
                    <select
                      value={registerForm.plan}
                      onChange={(e) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          plan: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#2de6c4] focus:outline-none"
                    >
                      {developerPlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} - TND {plan.monthlyPrice}/month
                        </option>
                      ))}
                    </select>
                  </div>

                  {error && <p className="text-sm text-[#ff9f7b]">{error}</p>}

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#2de6c4] to-[#57c8ff] text-white hover:opacity-90"
                    disabled={busy !== null}
                  >
                    {busy === "register" ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Creating workspace...
                      </span>
                    ) : (
                      "Create Developer Workspace"
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Email or Phone
                    </label>
                    <input
                      type="text"
                      value={loginForm.identifier}
                      onChange={(e) =>
                        setLoginForm((prev) => ({
                          ...prev,
                          identifier: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#2de6c4] focus:outline-none"
                      placeholder="you@company.com or +216..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Password
                    </label>
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) =>
                        setLoginForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#2de6c4] focus:outline-none"
                      placeholder="Your password"
                      required
                    />
                  </div>

                  {error && <p className="text-sm text-[#ff9f7b]">{error}</p>}

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#2de6c4] to-[#57c8ff] text-white hover:opacity-90"
                    disabled={busy !== null}
                  >
                    {busy === "login" ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Signing in...
                      </span>
                    ) : (
                      "Open Developer Console"
                    )}
                  </Button>
                </form>
              )}
            </Card>

            <Card className="p-6 border-white/10 bg-[#0d1328]">
              <h3 className="text-lg font-semibold text-white mb-3">
                {currentPlan?.name} Plan
              </h3>
              <p className="text-white/70 mb-4">{currentPlan?.description}</p>
              <div className="space-y-2">
                {currentPlan?.features.slice(0, 3).map((feature, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="h-5 w-5 rounded-full bg-[#2de6c4]/20 flex items-center justify-center flex-shrink-0">
                      <div className="h-2 w-2 rounded-full bg-[#2de6c4]" />
                    </div>
                    <span className="text-sm text-white/80">{feature}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-sm text-white/60">
                  Best for teams building production payment integrations with
                  hosted checkout.
                </p>
              </div>
            </Card>
          </div>
        </div>

        <footer className="mt-12 pt-6 border-t border-white/10 text-center">
          <p className="text-sm text-white/50">
            Need help? Contact{" "}
            <a
              href="mailto:contact@backendglitch.com"
              className="text-[#57c8ff] hover:underline"
            >
              contact@backendglitch.com
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
