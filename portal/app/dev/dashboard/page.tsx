"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { sdkRoadmap } from "@/lib/subscriptions";

type MerchantRegistration = {
  merchant_id: string;
  merchant_uuid: string;
  api_key: string;
  api_key_prefix: string;
  checkout_base_url: string;
  status: string;
};

type IntentResponse = {
  intent_id: string;
  status: string;
  amount: number;
  currency: string;
  checkout_url: string;
  client_secret: string;
};

type BalanceResponse = {
  gross: number;
  refunded: number;
  payouts: number;
  pending: number;
  available: number;
  currency: string;
};

export default function DeveloperDashboardPage() {
  const [developerKey, setDeveloperKey] = useState("");
  const [merchant, setMerchant] = useState<MerchantRegistration | null>(null);
  const [merchantKey, setMerchantKey] = useState("");
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [snippets, setSnippets] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const activeMerchantKey = useMemo(() => {
    if (merchantKey.trim().length > 0) {
      return merchantKey.trim();
    }
    return merchant?.api_key ?? "";
  }, [merchant?.api_key, merchantKey]);

  async function registerMerchant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusyAction("register-merchant");

    try {
      const form = new FormData(e.currentTarget);
      const { data } = await api.post<MerchantRegistration>(
        "/gateway/v1/merchants/register",
        {
          name: form.get("name"),
          business_name: form.get("business_name"),
          support_email: form.get("support_email"),
          webhook_url: form.get("webhook_url") || undefined,
        },
        {
          headers: { "X-API-Key": developerKey },
        }
      );
      setMerchant(data);
      setMerchantKey(data.api_key);
      setIntent(null);
      setBalance(null);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to register merchant");
    } finally {
      setBusyAction(null);
    }
  }

  async function createIntent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusyAction("create-intent");

    try {
      const form = new FormData(e.currentTarget);
      const amount = Number(form.get("amount") ?? 0);

      const { data } = await api.post<IntentResponse>(
        "/gateway/v1/intents",
        {
          amount,
          currency: form.get("currency") || "TND",
          description: form.get("description") || undefined,
          customer_email: form.get("customer_email") || undefined,
          customer_name: form.get("customer_name") || undefined,
          idempotency_key: form.get("idempotency_key") || undefined,
        },
        {
          headers: { "X-API-Key": activeMerchantKey },
        }
      );

      setIntent(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to create intent");
    } finally {
      setBusyAction(null);
    }
  }

  async function loadBalance() {
    setError(null);
    setBusyAction("load-balance");
    try {
      const { data } = await api.get<BalanceResponse>("/gateway/v1/balance", {
        headers: { "X-API-Key": activeMerchantKey },
      });
      setBalance(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to load balance");
    } finally {
      setBusyAction(null);
    }
  }

  async function loadSnippets() {
    setError(null);
    setBusyAction("load-snippets");

    try {
      const { data } = await api.get<{ snippets: Record<string, string> }>("/dev/docs/snippets", {
        headers: { "X-API-Key": developerKey },
      });
      setSnippets(data.snippets);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to load snippets");
    } finally {
      setBusyAction(null);
    }
  }

  const inputClass = "h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">Gateway Console</p>
          <h1 className="font-[var(--font-sora)] text-3xl font-semibold text-white">Developer Dashboard</h1>
          <p className="mt-2 text-sm text-white/70">
            Payment gateway is live now. Official SDKs coming soon: {sdkRoadmap.join(" and ")}.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/subscription">
            <Button variant="accent">Billing and subscriptions</Button>
          </Link>
          <Link href="/dev">
            <Button variant="ghost">Back to developer portal</Button>
          </Link>
        </div>
      </div>

      <Card className="mt-5 p-6">
        <h2 className="text-lg font-semibold">Developer API Key</h2>
        <p className="mt-1 text-sm text-white/65">
          Use your developer key to register merchants and access docs snippets.
        </p>
        <input
          className="mt-3 h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 font-mono text-sm text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]"
          placeholder="nxp_developer_..."
          value={developerKey}
          onChange={(e) => setDeveloperKey(e.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <Button onClick={loadSnippets} disabled={!developerKey || busyAction !== null}>
            {busyAction === "load-snippets" ? "Loading..." : "Load Docs Snippets"}
          </Button>
        </div>
      </Card>

      <Card className="mt-4 p-6">
        <h2 className="text-lg font-semibold">Register Merchant</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={registerMerchant}>
          <input name="name" className={inputClass} placeholder="Nexa Store" required />
          <input
            name="business_name"
            className={inputClass}
            placeholder="Nexa Store SARL"
          />
          <input
            name="support_email"
            className={inputClass}
            placeholder="support@nexastore.tn"
            required
          />
          <input
            name="webhook_url"
            className={inputClass}
            placeholder="https://merchant.tn/webhooks/nexapay"
          />
          <Button className="md:col-span-2" disabled={!developerKey || busyAction !== null}>
            {busyAction === "register-merchant" ? "Registering..." : "Register Merchant"}
          </Button>
        </form>
      </Card>

      {merchant ? (
        <Card className="mt-4 p-6">
          <p className="text-xs uppercase tracking-[0.25em] text-white/45">Merchant Credentials</p>
          <p className="mt-2 text-sm">Merchant: <b>{merchant.merchant_id}</b></p>
          <p className="mt-2 break-all rounded-lg bg-black/45 px-3 py-2 font-mono text-sm text-[#7dffbe]">{merchant.api_key}</p>
          <p className="mt-2 text-xs text-white/65">Store this key securely. It can create charges, refunds, and payouts.</p>
        </Card>
      ) : null}

      <Card className="mt-4 p-6">
        <h2 className="text-lg font-semibold">Merchant Key Override</h2>
        <input
          className="mt-3 h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 font-mono text-sm text-white placeholder:text-white/45 outline-none focus:border-[var(--brand)]"
          placeholder="Optional: paste another merchant key"
          value={merchantKey}
          onChange={(e) => setMerchantKey(e.target.value)}
        />
      </Card>

      <Card className="mt-4 p-6">
        <h2 className="text-lg font-semibold">Create Payment Intent</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={createIntent}>
          <input name="amount" type="number" min="1" className={inputClass} placeholder="42000" required />
          <input name="currency" className={inputClass} placeholder="TND" defaultValue="TND" />
          <input name="customer_name" className={inputClass} placeholder="Customer name" />
          <input name="customer_email" className={inputClass} placeholder="customer@email.tn" />
          <input name="description" className={`${inputClass} md:col-span-2`} placeholder="Order #42" />
          <input
            name="idempotency_key"
            className={`${inputClass} md:col-span-2`}
            placeholder="order-42-attempt-1"
          />
          <Button className="md:col-span-2" disabled={!activeMerchantKey || busyAction !== null}>
            {busyAction === "create-intent" ? "Creating..." : "Create Intent"}
          </Button>
        </form>
      </Card>

      {intent ? (
        <Card className="mt-4 p-6">
          <h3 className="text-lg font-semibold">Intent Created</h3>
          <p className="mt-2 text-sm">ID: <b>{intent.intent_id}</b></p>
          <p className="mt-1 text-sm">Status: {intent.status}</p>
          <p className="mt-1 text-sm">Amount: {intent.amount} {intent.currency}</p>
          <a className="mt-3 inline-block text-sm font-semibold text-[var(--brand)] underline" href={intent.checkout_url} target="_blank" rel="noreferrer">
            Open Checkout Page
          </a>
        </Card>
      ) : null}

      <Card className="mt-4 p-6">
        <h2 className="text-lg font-semibold">Balance Snapshot</h2>
        <Button className="mt-3" onClick={loadBalance} disabled={!activeMerchantKey || busyAction !== null}>
          {busyAction === "load-balance" ? "Loading..." : "Load Balance"}
        </Button>
        {balance ? (
          <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
            <p>Gross: <b>{balance.gross}</b> {balance.currency}</p>
            <p>Refunded: <b>{balance.refunded}</b> {balance.currency}</p>
            <p>Payouts: <b>{balance.payouts}</b> {balance.currency}</p>
            <p>Pending: <b>{balance.pending}</b> {balance.currency}</p>
            <p>Available: <b>{balance.available}</b> {balance.currency}</p>
          </div>
        ) : null}
      </Card>

      {snippets ? (
        <Card className="mt-4 p-6">
          <h2 className="text-lg font-semibold">Snippets</h2>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-black/45 p-4 text-xs text-white/85">
{Object.entries(snippets)
  .map(([k, v]) => `${k}\n${v}`)
  .join("\n\n")}
          </pre>
        </Card>
      ) : null}

      {error ? <p className="mt-4 text-sm text-ember">{error}</p> : null}
    </main>
  );
}