"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

type LoanResult = {
  loan_id: string;
  score: number;
  score_breakdown: {
    base: number;
    transaction_history: number;
    account_age: number;
    balance_score: number;
  };
  status: "approved" | "rejected";
  amount_display: string;
  interest_rate: string;
  due_date: string;
  contract_hash: string;
  message: string;
};

export default function LoanPage() {
  const [borrower, setBorrower] = useState("");
  const [token, setToken] = useState("");
  const [amountTnd, setAmountTnd] = useState(1000);
  const [result, setResult] = useState<LoanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountMillimes = useMemo(() => amountTnd * 1000, [amountTnd]);

  async function checkEligibility() {
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post<LoanResult>(
          "/loans/request",
          {
            borrower,
            amount: amountMillimes,
            purpose: "Business working capital",
          },
          { headers: { "X-Account-Token": token } }
        );
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to evaluate loan");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-[var(--font-sora)] text-3xl font-semibold">Loan Request</h1>
      <p className="mt-2 text-sm text-ink/65">Score-based lending on auditable on-chain history.</p>

      <Card className="mt-6 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          
          <input
            className="h-10 rounded-xl border border-ink/15 px-3"
            placeholder="Borrower address (NXP...)"
            value={borrower}
            onChange={(e) => setBorrower(e.target.value)}
          />
          <input
            className="h-10 rounded-xl border border-ink/15 px-3"
            placeholder="X-Account-Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>

        <div className="mt-6">
          <label className="text-sm font-medium">Amount: {amountTnd.toLocaleString()} TND</label>
          <input
            className="mt-2 w-full"
            type="range"
            min={500}
            max={5000}
            step={100}
            value={amountTnd}
            onChange={(e) => setAmountTnd(Number(e.target.value))}
          />
        </div>

        <Button className="mt-5" onClick={checkEligibility}>
          Check Eligibility
        </Button>

        {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      </Card>

      {result ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-ink/45">Score</p>
            <div
              className="mt-4 grid h-40 w-40 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--tide) ${result.score * 3.6}deg, #d6d4cf 0deg)`,
              }}
            >
              <div className="grid h-32 w-32 place-items-center rounded-full bg-white text-3xl font-bold">
                {result.score}
              </div>
            </div>
            <ul className="mt-4 space-y-1 text-sm text-ink/70">
              <li>Base: {result.score_breakdown.base}</li>
              <li>Transaction history: {result.score_breakdown.transaction_history}</li>
              <li>Account age: {result.score_breakdown.account_age}</li>
              <li>Balance score: {result.score_breakdown.balance_score}</li>
            </ul>
          </Card>

          <Card className="p-6">
            <p className="text-lg font-semibold">{result.status.toUpperCase()}</p>
            <p className="mt-2 text-sm">Amount: {result.amount_display}</p>
            <p className="text-sm">Interest: {result.interest_rate}</p>
            <p className="text-sm">Due date: {result.due_date}</p>
            <p className="mt-2 break-all text-xs text-ink/60">Contract hash: {result.contract_hash}</p>
            <p className="mt-3 text-sm">{result.message}</p>
            {result.status === "approved" ? (
              <Button className="mt-4">Sign Contract</Button>
            ) : null}
          </Card>
        </div>
      ) : null}
    </main>
  );
}
