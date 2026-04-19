"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function CheckoutIntentPage() {
  const params = useParams<{ intent_id: string }>();
  const intentId = params.intent_id;

  const [merchantKey, setMerchantKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; redirect_url?: string; failure_reason?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData(e.currentTarget);

    try {
      const { data } = await api.post(
        `/gateway/v1/intents/${intentId}/confirm`,
        {
          card_number: form.get("card_number"),
          expiry_month: form.get("expiry_month"),
          expiry_year: form.get("expiry_year"),
          cvv: form.get("cvv"),
          pin: form.get("pin"),
          card_holder_name: form.get("card_holder_name"),
        },
        {
          headers: merchantKey ? { "X-API-Key": merchantKey } : undefined,
        }
      );

      setResult(data);

      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Payment confirmation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs uppercase tracking-[0.3em] text-ink/45">NexaPay Checkout</p>
      <h1 className="mt-2 font-[var(--font-sora)] text-3xl font-semibold">Secure Payment</h1>
      <p className="mt-2 text-sm text-ink/65">Intent ID: <span className="font-mono">{intentId}</span></p>

      <Card className="mt-6 p-6">
        <div className="mb-4 rounded-xl border border-ink/10 bg-ink/5 p-3 text-sm">
          <p className="font-semibold">Testing cards</p>
          <p className="mt-1">Success: <span className="font-mono">4242424242424242</span> (PIN <span className="font-mono">1234</span>)</p>
          <p>Success: <span className="font-mono">5555555555554444</span> (PIN <span className="font-mono">1234</span>)</p>
          <p>Fail: <span className="font-mono">4000000000000002</span> (PIN <span className="font-mono">1234</span>)</p>
        </div>
        <form className="grid gap-3" onSubmit={pay}>
          <input
            name="card_holder_name"
            className="h-10 rounded-xl border border-ink/15 px-3"
            placeholder="Card holder name"
            required
          />
          <input
            name="card_number"
            className="h-10 rounded-xl border border-ink/15 px-3"
            placeholder="4242 4242 4242 4242"
            required
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="expiry_month" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="MM" required />
            <input name="expiry_year" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="YYYY" required />
            <input name="cvv" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="CVV" required />
          </div>
          <input name="pin" className="h-10 rounded-xl border border-ink/15 px-3" placeholder="4-digit PIN" required />

          <details className="rounded-xl border border-ink/10 p-3 text-sm text-ink/65">
            <summary className="cursor-pointer font-semibold text-ink">Merchant Key (optional)</summary>
            <input
              className="mt-2 h-10 w-full rounded-xl border border-ink/15 px-3 font-mono text-sm"
              placeholder="X-API-Key for merchant-owned confirmation"
              value={merchantKey}
              onChange={(e) => setMerchantKey(e.target.value)}
            />
          </details>

          <Button disabled={loading}>{loading ? "Processing..." : "Pay Now"}</Button>
        </form>
      </Card>

      {result ? (
        <Card className="mt-4 p-4 text-sm">
          <p>Status: <b>{result.status}</b></p>
          {result.failure_reason ? <p className="mt-1 text-ember">Reason: {result.failure_reason}</p> : null}
        </Card>
      ) : null}

      {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}

      <div className="mt-6">
        <Link href="/dev/dashboard" className="text-sm font-semibold text-tide underline">
          Back to Developer Dashboard
        </Link>
      </div>
    </main>
  );
}
