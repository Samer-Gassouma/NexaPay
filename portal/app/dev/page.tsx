"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

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
      <h1 className="font-[var(--font-sora)] text-3xl font-semibold">Developer Portal</h1>
      <div className="mt-3">
        <Link href="/dev/dashboard" className="text-sm font-semibold text-tide underline">
          Open Gateway Dashboard
        </Link>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold">Register</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          action={async (fd) => {
            await register(fd);
          }}
        >
          <input name="company_name" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="Startup XYZ" />
          <input name="contact_name" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="Founder Name" />
          <input name="email" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="dev@startup.tn" />
          <select name="plan" className="h-10 rounded-xl border border-ink/15 px-3">
            <option value="free">free</option>
            <option value="starter">starter</option>
            <option value="pro">pro</option>
          </select>
          <Button className="md:col-span-2">Get API Key</Button>
        </form>
        {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      </Card>

      {result ? (
        <>
          <Card className="mt-4 p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-ink/45">API Key</p>
            <p className="mt-2 break-all rounded-lg bg-ink px-3 py-2 font-mono text-sm text-paper">{result.api_key}</p>
            <p className="mt-2 text-sm">
              Plan: <b>{result.plan}</b> | Limit: <b>{result.call_limit}</b> calls/day
            </p>
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
            <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-paper">
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
            <p className="mt-3 text-sm">Docs: {result.docs_url}</p>
          </Card>
        </>
      ) : null}
    </main>
  );
}
