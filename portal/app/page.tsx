"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";

import { api } from "@/lib/api";
import { bankingPlans, developerPlans, sdkRoadmap } from "@/lib/subscriptions";

type ChainStats = {
  chain_height: number;
  total_transactions: number;
  total_accounts: number;
  network_status: string;
};

type Tilt = {
  x: number;
  y: number;
};

const txRows = [
  { label: "Transfer to ABC Shop", amount: "-TND 82.500", tone: "negative" },
  { label: "Salary payout", amount: "+TND 2,140.000", tone: "positive" },
  { label: "Utility bill", amount: "-TND 124.230", tone: "negative" },
] as const;

export default function LandingPage() {
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });
  const [grainStrength, setGrainStrength] = useState<"off" | "soft" | "strong">("soft");
  const starterPlan = developerPlans.find((plan) => plan.id === "starter") ?? developerPlans[0];
  const bankScalePlan = bankingPlans.find((plan) => plan.id === "bank-scale") ?? bankingPlans[0];

  useEffect(() => {
    api
      .get("/chain/stats")
      .then((res) => setStats(res.data))
      .catch(() => {
        setStats(null);
      });
  }, []);

  const heroVars = useMemo(
    () =>
      ({
        "--grain-opacity": grainStrength === "off" ? "0" : grainStrength === "soft" ? "0.14" : "0.28",
        "--tilt-x": `${tilt.x.toFixed(2)}deg`,
        "--tilt-y": `${tilt.y.toFixed(2)}deg`,
      }) as CSSProperties,
    [grainStrength, tilt.x, tilt.y],
  );

  function onTiltMove(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -14, y: px * 16 });
  }

  function onTiltLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <main className="mx-auto max-w-[1260px] px-4 py-8 md:py-10">
      <section className="pro-hero animate-rise" style={heroVars}>
        <div className="hero-noise" />

        <div className="hero-layout">
          <div className="hero-left">
            <p className="hero-tag">Built for modern banking in Tunisia</p>
            <h1 className="hero-title">
              Let&apos;s start
              <br />
              something big
              <br />
              together
            </h1>
            <p className="hero-subtitle">
              Real-time payments, instant account actions, and installment-ready transactions in one professional dashboard.
            </p>

            <div className="hero-actions">
              <Link href="/login" className="neo-btn neo-btn--primary">
                Connect now
              </Link>
              <Link href="/login" className="neo-btn neo-btn--dark">
                Open web app
              </Link>
            </div>

        
          </div>

          <div className="hero-center" onMouseMove={onTiltMove} onMouseLeave={onTiltLeave}>
            <div className="card-stack-3d">
              <div className="pro-card pro-card-back" />
              <div className="pro-card pro-card-mid" />
              <div className="pro-card pro-card-front">
                <div className="card-chip" />
                <p className="card-brand">NexaPay Premium</p>
                <p className="card-number">5224 4544 0845 XXXX</p>
                <div className="card-meta">
                  <span>05/29</span>
                  <span>VISA</span>
                </div>
              </div>
            </div>
          </div>

          <aside className="hero-right">
            <Metric title="active users" value={stats ? `${stats.total_accounts}` : "..."} />
            <Metric title="transactions" value={stats ? `${stats.total_transactions}` : "..."} />
            <Metric title="chain height" value={stats ? `${stats.chain_height}` : "..."} />
          </aside>
        </div>

        <div className="hero-footer-strip">
          <div>
            <p className="strip-index">01</p>
            <p className="strip-label">Flexible invoicing</p>
          </div>
          <div>
            <p className="strip-index strip-index-alt">02</p>
            <p className="strip-label">Global acceptance</p>
          </div>
          <div>
            <p className="strip-label strip-cta">Access our finance platform</p>
            <p className="strip-muted">Web app · Secure login</p>
          </div>
        </div>
      </section>

      <section className="platform-story mt-8">
        <div className="story-head">
          <p className="story-kicker">NexaPay ecosystem</p>
          <h2 className="story-title">Blockchain rails that transform how money moves</h2>
          <p className="story-copy">
            Built on permissioned blockchain infrastructure, NexaPay gives users instant money movement and gives institutions secure programmable finance without legacy friction.
          </p>
        </div>

        <div className="story-grid">
          <article className="story-card story-card-user">
            <p className="story-card-tag">For everyday users</p>
            <h3>Instant P2P, online payments, and loan requests without paperwork.</h3>
            <p>
              Send money in seconds, pay online from your wallet, and request a loan from your dashboard with digital onboarding instead of branch visits and paper files.
            </p>

            <div className="story-mini-list">
              {txRows.map((item) => (
                <div className="story-tx" key={item.label}>
                  <span>{item.label}</span>
                  <strong className={item.tone === "positive" ? "tx-pos" : "tx-neg"}>{item.amount}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="story-card story-card-wallet">
            <p className="story-card-tag">Wallet + e-sign contracts</p>
            <h3>Execute agreements digitally and keep settlement linked to your wallet.</h3>
            <p>
              Issue and sign payment agreements, lending terms, and business contracts with e-sign workflows, then settle against blockchain-audited balances.
            </p>
            <div className="story-pill-row">
              <span>Identity verified</span>
              <span>Contract signed</span>
              <span>Settlement posted</span>
            </div>
          </article>

          <article className="story-card story-card-dev">
            <p className="story-card-tag">For developers</p>
            <h3>Join as a builder and ship payment flows fast.</h3>
            <p>
              Use APIs for accounts, transfers, loans, and checkout to embed financial capabilities directly into your platform.
            </p>
            <Link href="/dev" className="story-link">Open developer portal</Link>
          </article>

          <article className="story-card story-card-bank">
            <p className="story-card-tag">For banks and partners</p>
            <h3>Digitize onboarding and lending with less operational overhead.</h3>
            <p>
              Connect your bank to permissioned rails, automate verification, and offer faster lending decisions with reduced compliance and paperwork friction.
            </p>
            <Link href="/bank" className="story-link">Open bank portal</Link>
          </article>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-white/10 bg-[radial-gradient(760px_280px_at_0%_-20%,rgba(255,143,90,0.2),rgba(255,143,90,0)),linear-gradient(160deg,#10172b,#090d18)] p-6 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/55">Billing and subscriptions</p>
            <h2 className="mt-3 font-[var(--font-sora)] text-3xl font-semibold leading-tight">One pricing hub for developers and banks</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75 md:text-base">
              Start with the payment gateway now, then scale into full partner operations. Official SDKs are coming soon for {sdkRoadmap.join(" and ")}.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/subscription" className="neo-btn neo-btn--primary">
                Open subscription center
              </Link>
              <Link href="/dev" className="neo-btn neo-btn--dark">
                Build with APIs
              </Link>
              <Link href="/bank" className="neo-btn neo-btn--ghost">
                Partner as a bank
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/55">Developers</p>
              <h3 className="mt-2 text-lg font-semibold">{starterPlan.name} plan</h3>
              <p className="mt-2 text-sm text-white/70">{starterPlan.description}</p>
              <p className="mt-2 text-sm text-[var(--brand)]">TND {starterPlan.monthlyPrice}/mo</p>
            </article>

            <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/55">Banking</p>
              <h3 className="mt-2 text-lg font-semibold">{bankScalePlan.name} plan</h3>
              <p className="mt-2 text-sm text-white/70">{bankScalePlan.description}</p>
              <p className="mt-2 text-sm text-[#ffb17f]">TND {bankScalePlan.monthlyPrice}/mo</p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="metric-box">
      <p className="metric-value">{value}</p>
      <p className="metric-title">{title}</p>
    </div>
  );
}
