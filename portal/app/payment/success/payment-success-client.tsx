"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  ShieldCheck,
  User,
  XCircle,
  Calendar,
  Receipt,
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
  created_at: string;
  merchant_name: string;
  business_name?: string;
  description?: string;
  customer_email?: string;
  customer_name?: string;
  card_last4?: string;
  card_brand?: string;
  confirmed_at?: string;
  failure_reason?: string;
  checkout_url?: string;
};

type PaymentSuccessClientProps = {
  intentId: string;
  statusParam: string;
};

function formatAmount(amount?: number, currency?: string) {
  if (typeof amount !== "number" || !currency) return "0.000 TND";
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount / 1000)} ${currency}`;
}

function formatDate(dateString?: string) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function PaymentSuccessClient({
  intentId,
  statusParam,
}: PaymentSuccessClientProps) {
  const [intent, setIntent] = useState<PublicIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchIntentDetails() {
      try {
        setLoading(true);
        const { data } = await api.get(
          `/gateway/v1/intents/${intentId}/public`,
        );
        setIntent(data);
      } catch (_err) {
        setError("Could not load payment details. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    if (intentId !== "unknown") {
      fetchIntentDetails();
    } else {
      setLoading(false);
    }
  }, [intentId]);

  const effectiveStatus = intent?.status ?? statusParam;
  const success = effectiveStatus === "succeeded";
  const merchantName =
    intent?.business_name || intent?.merchant_name || "Merchant";
  const amountLabel = formatAmount(intent?.amount, intent?.currency);

  async function downloadReceipt() {
    if (!receiptRef.current) return;

    try {
      setDownloading(true);
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });

      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageHeight = pdf.internal.pageSize.getHeight();

      // Add receipt image
      pdf.addImage(
        canvas.toDataURL("image/png", 1.0),
        "PNG",
        10,
        10,
        imgWidth,
        imgHeight,
      );

      // Add metadata
      pdf.setFontSize(8);
      pdf.setTextColor(128);
      pdf.text(
        `NexaPay Receipt • ${intentId} • Generated ${new Date().toLocaleString()}`,
        10,
        pageHeight - 10,
      );

      pdf.save(`nexapay-receipt-${intentId}.pdf`);
    } catch (_err) {
      alert("Unable to generate the receipt. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-[1260px] px-4 py-12">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-[#ffb17f] border-t-transparent" />
          <h2 className="text-xl font-semibold text-white">
            Loading payment details
          </h2>
          <p className="mt-2 text-white/70">
            Please wait while we fetch your payment information...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1260px] px-4 py-8 md:py-12">
      {/* Header */}
      <header className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <Link href="/" className="inline-flex items-center gap-3">
          <BrandLogo size="md" />
          <span className="text-sm font-medium text-white/70">
            Payment Receipt
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadReceipt}
            disabled={downloading || !intent}
            className="min-w-[140px]"
          >
            {downloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </>
            )}
          </Button>

          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back home
            </Button>
          </Link>
        </div>
      </header>

      {/* Payment Status Banner */}
      <Card className="mb-8 overflow-hidden p-0">
        <div className="bg-gradient-to-r from-[#0f172a] to-[#1e293b] p-6">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full ${
                  success ? "bg-emerald-400/20" : "bg-red-400/20"
                }`}
              >
                {success ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                ) : (
                  <XCircle className="h-8 w-8 text-red-400" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {success ? "Payment Successful!" : "Payment Failed"}
                </h1>
                <p className="mt-1 text-white/70">
                  {success
                    ? `Your payment to ${merchantName} has been confirmed`
                    : intent?.failure_reason ||
                      "The payment could not be processed"}
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-3xl font-bold text-white">{amountLabel}</div>
              <p className="mt-1 text-sm text-white/70">{merchantName}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-white/10 md:grid-cols-4">
          <div className="border-r border-white/10 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-white/50">
              Reference
            </div>
            <div className="mt-2 font-mono text-sm text-white">
              {intentId.slice(0, 12)}...
            </div>
          </div>
          <div className="border-r border-white/10 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-white/50">
              Date
            </div>
            <div className="mt-2 text-sm text-white">
              {formatDate(intent?.confirmed_at || intent?.created_at)}
            </div>
          </div>
          <div className="border-r border-white/10 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-white/50">
              Status
            </div>
            <div className="mt-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                  success
                    ? "bg-emerald-400/20 text-emerald-300"
                    : "bg-red-400/20 text-red-300"
                }`}
              >
                {success ? "Confirmed" : "Failed"}
              </span>
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-white/50">
              Payment Method
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-white">
              <CreditCard className="h-4 w-4" />
              {intent?.card_last4
                ? `${intent.card_brand || "Card"} •••• ${intent.card_last4}`
                : "Card"}
            </div>
          </div>
        </div>
      </Card>

      {/* Main Content */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left Column - Receipt */}
        <div className="space-y-8">
          {/* Receipt Preview */}
          <Card className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Payment Receipt
                </h2>
                <p className="mt-1 text-sm text-white/70">
                  Download this receipt for your records
                </p>
              </div>
              <Receipt className="h-6 w-6 text-[#ffb17f]" />
            </div>

            <div
              ref={receiptRef}
              className="overflow-hidden rounded-xl bg-white p-6 text-gray-900 shadow-lg"
            >
              {/* Receipt Header */}
              <div className="border-b border-gray-200 pb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-[#2de6c4] to-[#57c8ff]" />
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">
                          NexaPay
                        </h3>
                        <p className="text-sm text-gray-500">Payment Receipt</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
                      Receipt #
                    </div>
                    <div className="mt-1 font-mono text-sm font-bold text-gray-900">
                      {intentId}
                    </div>
                  </div>
                </div>
              </div>

              {/* Receipt Body */}
              <div className="mt-6 space-y-6">
                {/* Merchant Info */}
                <div>
                  <h4 className="text-sm font-medium uppercase tracking-wider text-gray-500">
                    Merchant
                  </h4>
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {merchantName}
                      </p>
                      {intent?.description && (
                        <p className="mt-1 text-sm text-gray-600">
                          {intent.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Paid to</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">
                        Business Account
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        Amount Paid
                      </div>
                      <div className="mt-1 text-3xl font-bold text-gray-900">
                        {amountLabel}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        Status
                      </div>
                      <div
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                          success
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {success ? "Confirmed" : "Failed"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
                      Customer
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-900">
                      <User className="h-4 w-4" />
                      {intent?.customer_name || "Customer"}
                    </div>
                    {intent?.customer_email && (
                      <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4" />
                        {intent.customer_email}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
                      Date & Time
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-900">
                      <Calendar className="h-4 w-4" />
                      {formatDate(intent?.confirmed_at || intent?.created_at)}
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                {intent?.card_last4 && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
                      Payment Method
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-10 w-16 rounded-md bg-gradient-to-r from-blue-500 to-purple-500" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {intent.card_brand || "Card"} ending in{" "}
                          {intent.card_last4}
                        </p>
                        <p className="text-sm text-gray-600">Credit Card</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="border-t border-gray-200 pt-6">
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <div>
                      <p>Thank you for your payment!</p>
                      <p className="mt-1">
                        Keep this receipt for your records.
                      </p>
                    </div>
                    <div className="text-right">
                      <p>Powered by</p>
                      <p className="font-semibold text-gray-900">NexaPay</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Button
              variant="accent"
              size="lg"
              className="mt-6 w-full"
              onClick={downloadReceipt}
              disabled={downloading || !intent}
            >
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download Receipt as PDF
                </>
              )}
            </Button>
          </Card>
        </div>

        {/* Right Column - Details & Actions */}
        <div className="space-y-8">
          {/* Transaction Details */}
          <Card className="p-6">
            <div className="mb-6 flex items-center gap-3">
              <FileText className="h-5 w-5 text-[#ffb17f]" />
              <h2 className="text-lg font-semibold text-white">
                Transaction Details
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-white/70">Transaction ID</span>
                <span className="font-mono text-sm text-white">{intentId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Created</span>
                <span className="text-right text-white">
                  {formatDate(intent?.created_at)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Confirmed</span>
                <span className="text-right text-white">
                  {formatDate(intent?.confirmed_at) || "Pending"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Description</span>
                <span className="max-w-[60%] text-right text-white">
                  {intent?.description || "Payment"}
                </span>
              </div>
              {intent?.failure_reason && (
                <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-4">
                  <div className="flex items-start gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 text-red-400" />
                    <div>
                      <p className="font-medium text-red-300">Failure Reason</p>
                      <p className="mt-1 text-sm text-red-300/80">
                        {intent.failure_reason}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Security & Support */}
          <Card className="p-6">
            <div className="mb-6 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-[var(--brand)]" />
              <h2 className="text-lg font-semibold text-white">
                Security & Support
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/20">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Payment Secured</p>
                  <p className="mt-1 text-sm text-white/70">
                    Your payment was processed through PCI-compliant systems
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-400/20">
                  <ExternalLink className="h-3 w-3 text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Original Checkout</p>
                  <p className="mt-1 text-sm text-white/70">
                    {intent?.checkout_url ? (
                      <a
                        href={intent.checkout_url}
                        className="text-[#ffb17f] hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View original checkout page
                      </a>
                    ) : (
                      "Checkout URL not available"
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#ffb17f]/20">
                  <Mail className="h-3 w-3 text-[#ffb17f]" />
                </div>
                <div>
                  <p className="font-medium text-white">Need Help?</p>
                  <p className="mt-1 text-sm text-white/70">
                    Contact {merchantName} directly for payment assistance
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-6 bg-gradient-to-br from-[#1a1f2e] to-[#0f131f]">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white">
                Quick Actions
              </h2>
              <p className="mt-1 text-sm text-white/70">
                What would you like to do next?
              </p>
            </div>

            <div className="space-y-3">
              <Button
                variant="outline"
                className="h-12 w-full justify-start"
                onClick={downloadReceipt}
                disabled={downloading || !intent}
              >
                <Download className="mr-3 h-4 w-4" />
                {downloading ? "Generating receipt..." : "Download receipt"}
              </Button>

              <Link href="/" className="block">
                <Button variant="outline" className="h-12 w-full justify-start">
                  <ArrowLeft className="mr-3 h-4 w-4" />
                  Return to homepage
                </Button>
              </Link>

              <a
                href={`mailto:contact@backendglitch.com?subject=Payment%20Query:%20${intentId}`}
                className="block"
              >
                <Button variant="ghost" className="h-12 w-full justify-start">
                  <Mail className="mr-3 h-4 w-4" />
                  Contact support
                </Button>
              </a>
            </div>
          </Card>

          {error && (
            <Card className="border-red-400/20 bg-red-400/10 p-6">
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-5 w-5 text-red-400" />
                <div>
                  <p className="font-medium text-red-300">
                    Error Loading Details
                  </p>
                  <p className="mt-1 text-sm text-red-300/80">{error}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={() => window.location.reload()}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-white/10 pt-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="text-center md:text-left">
            <div className="flex items-center gap-3">
              <BrandLogo size="sm" />
              <span className="text-xs font-medium text-white/50">
                Payment Receipt
              </span>
            </div>
            <p className="mt-2 text-xs text-white/50">
              Transaction reference: {intentId}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-white/50">
            <span>© {new Date().getFullYear()} NexaPay</span>
            <span>•</span>
            <span>Secure Payment Gateway</span>
            <span>•</span>
            <a href="#" className="hover:text-white">
              Privacy Policy
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
