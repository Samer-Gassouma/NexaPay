"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Copy,
  CreditCard,
  LogOut,
  RefreshCw,
  ShieldCheck,
  User,
  WalletCards,
} from "lucide-react";

import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import {
  clearDeveloperSession,
  readDeveloperSession,
  writeDeveloperSession,
} from "@/lib/developer-portal";

// Types
type DeveloperProfile = {
  company_name: string;
  contact_name: string;
  email: string;
  plan: string;
  monthly_calls: number;
  call_limit: number;
};

type MerchantSummary = {
  merchant_id: string;
  name: string;
  business_name?: string;
  support_email: string;
  status: string;
  created_at: string;
  gross_volume: number;
  available_balance: number;
};

type OverviewResponse = {
  developer: DeveloperProfile;
  merchants: MerchantSummary[];
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount / 1000);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DeveloperDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState(readDeveloperSession());
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>("");

  const [merchantForm, setMerchantForm] = useState({
    name: "",
    support_email: "",
  });

  const [intentForm, setIntentForm] = useState({
    amount: "42000",
    currency: "TND",
    description: "",
  });

  // Check session on load
  useEffect(() => {
    if (!session) {
      router.replace("/dev");
      return;
    }

    // Ensure developer session token is present
    if (!session!.sessionToken) {
      console.warn(
        "No developer session token in session, redirecting to login",
      );
      router.replace("/dev");
      return;
    }

    loadOverview();
  }, [session, router]);

  async function loadOverview() {
    try {
      setLoading(true);

      if (!session!.sessionToken) {
        throw new Error("No developer session available");
      }

      const { data } = await api.get<OverviewResponse>("/dev/portal/overview", {
        headers: {
          "X-Developer-Token": session!.sessionToken,
        },
      });
      setOverview(data);
      setError(null);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.error || "Failed to load workspace data";
      setError(errorMessage);

      // If authentication error (401), redirect to login
      if (
        err?.response?.status === 401 ||
        errorMessage.toLowerCase().includes("unauthorized") ||
        errorMessage.toLowerCase().includes("invalid")
      ) {
        setTimeout(() => {
          clearDeveloperSession();
          router.replace("/dev");
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  }

  async function registerMerchant(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (!session!.sessionToken) {
        throw new Error("No developer session available");
      }

      const payload = {
        name: merchantForm.name,
        support_email: merchantForm.support_email,
      };

      const { data } = await api.post(
        "/dev/portal/merchants/register",
        payload,
        {
          headers: {
            "X-Developer-Token": session!.sessionToken,
          },
        },
      );

      // Update session with new merchant key
      if (session && data.api_key) {
        const updatedSession = {
          ...session!,
          merchantKeys: {
            ...session!.merchantKeys,
            [data.merchant_id]: data.api_key,
          },
        };
        writeDeveloperSession(updatedSession);
        setSession(updatedSession);
      }

      setMerchantForm({ name: "", support_email: "" });
      await loadOverview();
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.error || "Failed to register merchant";
      setError(errorMessage);

      // If authentication error, redirect to login
      if (
        err?.response?.status === 401 ||
        errorMessage.toLowerCase().includes("unauthorized") ||
        errorMessage.toLowerCase().includes("invalid")
      ) {
        setTimeout(() => {
          clearDeveloperSession();
          router.replace("/dev");
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createIntent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMerchantId) {
      setError("Please select a merchant first");
      return;
    }

    const merchantKey = session!.merchantKeys?.[selectedMerchantId];
    if (!merchantKey) {
      setError("No API key available for selected merchant");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        amount: parseInt(intentForm.amount),
        currency: intentForm.currency,
        description: intentForm.description || undefined,
      };

      const { data } = await api.post("/gateway/v1/intents", payload, {
        headers: {
          "X-API-Key": merchantKey,
        },
      });

      // Show success message
      setError(null);
      alert(`Checkout created! URL: ${data.checkout_url}`);

      setIntentForm({
        amount: "42000",
        currency: "TND",
        description: "",
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.error || "Failed to create payment intent";
      setError(errorMessage);

      // If authentication error, redirect to login
      if (
        err?.response?.status === 401 ||
        errorMessage.toLowerCase().includes("unauthorized") ||
        errorMessage.toLowerCase().includes("invalid")
      ) {
        setTimeout(() => {
          clearDeveloperSession();
          router.replace("/dev");
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyValue(label: string, value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
      setTimeout(() => setCopiedValue(null), 1800);
    } catch (_err) {
      setError("Copy failed. Please copy manually.");
    }
  }

  function logout() {
    clearDeveloperSession();
    router.replace("/dev");
  }

  if (loading && !overview) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#070911] to-[#0b0f1e] p-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-center py-20">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#2de6c4] border-t-transparent" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#070911] to-[#0b0f1e] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Link href="/">
              <BrandLogo size="md" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-white">
                Developer Console
              </h1>
              <p className="text-sm text-white/60">
                {overview?.developer.company_name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadOverview}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </header>

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-red-300">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="text-red-300 hover:text-red-200"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Profile & Merchants */}
          <div className="lg:col-span-2 space-y-6">
            {/* Developer Profile */}
            <Card className="p-6">
              <div className="mb-6 flex items-center gap-3">
                <User className="h-5 w-5 text-[#2de6c4]" />
                <h2 className="text-lg font-semibold text-white">
                  Developer Profile
                </h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Company</span>
                  <span className="font-medium text-white">
                    {overview?.developer.company_name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Contact</span>
                  <span className="font-medium text-white">
                    {overview?.developer.contact_name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Plan</span>
                  <span className="font-medium text-white">
                    {overview?.developer.plan}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">API Usage</span>
                  <span className="font-medium text-white">
                    {overview?.developer.monthly_calls} /{" "}
                    {overview?.developer.call_limit} calls
                  </span>
                </div>
                {session?.developerApiKey && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="mb-2 text-sm text-white/70">API Key</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 overflow-x-auto rounded bg-white/5 px-3 py-2 text-sm text-white/90">
                        {session.developerApiKey}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyValue("api-key", session.developerApiKey!)
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {copiedValue === "api-key" && (
                      <p className="mt-2 text-xs text-emerald-400">Copied!</p>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Merchants List */}
            <Card className="p-6">
              <div className="mb-6 flex items-center gap-3">
                <Building2 className="h-5 w-5 text-[#ffb17f]" />
                <h2 className="text-lg font-semibold text-white">Merchants</h2>
              </div>
              {overview?.merchants.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/20 p-8 text-center">
                  <Building2 className="mx-auto h-12 w-12 text-white/30" />
                  <p className="mt-4 text-white/70">No merchants yet</p>
                  <p className="mt-1 text-sm text-white/50">
                    Create your first merchant below
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {overview?.merchants.map((merchant) => (
                    <div
                      key={merchant.merchant_id}
                      className={`rounded-xl border p-4 transition-colors ${
                        selectedMerchantId === merchant.merchant_id
                          ? "border-[#ff8f5a] bg-[#ff8f5a]/10"
                          : "border-white/10 bg-white/5"
                      }`}
                      onClick={() =>
                        setSelectedMerchantId(merchant.merchant_id)
                      }
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium text-white">
                            {merchant.business_name || merchant.name}
                          </h3>
                          <p className="mt-1 text-sm text-white/60">
                            {merchant.support_email}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/80">
                              {merchant.merchant_id}
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${
                                merchant.status === "active"
                                  ? "bg-emerald-400/20 text-emerald-300"
                                  : "bg-white/10 text-white/80"
                              }`}
                            >
                              {merchant.status}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-white">
                            {formatMoney(merchant.available_balance)} TND
                          </p>
                          <p className="text-sm text-white/60">Available</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right Column - Actions */}
          <div className="space-y-6">
            {/* Create Merchant */}
            <Card className="p-6">
              <div className="mb-6 flex items-center gap-3">
                <Building2 className="h-5 w-5 text-[#ffb17f]" />
                <h2 className="text-lg font-semibold text-white">
                  Register Merchant
                </h2>
              </div>
              <form className="space-y-4" onSubmit={registerMerchant}>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Merchant Name
                  </label>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#ff8f5a] focus:outline-none"
                    placeholder="Acme Store"
                    value={merchantForm.name}
                    onChange={(e) =>
                      setMerchantForm({ ...merchantForm, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Support Email
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#ff8f5a] focus:outline-none"
                    placeholder="support@acmestore.tn"
                    value={merchantForm.support_email}
                    onChange={(e) =>
                      setMerchantForm({
                        ...merchantForm,
                        support_email: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating..." : "Create Merchant"}
                </Button>
              </form>
            </Card>

            {/* Create Checkout */}
            <Card className="p-6">
              <div className="mb-6 flex items-center gap-3">
                <WalletCards className="h-5 w-5 text-[#2de6c4]" />
                <h2 className="text-lg font-semibold text-white">
                  Create Checkout
                </h2>
              </div>
              <form className="space-y-4" onSubmit={createIntent}>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Merchant
                  </label>
                  <select
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white focus:border-[#ff8f5a] focus:outline-none"
                    value={selectedMerchantId}
                    onChange={(e) => setSelectedMerchantId(e.target.value)}
                    required
                  >
                    <option value="">Select merchant</option>
                    {overview?.merchants.map((merchant) => (
                      <option
                        key={merchant.merchant_id}
                        value={merchant.merchant_id}
                      >
                        {merchant.business_name || merchant.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Amount (millimes)
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#ff8f5a] focus:outline-none"
                    placeholder="42000"
                    value={intentForm.amount}
                    onChange={(e) =>
                      setIntentForm({ ...intentForm, amount: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Description
                  </label>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#ff8f5a] focus:outline-none"
                    placeholder="Order #123"
                    value={intentForm.description}
                    onChange={(e) =>
                      setIntentForm({
                        ...intentForm,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !selectedMerchantId}
                >
                  {loading ? "Creating..." : "Create Checkout Link"}
                </Button>
              </form>
            </Card>

            {/* Security Info */}
            <Card className="p-6">
              <div className="mb-6 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-[#2de6c4]" />
                <h2 className="text-lg font-semibold text-white">
                  Secure Payments
                </h2>
              </div>
              <div className="space-y-3 text-sm text-white/70">
                <p>• PCI-compliant card processing</p>
                <p>• Real-time payment confirmation</p>
                <p>• Hosted checkout pages</p>
                <p>• Test environment ready</p>
              </div>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 border-t border-white/10 pt-6 text-center">
          <p className="text-sm text-white/50">
            NexaPay Developer Portal • Use test card 4242 4242 4242 4242 for
            payments
          </p>
        </footer>
      </div>
    </main>
  );
}
