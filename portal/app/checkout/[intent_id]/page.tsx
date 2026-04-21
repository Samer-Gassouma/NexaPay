"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { clsx, formInput, metricCard, statusBadge } from "@/lib/style-utils";

type PublicIntent = {
  success: boolean;
  intent_id: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
  customer_email?: string;
  customer_name?: string;
  card_last4?: string;
  card_brand?: string;
  created_at: string;
  confirmed_at?: string;
  merchant_name: string;
  business_name?: string;
  checkout_url?: string;
};

type ConfirmResult = {
  success: boolean;
  intent_id: string;
  status: string;
  failure_reason?: string;
  redirect_url?: string;
};

function formatAmount(amount?: number, currency?: string) {
  if (typeof amount !== "number" || !currency) return "0.000 TND";
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount / 1000)} ${currency}`;
}

export default function CheckoutIntentPage() {
  const params = useParams<{ intent_id: string }>();
  const intentId = params.intent_id;

  const [merchantKey, setMerchantKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [intent, setIntent] = useState<PublicIntent | null>(null);
  const [intentLoading, setIntentLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    async function fetchIntent() {
      try {
        console.log(
          "Fetching intent from:",
          `/gateway/v1/intents/${intentId}/public`,
        );
        console.log("API base URL:", process.env.NEXT_PUBLIC_API_URL);
        const { data } = await api.get(
          `/gateway/v1/intents/${intentId}/public`,
        );
        console.log("Intent data received:", data);
        setIntent(data);
      } catch (err: any) {
        console.error("Failed to load intent details:", err);
        console.error("Error response:", err.response);
        setError(
          "Failed to load intent details: " + (err.message || "Unknown error"),
        );
      } finally {
        setIntentLoading(false);
      }
    }

    if (intentId) {
      fetchIntent();
    }
  }, [intentId]);

  useEffect(() => {
    if (!intent?.created_at) return;

    const created = new Date(intent.created_at).getTime();
    const expiry = created + 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    if (now > expiry) {
      setTimeLeft(0);
      return;
    }

    setTimeLeft(Math.floor((expiry - now) / 1000));

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.floor((expiry - now) / 1000);

      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [intent?.created_at]);

  async function pay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Check if intent is already completed
    if (
      intent &&
      ["succeeded", "failed", "refunded", "partially_refunded"].includes(
        intent.status,
      )
    ) {
      setError("Payment already completed");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const cardData = {
        card_number: formData.get("card_number") as string,
        expiry_month: formData.get("expiry_month") as string,
        expiry_year: formData.get("expiry_year") as string,
        cvv: formData.get("cvv") as string,
        card_holder_name: formData.get("card_holder_name") as string,
        pin: "1234", // Test PIN for development
      };

      // Validate required fields
      const validationErrors: string[] = [];
      if (!cardData.card_number?.trim())
        validationErrors.push("Card number is required");
      if (!cardData.expiry_month?.trim())
        validationErrors.push("Expiry month is required");
      if (!cardData.expiry_year?.trim())
        validationErrors.push("Expiry year is required");
      if (!cardData.cvv?.trim()) validationErrors.push("CVV is required");
      if (!cardData.card_holder_name?.trim())
        validationErrors.push("Cardholder name is required");

      if (validationErrors.length > 0) {
        setError(validationErrors.join(". "));
        setLoading(false);
        return;
      }

      console.log("Submitting payment with card data:", {
        ...cardData,
        card_number: "***" + String(cardData.card_number).slice(-4),
      });
      console.log("API endpoint:", `/gateway/v1/intents/${intentId}/confirm`);
      console.log("Merchant key present:", !!merchantKey);

      const { data } = await api.post(
        `/gateway/v1/intents/${intentId}/confirm`,
        cardData,
        {
          headers: merchantKey ? { "X-API-Key": merchantKey } : undefined,
        },
      );

      console.log("Payment response:", data);
      setResult(data);
      if (data.success && data.redirect_url) {
        console.log("Payment successful, redirecting to:", data.redirect_url);
        window.location.href = data.redirect_url;
      } else if (data.success === false) {
        // API returned success: false but with proper response
        const errorMsg = data.failure_reason || data.error || "Payment failed";
        console.log("Payment failed with reason:", errorMsg);
        setError(errorMsg);
      }
    } catch (err: any) {
      console.error("Payment request failed:", err);
      console.error("Full error:", err.response?.data || err.message);
      console.error("Request URL:", err.config?.url);
      console.error("Request method:", err.config?.method);

      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.failure_reason ||
        err.message ||
        "Payment failed";
      setError(`Payment failed: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }

  const isExpired = timeLeft === 0;
  const minutes = timeLeft ? Math.floor(timeLeft / 60) : 0;
  const seconds = timeLeft ? timeLeft % 60 : 0;

  const merchantName =
    intent?.business_name || intent?.merchant_name || "Merchant";
  const amountLabel = formatAmount(intent?.amount, intent?.currency);
  const isCompletedIntent = intent
    ? ["succeeded", "failed", "refunded", "partially_refunded"].includes(
        intent.status,
      )
    : false;
  const intentLoadFailed = !intentLoading && !intent;
  const paymentDisabled =
    loading ||
    isExpired ||
    intentLoading ||
    isCompletedIntent ||
    intentLoadFailed;

  return (
    <main className="mx-auto max-w-[1260px] px-4 py-8 md:py-12">
      {/* Header */}
      <header className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <Link href="/" className="inline-flex items-center">
          <BrandLogo size="md" />
          <span className="ml-2 text-sm font-medium text-white/70">
            Checkout
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--brand)]" />
            <span>Secure payment</span>
          </div>

          {timeLeft !== null && (
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs">
              <span className="text-white/70">Session expires:</span>
              <span className="font-medium text-white">
                {minutes.toString().padStart(2, "0")}:
                {seconds.toString().padStart(2, "0")}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left Column - Payment Form */}
        <div className="space-y-8">
          {/* Order Summary */}
          <Card className="p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-white">
                Complete your payment
              </h1>
              <p className="mt-2 text-white/70">
                You're paying {merchantName} for{" "}
                {intent?.description || "a purchase"}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-white/70">Merchant</span>
                <span className="font-medium text-white">{merchantName}</span>
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-white/70">Amount</span>
                <span className="font-[var(--font-sora)] text-2xl font-semibold text-white">
                  {amountLabel}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/70">Reference</span>
                <span className="font-mono text-sm text-white/90">
                  {intentId}
                </span>
              </div>
            </div>
          </Card>

          {/* Payment Form */}
          <Card className="p-6">
            <div className="mb-6">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#ffb17f]" />
                <h2 className="text-lg font-semibold text-white">
                  Payment details
                </h2>
              </div>
              <p className="mt-2 text-sm text-white/70">
                Enter your card information to complete the payment
              </p>
            </div>

            <form className="space-y-6" onSubmit={pay}>
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">
                  Card number
                </label>
                <input
                  name="card_number"
                  className={formInput()}
                  placeholder="4242 4242 4242 4242"
                  autoComplete="cc-number"
                  inputMode="numeric"
                  required
                  disabled={paymentDisabled}
                />
                <p className="mt-2 text-xs text-white/50">
                  Use 4242 4242 4242 4242 for test payments
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Cardholder name
                  </label>
                  <input
                    name="card_holder_name"
                    className={formInput()}
                    placeholder="John Doe"
                    autoComplete="cc-name"
                    required
                    disabled={paymentDisabled}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    CVC
                  </label>
                  <input
                    name="cvv"
                    className={formInput()}
                    placeholder="123"
                    autoComplete="cc-csc"
                    inputMode="numeric"
                    required
                    disabled={paymentDisabled}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Expiry month
                  </label>
                  <input
                    name="expiry_month"
                    className={formInput()}
                    placeholder="12"
                    autoComplete="cc-exp-month"
                    inputMode="numeric"
                    required
                    disabled={paymentDisabled}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Expiry year
                  </label>
                  <input
                    name="expiry_year"
                    className={formInput()}
                    placeholder="2029"
                    autoComplete="cc-exp-year"
                    inputMode="numeric"
                    required
                    disabled={paymentDisabled}
                  />
                </div>
              </div>

              {/* Developer override (hidden by default) */}
              <details className="rounded-xl border border-white/10 bg-white/5 p-4">
                <summary className="cursor-pointer text-sm font-medium text-white">
                  Developer options
                </summary>
                <p className="mt-2 text-xs text-white/60">
                  Only use this when confirming from a merchant-owned surface
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/70">
                      Test Card
                    </label>
                    <select
                      className={formInput() + " text-sm"}
                      onChange={(e) => {
                        const card = e.target.value;
                        if (card === "4242424242424242") {
                          const form = document.querySelector("form");
                          if (form) {
                            (
                              form.querySelector(
                                '[name="card_number"]',
                              ) as HTMLInputElement
                            ).value = "4242424242424242";
                            (
                              form.querySelector(
                                '[name="cvv"]',
                              ) as HTMLInputElement
                            ).value = "123";
                            (
                              form.querySelector(
                                '[name="expiry_month"]',
                              ) as HTMLInputElement
                            ).value = "12";
                            (
                              form.querySelector(
                                '[name="expiry_year"]',
                              ) as HTMLInputElement
                            ).value = "2029";
                            (
                              form.querySelector(
                                '[name="card_holder_name"]',
                              ) as HTMLInputElement
                            ).value = "Test Customer";
                          }
                        } else if (card === "4000000000000002") {
                          const form = document.querySelector("form");
                          if (form) {
                            (
                              form.querySelector(
                                '[name="card_number"]',
                              ) as HTMLInputElement
                            ).value = "4000000000000002";
                            (
                              form.querySelector(
                                '[name="cvv"]',
                              ) as HTMLInputElement
                            ).value = "123";
                            (
                              form.querySelector(
                                '[name="expiry_month"]',
                              ) as HTMLInputElement
                            ).value = "12";
                            (
                              form.querySelector(
                                '[name="expiry_year"]',
                              ) as HTMLInputElement
                            ).value = "2029";
                            (
                              form.querySelector(
                                '[name="card_holder_name"]',
                              ) as HTMLInputElement
                            ).value = "Test Customer";
                          }
                        }
                      }}
                      disabled={paymentDisabled}
                    >
                      <option value="">Select a test card</option>
                      <option value="4242424242424242">
                        4242 4242 4242 4242 (Success)
                      </option>
                      <option value="4000000000000002">
                        4000 0000 0000 0002 (Declined)
                      </option>
                    </select>
                    <p className="mt-1 text-xs text-white/50">
                      PIN: 1234 (already included in submission)
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/70">
                      Merchant API Key (optional)
                    </label>
                    <input
                      className={`${formInput()} text-sm`}
                      placeholder="nxp_merchant_..."
                      value={merchantKey}
                      onChange={(e) => setMerchantKey(e.target.value)}
                      disabled={paymentDisabled}
                    />
                  </div>
                </div>
              </details>

              <Button
                type="submit"
                variant="accent"
                size="lg"
                className="h-12 w-full text-base font-semibold"
                disabled={paymentDisabled}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Processing payment...
                  </span>
                ) : isExpired ? (
                  "Session expired"
                ) : isCompletedIntent && intent ? (
                  intent.status === "succeeded" ? (
                    "Payment succeeded"
                  ) : intent.status === "failed" ? (
                    "Payment failed"
                  ) : intent.status === "refunded" ? (
                    "Payment refunded"
                  ) : (
                    "Payment completed"
                  )
                ) : intentLoadFailed ? (
                  "Unable to load payment details"
                ) : (
                  `Pay ${amountLabel}`
                )}
              </Button>

              <div className="flex items-center justify-center gap-2 text-sm text-white/60">
                <LockKeyhole className="h-4 w-4" />
                <span>Secured by NexaPay</span>
              </div>
            </form>

            {/* Results */}
            {result && (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2">
                  {result.status === "succeeded" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-red-400" />
                  )}
                  <span className="font-medium text-white">
                    {result.status === "succeeded"
                      ? "Payment successful"
                      : "Payment failed"}
                  </span>
                </div>
                {result.failure_reason && (
                  <p className="mt-2 text-sm text-red-300">
                    {result.failure_reason}
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column - Order Details & Help */}
        <div className="space-y-8">
          {/* Security & Trust */}
          <Card className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white">
                Secure payment with NexaPay
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--brand)]" />
                <div>
                  <p className="font-medium text-white">PCI compliant</p>
                  <p className="mt-1 text-sm text-white/70">
                    Your card details are encrypted and never stored on our
                    servers
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#ffb17f]/20">
                  <span className="text-xs font-bold text-[#ffb17f]">✓</span>
                </div>
                <div>
                  <p className="font-medium text-white">Instant confirmation</p>
                  <p className="mt-1 text-sm text-white/70">
                    Payments are confirmed immediately with real-time updates
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#57c8ff]/20">
                  <span className="text-xs font-bold text-[#57c8ff]">!</span>
                </div>
                <div>
                  <p className="font-medium text-white">Test environment</p>
                  <p className="mt-1 text-sm text-white/70">
                    This is a test payment. Use test card 4242 4242 4242 4242
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Order Information */}
          <Card className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white">
                Order information
              </h2>
            </div>

            <div className="space-y-4">
              {intent?.description && (
                <div className="flex items-start justify-between">
                  <span className="text-white/70">Description</span>
                  <span className="max-w-[60%] text-right text-white">
                    {intent.description}
                  </span>
                </div>
              )}

              {intent?.customer_name && (
                <div className="flex items-start justify-between">
                  <span className="text-white/70">Customer</span>
                  <span className="text-right text-white">
                    {intent.customer_name}
                  </span>
                </div>
              )}

              {intent?.customer_email && (
                <div className="flex items-start justify-between">
                  <span className="text-white/70">Email</span>
                  <span className="text-right text-white">
                    {intent.customer_email}
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between">
                <span className="text-white/70">Created</span>
                <span className="text-right text-white">
                  {intent?.created_at
                    ? new Date(intent.created_at).toLocaleString()
                    : "N/A"}
                </span>
              </div>

              <div className="flex items-start justify-between">
                <span className="text-white/70">Status</span>
                <span
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    intent?.status === "requires_confirmation"
                      ? "bg-blue-400/20 text-blue-300"
                      : intent?.status === "succeeded"
                        ? "bg-emerald-400/20 text-emerald-300"
                        : "bg-white/10 text-white",
                  )}
                >
                  {intent?.status || "Loading..."}
                </span>
              </div>
            </div>
          </Card>

          {/* Need Help? */}
          <Card className="p-6 border-[#ffb17f]/20 bg-gradient-to-br from-[#2a1a10]/50 to-transparent">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffb17f]/20">
                <span className="text-lg">?</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Need help?</h2>
                <p className="mt-1 text-sm text-white/70">
                  Contact {merchantName} directly for payment assistance
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <a
                href="/"
                className="flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to homepage
              </a>

              <p className="text-center text-xs text-white/50">
                Payment ID: {intentId}
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-white/10 pt-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="text-center md:text-left">
            <BrandLogo size="sm" />
            <p className="mt-2 text-xs text-white/50">
              A professional payment gateway for Tunisian businesses
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-white/50">
            <span>© {new Date().getFullYear()} NexaPay</span>
            <span>•</span>
            <a href="#" className="hover:text-white">
              Privacy
            </a>
            <span>•</span>
            <a href="#" className="hover:text-white">
              Terms
            </a>
            <span>•</span>
            <a href="#" className="hover:text-white">
              Support
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
