"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { developerPlans, sdkRoadmap } from "@/lib/subscriptions";

type DevRegisterResponse = {
  api_key: string;
  api_key_prefix: string;
  plan: string;
  call_limit: number;
  docs_url: string;
};

export default function DevPortalPage() {
  const [result, setResult] = useState<DevRegisterResponse | null>(null);
  const [calls, setCalls] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const activePlan = result ? developerPlans.find((plan) => plan.id === result.plan) : null;

  async function register(formData: FormData) {
    setError(null);
    try {
      const { data } = await api.post<DevRegisterResponse>("/dev/register", {
        company_name: formData.get("company_name"),
        contact_name: formData.get("contact_name"),
        email: formData.get("email"),
        plan: formData.get("plan"),
      });
      setResult(data);
      setCalls(0);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to register developer");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-[var(--font-sora)] text-3xl font-semibold text-white">Developer Portal</h1>
      <p className="mt-3 max-w-2xl text-sm text-white/75 md:text-base">
        NexaPay payment gateway is live today for production checkout flows. Official SDKs are coming soon for {sdkRoadmap.join(" and ")}.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/dev/dashboard" className="text-sm font-semibold text-[var(--brand)] underline underline-offset-4">
          Open gateway dashboard
        </Link>
        <Link href="/subscription" className="text-sm font-semibold text-[#ffb17f] underline underline-offset-4">
          View billing and subscriptions
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {developerPlans.map((plan) => (
          <Card key={plan.id} className="relative p-5">
            {plan.highlight ? (
              <p className="absolute right-4 top-4 rounded-full border border-[var(--brand)]/35 bg-[var(--brand)]/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
                {plan.highlight}
              </p>
            ) : null}
            <p className="text-xs uppercase tracking-[0.25em] text-white/55">{plan.name}</p>
            <p className="mt-2 text-xl font-semibold">TND {plan.monthlyPrice}/mo</p>
            <p className="mt-1 text-xs text-white/55">{plan.priceLabel}</p>
            <p className="mt-3 text-sm text-white/72">{plan.description}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold">Register</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          action={async (fd) => {
            await register(fd);
          }}
        >
          <input name="company_name" className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]" placeholder="Startup XYZ" />
          <input name="contact_name" className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]" placeholder="Founder Name" />
          <input name="email" className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]" placeholder="dev@startup.tn" />
          <select name="plan" className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white outline-none focus:border-[var(--brand)]">
            {developerPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.id}
              </option>
            ))}
          </select>
          <Button className="md:col-span-2">Get API Key</Button>
        </form>
        {error ? <p className="mt-3 text-sm text-[#ff8d4d]">{error}</p> : null}
      </Card>

      {result ? (
        <>
          <Card className="mt-4 p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-white/55">API Key</p>
            <p className="mt-2 break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-sm text-[#7dffbe]">{result.api_key}</p>
            <p className="mt-2 text-sm">
              Plan: <b>{result.plan}</b> | Limit: <b>{result.call_limit}</b> calls/day
            </p>
            {activePlan ? <p className="mt-1 text-sm text-white/70">{activePlan.description}</p> : null}
            <div className="mt-3 flex items-center gap-3">
              <Button variant="ghost" onClick={() => setCalls((n) => n + 1)}>
                Simulate API Call
              </Button>
              <p className="text-sm">
                {calls} / {result.call_limit}
              </p>
            </div>
          </Card>

          <Card className="mt-4 p-6">
            <h3 className="text-lg font-semibold">Code Snippets</h3>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-white/85">
{`# curl
curl -X GET "$API/chain/stats" -H "X-API-Key: ${result.api_key_prefix}..."

// JavaScript (Axios)
const res = await axios.get("$API/accounts/NXP...", {
  headers: { "X-API-Key": "${result.api_key_prefix}...", "X-Account-Token": "jwt..." }
});

# Python
import requests
requests.get("$API/chain/stats", headers={"X-API-Key": "${result.api_key_prefix}..."})`}
            </pre>
            <p className="mt-3 text-sm text-white/80">Docs: {result.docs_url}</p>
            <p className="mt-2 text-sm text-white/65">SDK note: official {sdkRoadmap.join(" and ")} packages are in progress. Use REST endpoints for now.</p>
          </Card>
        </>
      ) : null}
    </main>
  );
}
