"use client";

import { useEffect, useState } from "react";
import { Activity, Check, Clock, Server, Shield, Zap } from "lucide-react";

const VALIDATORS = [
  { id: 1, url: "https://validator-1.nexapay.space", color: "#00d4aa" },
  { id: 2, url: "https://validator-2.nexapay.space", color: "#4fc3f7" },
  { id: 3, url: "https://validator-3.nexapay.space", color: "#ffb74d" },
  { id: 4, url: "https://validator-4.nexapay.space", color: "#ef5350" },
];

interface ValidatorState {
  online: boolean;
  height: number;
  activeValidators: number;
  quorum: number;
  latency: number;
  error?: string;
}

export default function StatusPage() {
  const [states, setStates] = useState<Record<number, ValidatorState>>({});
  const [lastUpdate, setLastUpdate] = useState("");

  const fetchAll = async () => {
    const results: Record<number, ValidatorState> = {};
    await Promise.all(
      VALIDATORS.map(async (v) => {
        const start = Date.now();
        try {
          const [ready, metrics] = await Promise.all([
            fetch(`${v.url}/ready`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()),
            fetch(`${v.url}/metrics`, { signal: AbortSignal.timeout(5000) }).then((r) => r.text()),
          ]);
          const lat = Date.now() - start;

          const chain = ready.checks?.chain || "";
          const hMatch = chain.match(/height=(\d+)/);
          const vMatch = chain.match(/validators=(\d+)/);

          results[v.id] = {
            online: true,
            height: hMatch ? parseInt(hMatch[1]) : 0,
            activeValidators: vMatch ? parseInt(vMatch[1].split("/")[0]) : 0,
            quorum: metrics.includes("nexapay_quorum_size")
              ? parseInt(metrics.match(/nexapay_quorum_size\s+(\d+)/)?.[1] || "0")
              : 0,
            latency: Math.round(lat),
          };
        } catch {
          results[v.id] = { online: false, height: 0, activeValidators: 0, quorum: 0, latency: 0, error: "unreachable" };
        }
      })
    );
    setStates(results);
    setLastUpdate(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, []);

  const allOnline = Object.values(states).filter((s) => s.online).length;
  const maxHeight = Math.max(...Object.values(states).map((s) => s.height), 0);
  const quorum = Object.values(states)[0]?.quorum || 0;

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="mx-auto max-w-[1000px] px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">NexaPay Status</h1>
            <p className="mt-1 text-sm text-white/40">
              BFT Validator Network — {allOnline}/{VALIDATORS.length} online
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/30">
            <span>Updated: {lastUpdate || "..."}</span>
            <span className="animate-pulse text-[#00d4aa]">● Live</span>
          </div>
        </div>

        {/* Network summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { icon: Server, label: "Validators Online", value: `${allOnline}/4`, color: "#00d4aa" },
            { icon: Shield, label: "Quorum", value: `${quorum}/4`, color: "#4fc3f7" },
            { icon: Activity, label: "Max Height", value: maxHeight.toLocaleString(), color: "#ffb74d" },
            { icon: Zap, label: "Poll Interval", value: "5s", color: "#ef5350" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/[0.06] bg-[#0d0d0d] p-4">
              <s.icon className="h-4 w-4 mb-2" style={{ color: s.color }} />
              <p className="text-[11px] text-white/40">{s.label}</p>
              <p className="text-lg font-bold" style={{ color: s.color }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Validator cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {VALIDATORS.map((v) => {
            const s = states[v.id];
            if (!s) return <ValidatorCardSkeleton key={v.id} id={v.id} color={v.color} />;
            return (
              <ValidatorCard
                key={v.id}
                id={v.id}
                url={v.url}
                color={v.color}
                state={s}
                maxHeight={maxHeight}
              />
            );
          })}
        </div>

        {/* How BFT works */}
        <div className="mt-12 rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-6">
          <h3 className="text-sm font-semibold mb-4">How BFT Consensus Works</h3>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {VALIDATORS.map((v, i) => (
              <span key={v.id}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] px-3 py-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: v.color }} />
                  Validator {v.id}
                </span>
                {i < VALIDATORS.length - 1 && <span className="mx-2 text-white/20">→</span>}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/30 text-center leading-relaxed max-w-[600px] mx-auto">
            Every block must be signed by {quorum} out of 4 validators (2/3 + 1).
            If a validator disagrees or goes offline, the network continues.
            All 4 share the same Neon PostgreSQL database.
          </p>
        </div>
      </div>
    </div>
  );
}

function ValidatorCard({
  id,
  url,
  color,
  state,
  maxHeight,
}: {
  id: number;
  url: string;
  color: string;
  state: ValidatorState;
  maxHeight: number;
}) {
  const behind = maxHeight - state.height;
  const synced = behind < 5;

  return (
    <div
      className="rounded-2xl border p-5 transition-all"
      style={{
        borderColor: state.online ? `${color}20` : "rgba(255,255,255,0.04)",
        background: state.online ? "#0d0d0d" : "#0a0a0a",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="h-3 w-3 rounded-full animate-pulse"
            style={{ backgroundColor: state.online ? color : "#555" }}
          />
          <span className="font-semibold text-sm">Validator {id}</span>
          {state.online ? (
            <span className="text-[10px] text-[#00d4aa] font-medium">ONLINE</span>
          ) : (
            <span className="text-[10px] text-red-500 font-medium">OFFLINE</span>
          )}
        </div>
        <span className="text-[11px] text-white/25">{state.latency}ms</span>
      </div>

      {/* Metrics */}
      {state.online ? (
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Block Height" value={state.height.toLocaleString()} />
          <Metric
            label="Sync"
            value={synced ? "Synced" : `-${behind}`}
            color={synced ? "#00d4aa" : "#ffb74d"}
          />
          <Metric label="Active Validators" value={String(state.activeValidators)} />
          <Metric label="Quorum" value={`${state.quorum}`} />
        </div>
      ) : (
        <p className="text-xs text-red-400/60">Unreachable — check server</p>
      )}

      {/* URL */}
      <p className="mt-3 text-[10px] text-white/15 truncate">{url}</p>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] text-white/30">{label}</p>
      <p className="text-sm font-bold" style={{ color: color || "#fff" }}>
        {value}
      </p>
    </div>
  );
}

function ValidatorCardSkeleton({ id, color }: { id: number; color: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.04] bg-[#0a0a0a] p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <div className="h-4 w-24 rounded bg-white/[0.04]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg bg-white/[0.02] px-3 py-2">
            <div className="h-3 w-12 rounded bg-white/[0.04] mb-1" />
            <div className="h-5 w-16 rounded bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}
