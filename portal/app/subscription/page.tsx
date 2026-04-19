"use client";

import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  bankingPlans,
  developerPlans,
  sdkRoadmap,
  type BillingCycle,
  type SubscriptionPlan,
} from "@/lib/subscriptions";

function formatPlanPrice(plan: SubscriptionPlan, cycle: BillingCycle) {
  const price = cycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;

  if (price === null) {
    return "Custom";
  }

  if (price === 0) {
    return "TND 0/mo";
  }

  const suffix = cycle === "monthly" ? "/mo" : "/mo (annual)";
  return `TND ${price}${suffix}`;
}

export default function SubscriptionPage() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="rounded-3xl border border-white/15 bg-[radial-gradient(900px_340px_at_100%_-20%,rgba(45,230,196,0.18),rgba(45,230,196,0)),linear-gradient(150deg,#111828,#090d17)] p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-white/55">Billing and subscriptions</p>
        <h1 className="mt-3 font-[var(--font-sora)] text-3xl font-semibold text-white md:text-4xl">Plans for developers and banks</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/75 md:text-base">
          NexaPay payment gateway is live now with production APIs and merchant operations.
          Official SDKs are next on the roadmap: {sdkRoadmap.join(" and ")}.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-white/15 bg-white/[0.03] p-1">
            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                cycle === "monthly"
                  ? "bg-[var(--brand)] text-[#022117]"
                  : "text-white/70 hover:text-white"
              }`}
              onClick={() => setCycle("monthly")}
            >
              Monthly billing
            </button>
            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                cycle === "annual"
                  ? "bg-[var(--brand)] text-[#022117]"
                  : "text-white/70 hover:text-white"
              }`}
              onClick={() => setCycle("annual")}
            >
              Annual billing
            </button>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">Transparent pricing · No hidden fees</p>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/55">Developer plans</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Build, launch, and scale with APIs</h2>
          </div>
          <Link href="/dev" className="text-sm font-semibold text-[var(--brand)] underline underline-offset-4">
            Open developer portal
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {developerPlans.map((plan) => (
            <Card key={plan.id} className="relative p-6">
              {plan.highlight ? (
                <p className="absolute right-4 top-4 rounded-full border border-[var(--brand)]/35 bg-[var(--brand)]/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
                  {plan.highlight}
                </p>
              ) : null}

              <p className="text-xs uppercase tracking-[0.25em] text-white/50">{plan.name}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatPlanPrice(plan, cycle)}</p>
              <p className="mt-1 text-xs text-white/60">{plan.priceLabel}</p>
              <p className="mt-3 text-sm text-white/72">{plan.description}</p>

              <ul className="mt-4 space-y-2 text-sm text-white/78">
                {plan.features.map((feature) => (
                  <li key={feature}>- {feature}</li>
                ))}
              </ul>

              <Link href={plan.ctaHref} className="mt-5 inline-flex">
                <Button>{plan.ctaLabel}</Button>
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/55">Banking plans</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Operate partner banking rails with confidence</h2>
          </div>
          <Link href="/bank" className="text-sm font-semibold text-[var(--brand)] underline underline-offset-4">
            Open bank portal
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {bankingPlans.map((plan) => (
            <Card key={plan.id} className="relative p-6">
              {plan.highlight ? (
                <p className="absolute right-4 top-4 rounded-full border border-[#ff8d4d]/35 bg-[#ff8d4d]/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffb17f]">
                  {plan.highlight}
                </p>
              ) : null}

              <p className="text-xs uppercase tracking-[0.25em] text-white/50">{plan.name}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatPlanPrice(plan, cycle)}</p>
              <p className="mt-1 text-xs text-white/60">{plan.priceLabel}</p>
              <p className="mt-3 text-sm text-white/72">{plan.description}</p>

              <ul className="mt-4 space-y-2 text-sm text-white/78">
                {plan.features.map((feature) => (
                  <li key={feature}>- {feature}</li>
                ))}
              </ul>

              <Link href={plan.ctaHref} className="mt-5 inline-flex">
                <Button variant={plan.id === "bank-scale" ? "accent" : "ghost"}>{plan.ctaLabel}</Button>
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
