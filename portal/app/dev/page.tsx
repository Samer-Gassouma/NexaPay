"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";

import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
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
      const { data } = await api.post<RegisterResponse>("/dev/register", registerForm);
      writeDeveloperSession({
        sessionToken: data.session_token,
        developer: data.developer,
        developerApiKey: data.api_key,
        developerApiKeyPrefix: data.api_key_prefix,
        merchantKeys: {},
      });
      router.push("/dev/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to create developer workspace");
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

  const currentPlan = developerPlans.find((plan) => plan.id === registerForm.plan);
  const inputClass =
    "mt-2 h-11 w-full rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white placeholder:text-white/40 outline-none transition focus:border-[var(--brand)]";

  return (
    <main className="mx-auto max-w-[1260px] px-4 py-8 md:py-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center">
          <BrandLogo size="md" />
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/subscription" className="text-sm font-semibold text-[#ffb17f] underline underline-offset-4">
            Pricing
          </Link>
          {existingCompany ? (
            <Link href="/dev/dashboard" className="neo-btn neo-btn--dark">
              Open {existingCompany}
            </Link>
          ) : null}
        </div>
      </div>

      <section className="pro-hero animate-rise">
        <div className="hero-noise" />
        <div className="hero-layout">
          <div className="hero-left">
            <p className="hero-tag">For builders, platforms, and local commerce teams</p>
            <h1 className="hero-title">
              Developer
              <br />
              infrastructure
              <br />
              that feels real
            </h1>
            <p className="hero-subtitle">
              Create your NexaPay business workspace, manage merchants, track revenue, issue fresh API keys, and ship hosted checkout that looks trustworthy from day one.
            </p>

            <div className="hero-actions">
              <button
                type="button"
                onClick={() => setMode("register")}
                className={mode === "register" ? "neo-btn neo-btn--primary" : "neo-btn neo-btn--dark"}
              >
                Create workspace
              </button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className={mode === "login" ? "neo-btn neo-btn--primary" : "neo-btn neo-btn--ghost"}
              >
                Sign in
              </button>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <ValuePill label="Merchant workspaces" value="Create and manage accounts" />
              <ValuePill label="Hosted checkout" value="Customer-ready payment pages" />
              <ValuePill label="Key lifecycle" value="Rotate and secure credentials" />
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
              <div className="rounded-[24px] border border-white/12 bg-[linear-gradient(160deg,#11162a,#0b0f1d)] p-5 shadow-[0_26px_60px_rgba(0,0,0,0.32)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-white/48">
                      {mode === "register" ? "Create Developer Account" : "Developer Login"}
                    </p>
                    <h2 className="mt-2 font-[var(--font-sora)] text-2xl font-semibold text-white">
                      {mode === "register" ? "Open your gateway workspace" : "Continue to your console"}
                    </h2>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                    Secure session
                  </div>
                </div>

                {mode === "register" ? (
                  <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleRegister}>
                    <label className="text-sm font-medium text-white/80">
                      Company name
                      <input
                        className={inputClass}
                        value={registerForm.company_name}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, company_name: e.target.value }))}
                        placeholder="Sahtek Market"
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-white/80">
                      Contact name
                      <input
                        className={inputClass}
                        value={registerForm.contact_name}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, contact_name: e.target.value }))}
                        placeholder="Youssef Trabelsi"
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-white/80">
                      Work email
                      <input
                        type="email"
                        className={inputClass}
                        value={registerForm.email}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="ops@sahtek.tn"
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-white/80">
                      Phone
                      <input
                        className={inputClass}
                        value={registerForm.phone}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="+216 98 765 432"
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-white/80">
                      Password
                      <input
                        type="password"
                        className={inputClass}
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Minimum 8 characters"
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-white/80">
                      Plan
                      <select
                        className={inputClass}
                        value={registerForm.plan}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, plan: e.target.value }))}
                      >
                        {developerPlans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                      Your first session stores the developer API key in this browser so you can create merchants and issue hosted checkout links immediately.
                    </div>

                    <Button type="submit" className="md:col-span-2" disabled={busy !== null}>
                      {busy === "register" ? "Creating workspace..." : "Create developer workspace"}
                    </Button>
                  </form>
                ) : (
                  <form className="mt-5 grid gap-4" onSubmit={handleLogin}>
                    <label className="text-sm font-medium text-white/80">
                      Email or phone
                      <input
                        className={inputClass}
                        value={loginForm.identifier}
                        onChange={(e) => setLoginForm((prev) => ({ ...prev, identifier: e.target.value }))}
                        placeholder="ops@sahtek.tn or +216..."
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-white/80">
                      Password
                      <input
                        type="password"
                        className={inputClass}
                        value={loginForm.password}
                        onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Your developer password"
                        required
                      />
                    </label>

                    <Button type="submit" disabled={busy !== null}>
                      {busy === "login" ? "Signing in..." : "Open developer console"}
                    </Button>
                  </form>
                )}

                {error ? <p className="mt-4 text-sm text-[#ff9f7b]">{error}</p> : null}
              </div>

              <div className="rounded-[24px] border border-white/12 bg-[linear-gradient(160deg,#121827,#0b0f1b)] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-white/48">Current plan</p>
                <h3 className="mt-2 font-[var(--font-sora)] text-2xl font-semibold text-white">
                  {currentPlan?.name ?? "Starter"}
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/68">
                  {currentPlan?.description}
                </p>

                <div className="mt-5 space-y-3">
                  {(currentPlan?.features ?? []).slice(0, 4).map((feature) => (
                    <div key={feature} className="flex items-start gap-3 text-sm text-white/72">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--brand)]" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/42">Best for</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    Teams that want a serious hosted checkout, merchant operations, and API workflows without building internal admin tooling from scratch.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="platform-story mt-8">
        <div className="story-head">
          <p className="story-kicker">Why this portal exists</p>
          <h2 className="story-title">A merchant console that matches the rest of NexaPay</h2>
          <p className="story-copy">
            The developer side should feel like a real financial operations tool, not a demo surface. Use it to onboard businesses, manage keys, view revenue, and create hosted payment flows with the same product language as the main site.
          </p>
        </div>

        <div className="story-grid">
          <article className="story-card story-card-user">
            <p className="story-card-tag">Business onboarding</p>
            <h3>Create the workspace with the details a real merchant team expects.</h3>
            <p>
              Company name, operator, email, phone, password, and plan selection are handled in one place so the console feels closer to Stripe onboarding than a raw key generator.
            </p>
          </article>

          <article className="story-card">
            <p className="story-card-tag">Key management</p>
            <h3>Rotate developer credentials without leaving the console.</h3>
            <p>
              The workspace stores the issued developer key locally for this browser so you can continue into merchant creation immediately after onboarding.
            </p>
          </article>

          <article className="story-card">
            <p className="story-card-tag">Merchant operations</p>
            <h3>Issue merchants, inspect revenue, and create hosted checkout links.</h3>
            <p>
              Once signed in, the dashboard gives you the operational view a real payment gateway should expose.
            </p>
            <Link href="/dev/dashboard" className="story-link">
              Open developer dashboard
            </Link>
          </article>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-white/10 bg-[linear-gradient(160deg,#10172b,#090d18)] p-6 md:p-8">
        <div className="grid gap-4 md:grid-cols-2">
          {developerPlans.map((plan) => (
            <article key={plan.id} className="rounded-2xl border border-white/12 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/55">{plan.name}</p>
                <p className="text-sm text-[var(--brand)]">TND {plan.monthlyPrice}/mo</p>
              </div>
              <p className="mt-3 text-sm text-white/72">{plan.description}</p>
              <div className="mt-4 flex items-center gap-2 text-sm text-white/62">
                <ShieldCheck className="h-4 w-4 text-[var(--brand)]" />
                {plan.priceLabel}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function ValuePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/42">{label}</p>
      <p className="mt-2 text-sm font-medium text-white/82">{value}</p>
    </div>
  );
}
