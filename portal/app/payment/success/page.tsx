import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function PaymentSuccessPage({
  searchParams,
}: {
  searchParams?: { intent_id?: string; status?: string };
}) {
  const intentId = searchParams?.intent_id ?? "unknown";
  const status = searchParams?.status ?? "pending";

  const success = status === "succeeded";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Card className="overflow-hidden p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Payment Result</p>
        <h1 className="mt-3 font-[var(--font-sora)] text-3xl font-semibold">
          {success ? "Payment Confirmed" : "Payment Not Completed"}
        </h1>
        <p className="mt-3 text-sm text-ink/65">
          Intent: <span className="font-mono">{intentId}</span>
        </p>
        <p className="mt-1 text-sm text-ink/65">
          Status: <b>{status}</b>
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/">
            <Button>Back to Home</Button>
          </Link>
          <Link href="/dev/dashboard">
            <Button variant="ghost">Developer Dashboard</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
