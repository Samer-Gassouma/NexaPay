"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { bankingPlans } from "@/lib/subscriptions";

type BankRegisterResponse = {
  bank_id: string;
  chain_address: string;
  api_key: string;
  api_key_prefix: string;
  subscription: string;
  message: string;
};

type NetworkStats = {
  total_accounts: number;
  total_banks: number;
  total_developers: number;
  total_transactions: number;
  total_volume_tnd: string;
  chain_height: number;
  network_status: string;
};

export default function BankPage() {
  const [apiKey, setApiKey] = useState<string>("");
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function registerBank(formData: FormData) {
    setError(null);
    try {
      const { data } = await api.post<BankRegisterResponse>("/network/banks/register", {
        bank_name: formData.get("bank_name"),
        bank_code: formData.get("bank_code"),
        contact_email: formData.get("contact_email"),
        contact_name: formData.get("contact_name"),
      });

      setApiKey(data.api_key);
      const statsRes = await api.get<NetworkStats>("/network/stats", {
        headers: { "X-API-Key": data.api_key },
      });
      setStats(statsRes.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to register bank");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-[var(--font-sora)] text-3xl font-semibold text-white">Bank Partner Portal</h1>
      <p className="mt-3 max-w-2xl text-sm text-white/75 md:text-base">
        Join NexaPay rails to run faster onboarding, settlement, and lending workflows with permissioned blockchain controls.
      </p>
      <div className="mt-4">
        <Link href="/subscription" className="text-sm font-semibold text-[#ffb17f] underline underline-offset-4">
          Compare banking billing tiers
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {bankingPlans.map((plan) => (
          <Card key={plan.id} className="relative p-5">
            {plan.highlight ? (
              <p className="absolute right-4 top-4 rounded-full border border-[#ff8d4d]/35 bg-[#ff8d4d]/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffb17f]">
                {plan.highlight}
              </p>
            ) : null}
            <p className="text-xs uppercase tracking-[0.25em] text-white/55">{plan.name}</p>
            <p className="mt-2 text-xl font-semibold">
              {plan.monthlyPrice === null ? "Custom" : `TND ${plan.monthlyPrice}/mo`}
            </p>
            <p className="mt-1 text-xs text-white/55">{plan.priceLabel}</p>
            <p className="mt-3 text-sm text-white/72">{plan.description}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold">Register your bank</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          action={async (fd) => {
            await registerBank(fd);
          }}
        >
          <input name="bank_name" className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]" placeholder="Easy Bank" />
          <input name="bank_code" className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]" placeholder="07" />
          <input name="contact_name" className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]" placeholder="Yassine Ben Salem" />
          <input name="contact_email" className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]" placeholder="tech@easybank.tn" />
          <Button className="md:col-span-2">Register Bank</Button>
        </form>
        {error ? <p className="mt-3 text-sm text-[#ff8d4d]">{error}</p> : null}
      </Card>

      {apiKey ? (
        <Card className="mt-4 p-6">
          <p className="text-xs uppercase tracking-[0.25em] text-white/55">API Key (show once)</p>
          <p className="mt-2 break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-sm text-[#7dffbe]">{apiKey}</p>
        </Card>
      ) : null}

      {stats ? (
        <Card className="mt-4 p-6">
          <h3 className="text-lg font-semibold">Partner Stats</h3>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
            <p>Accounts: {stats.total_accounts}</p>
            <p>Transactions: {stats.total_transactions}</p>
            <p>Volume (TND): {stats.total_volume_tnd}</p>
          </div>
        </Card>
      ) : null}

      <Card className="mt-4 p-6">
        <h3 className="text-lg font-semibold">Integration Guide</h3>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-white/85">
{`curl -X GET "$API/network/stats" \\
  -H "X-API-Key: nxp_bank_xxx"`}
        </pre>
        <p className="mt-3 text-sm text-white/70">Billing, rollout timelines, and enterprise controls are managed from the subscription center.</p>
      </Card>
    </main>
  );
}
