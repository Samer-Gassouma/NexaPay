"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

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
      <h1 className="font-[var(--font-sora)] text-3xl font-semibold">Bank Partner Portal</h1>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold">Register your bank</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          action={async (fd) => {
            await registerBank(fd);
          }}
        >
          <input name="bank_name" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="Easy Bank" />
          <input name="bank_code" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="07" />
          <input name="contact_name" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="Yassine Ben Salem" />
          <input name="contact_email" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="tech@easybank.tn" />
          <Button className="md:col-span-2">Register Bank</Button>
        </form>
        {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      </Card>

      {apiKey ? (
        <Card className="mt-4 p-6">
          <p className="text-xs uppercase tracking-[0.25em] text-ink/45">API Key (show once)</p>
          <p className="mt-2 break-all rounded-lg bg-ink px-3 py-2 font-mono text-sm text-paper">{apiKey}</p>
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
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-paper">
{`curl -X GET "$API/network/stats" \\
  -H "X-API-Key: nxp_bank_xxx"`}
        </pre>
      </Card>
    </main>
  );
}
