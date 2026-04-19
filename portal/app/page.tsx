"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

type ChainStats = {
  chain_height: number;
  total_transactions: number;
  total_accounts: number;
  network_status: string;
};

export default function LandingPage() {
  const [stats, setStats] = useState<ChainStats | null>(null);

  useEffect(() => {
    api
      .get("/chain/stats")
      .then((res) => setStats(res.data))
      .catch(() => {
        setStats(null);
      });
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:py-14">
      <section className="animate-rise rounded-3xl border border-ink/10 bg-white/70 p-8 backdrop-blur md:p-12">
        <p className="text-xs uppercase tracking-[0.34em] text-ink/50">NexaPay Network</p>
        <h1 className="mt-4 max-w-2xl font-[var(--font-sora)] text-4xl font-semibold leading-tight md:text-6xl">
          Banking-grade trust rails for real TND settlement.
        </h1>
        <p className="mt-5 max-w-3xl text-base text-ink/70 md:text-lg">
          Permissioned blockchain infrastructure for banks, developers, and audited payment flows. No token,
          no coin, no speculation.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register">
            <Button size="lg">Open Account</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="ghost">
              Login
            </Button>
          </Link>
          <Link href="/bank">
            <Button size="lg" variant="accent">
              For Banks
            </Button>
          </Link>
          <Link href="/dev">
            <Button size="lg" variant="ghost">
              For Developers
            </Button>
          </Link>
          <Link href="/dev/dashboard">
            <Button size="lg" variant="accent">
              Gateway Dashboard
            </Button>
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <StatCard label="Chain Height" value={stats ? String(stats.chain_height) : "..."} />
        <StatCard label="Accounts" value={stats ? String(stats.total_accounts) : "..."} />
        <StatCard
          label="Transactions"
          value={stats ? String(stats.total_transactions) : "..."}
        />
        <StatCard label="Status" value={stats?.network_status ?? "loading"} />
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <FeatureCard
          title="Trust Layer"
          text="PoA validator model with immutable blocks and signed state roots."
        />
        <FeatureCard
          title="Bridge API"
          text="Axum APIs for identity, transfers, loans, and partner integrations."
        />
        <FeatureCard
          title="Portal"
          text="Unified dashboards for account holders, banks, and developers."
        />
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-ink/45">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <Card className="p-6">
      <h2 className="font-[var(--font-sora)] text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-ink/70">{text}</p>
    </Card>
  );
}
