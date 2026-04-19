"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

type AccountResponse = {
  chain_address: string;
  full_name: string;
  cin: string;
  balance: number;
  balance_display: string;
  account_number: string;
  rib: string;
  iban: string;
  card_last4: string;
  card_expiry: string;
  cvv?: string;
  tx_count: number;
  created_at: string;
};

type TxResponse = {
  transactions: Array<{
    id: string;
    type: string;
    direction: string;
    amount_display: string;
    memo: string;
    timestamp: string;
    hash: string;
  }>;
};

type RecipientSearchResponse = {
  results: Array<{
    chain_address: string;
    full_name: string;
    cin: string;
    phone: string;
  }>;
};

type LoanHistoryItem = {
  loan_id: string;
  amount: number;
  status: string;
  interest_rate: string;
  due_date: string;
  purpose?: string | null;
  duration_months?: number | null;
  contract_hash: string;
  contract_signed_by?: string | null;
  contract_signed_at?: string | null;
  created_at: string;
};

type LoanHistoryResponse = {
  loans: LoanHistoryItem[];
};

type LoanApplicationDraft = {
  requested_loan_amount: number;
  loan_reason: string;
  preferred_duration_months: string;
  annual_interest_rate: number;
  collateral_type: string;
  collateral_estimated_value: number;
  amt_income_total: number;
  amt_credit: number;
  amt_annuity: number;
  amt_goods_price: number;
  name_income_type: string;
  name_education_type: string;
  name_family_status: string;
  occupation_type: string;
  days_birth: number;
  days_employed: number;
  cnt_children: number;
  cnt_fam_members: number;
};

type LoanScoreResponse = {
  input_summary?: {
    CIN_NUMBER?: string;
    SK_ID_CURR?: number;
    requested_loan_amount?: number;
    income_total?: number;
    income_type?: string;
  };
  result?: {
    credit_score?: number;
    probability_default?: number;
    max_recommended_loan?: number;
    recommended_duration_months?: number;
    max_monthly_installment?: number;
    fraud_risk_level?: string;
    aml_risk_level?: string;
    decision?: string;
    main_reasons?: string[];
    repayment_estimates?: {
      assumed_annual_interest_rate?: number;
      requested_loan?: {
        amount?: number;
        duration_months?: number;
        estimated_monthly_installment?: number;
        estimated_total_repayment?: number;
        within_affordability_limit?: boolean;
      };
      recommended_loan?: {
        amount?: number;
        duration_months?: number;
        estimated_monthly_installment?: number;
        estimated_total_repayment?: number;
      };
    };
  };
  success?: boolean;
  error?: string;
};

type LoanAssessmentRecord = {
  id: string;
  created_at: string;
  cin_number: string;
  requested_amount: number;
  preferred_duration_months: string;
  collateral_type: string;
  decision: string;
  credit_score: number | null;
  recommended_amount: number | null;
  recommended_duration_months: number | null;
  affordability_ok: boolean | null;
  probability_default: number | null;
  fraud_risk_level: string | null;
  aml_risk_level: string | null;
  response: LoanScoreResponse;
};

type LoanApprovalResponse = {
  loan_id: string;
  score: number;
  score_breakdown: {
    base: number;
    transaction_history: number;
    account_age: number;
    balance_score: number;
  };
  status: string;
  amount: number;
  amount_display: string;
  interest_rate: string;
  due_date: string;
  contract_hash: string;
  message: string;
};

type LoanContractPayload = {
  contract_version: string;
  contract_reference: string;
  contract_type: string;
  lender_name: string;
  lender_branch: string;
  borrower_address: string;
  borrower_name: string;
  borrower_cin: string;
  purpose: string;
  requested_amount: number;
  requested_amount_millimes: number;
  approved_amount: number;
  approved_amount_millimes: number;
  duration_months: number;
  annual_interest_rate: number;
  issue_date: string;
  due_date: string;
  decision: string;
  monthly_installment: number | null;
  total_repayment: number | null;
  fraud_risk_level: string | null;
  aml_risk_level: string | null;
  main_reasons: string[];
  signature_rule: string;
  clauses: Array<{
    title: string;
    body: string;
  }>;
};

type SignedLoanContractDocument = LoanContractPayload & {
  signature: {
    signer_name: string;
    drawn_signature_data_url: string;
    signed_at: string;
    consent_statement: string;
    password_attestation: string;
  };
};

type MenuSection = {
  id: "overview" | "cards" | "statistics" | "savings";
  label: string;
};

const dashboardSections: MenuSection[] = [
  { id: "overview", label: "Overview" },
  { id: "cards", label: "Cards" },
  { id: "statistics", label: "Statistics" },
  { id: "savings", label: "Savings" },
];

const initialLoanApplication: LoanApplicationDraft = {
  requested_loan_amount: 35000,
  loan_reason: "Home improvement",
  preferred_duration_months: "36",
  annual_interest_rate: 0.12,
  collateral_type: "None",
  collateral_estimated_value: 0,
  amt_income_total: 48000,
  amt_credit: 35000,
  amt_annuity: 4200,
  amt_goods_price: 33000,
  name_income_type: "Working",
  name_education_type: "Higher education",
  name_family_status: "Married",
  occupation_type: "Core staff",
  days_birth: -12000,
  days_employed: -2200,
  cnt_children: 1,
  cnt_fam_members: 3,
};

function parseAmount(raw: string): number {
  const normalized = raw.replace(/[^0-9.-]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function formatTnd(value: number): string {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TND`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function addMonthsIso(baseDate: Date, months: number): string {
  const next = new Date(baseDate);
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
}

function formatLongDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function buildContractClauses(contract: Omit<LoanContractPayload, "clauses">) {
  return [
    {
      title: "Repayment obligation",
      body: `The borrower irrevocably undertakes to repay ${formatTnd(contract.approved_amount)} together with interest at ${formatPercent(contract.annual_interest_rate)} per annum in ${contract.duration_months} monthly installments, no later than ${formatLongDate(contract.due_date)} for the final installment date.`,
    },
    {
      title: "Installment discipline",
      body: `Each installment must be paid in full on its scheduled due date. Any late, partial, or missed payment may trigger collection follow-up, suspension of new credit, reporting to internal risk systems, and any lawful recovery action available to the lender.`,
    },
    {
      title: "Interest and total cost",
      body: `This facility is offered for the stated purpose of "${contract.purpose}". Based on the approved amount and tenor, the estimated monthly installment is ${contract.monthly_installment != null ? formatTnd(contract.monthly_installment) : "to be confirmed by the bank schedule"} and the estimated total repayment is ${contract.total_repayment != null ? formatTnd(contract.total_repayment) : "to be confirmed by the bank schedule"}.`,
    },
    {
      title: "Borrower declarations",
      body: `The borrower confirms that all identity, income, employment, collateral, and credit information supplied to NexaPay Bank is accurate and complete. Any material misstatement, fraud indicator, or concealed liability may render this contract immediately enforceable or cancellable according to applicable banking rules.`,
    },
    {
      title: "Default and enforcement",
      body: `If the borrower fails to meet repayment obligations when due, the lender may declare the outstanding balance immediately payable, apply lawful default charges, offset eligible balances, and commence recovery procedures permitted under applicable law and the lender's internal credit policy.`,
    },
    {
      title: "Electronic signature and records",
      body: `By applying the handwritten electronic signature below and confirming the account password, the borrower accepts this contract as legally binding, authorizes storage of the signed copy in NexaPay systems, and agrees that the electronic record may be used as evidence of consent and disbursement authorization.`,
    },
  ];
}

function buildSignedContractHtml(document: SignedLoanContractDocument, meta: { loanId: string; contractHash: string }) {
  const reasons = document.main_reasons
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join("");
  const clauses = document.clauses
    .map(
      (clause, index) => `
        <section class="clause">
          <h3>${index + 1}. ${escapeHtml(clause.title)}</h3>
          <p>${escapeHtml(clause.body)}</p>
        </section>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signed Loan Contract ${escapeHtml(meta.loanId)}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #e6dcc8;
        color: #1c1a17;
        font-family: "Georgia", "Times New Roman", serif;
        line-height: 1.6;
      }
      .page {
        width: min(920px, calc(100vw - 32px));
        margin: 24px auto;
        background: #fbf4e7;
        border: 1px solid #cfbea1;
        box-shadow: 0 24px 60px rgba(71, 52, 19, 0.18);
        padding: 40px;
      }
      h1, h2, h3, p { margin: 0; }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 12px;
        color: #7b6640;
      }
      h1 {
        margin-top: 8px;
        font-size: 34px;
      }
      .meta-grid, .terms-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px 24px;
        margin-top: 24px;
      }
      .card {
        background: rgba(255,255,255,0.45);
        border: 1px solid #d7c5a5;
        padding: 14px 16px;
      }
      .label {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #816942;
        margin-bottom: 6px;
      }
      .section {
        margin-top: 30px;
      }
      .section h2 {
        margin-bottom: 10px;
        font-size: 19px;
      }
      .clause {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid #d8c9ae;
      }
      .clause h3 {
        font-size: 16px;
        margin-bottom: 6px;
      }
      ul {
        margin: 12px 0 0;
        padding-left: 22px;
      }
      .signature-block {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 18px;
        align-items: end;
        margin-top: 26px;
        padding-top: 18px;
        border-top: 2px solid #b89d72;
      }
      .signature-img {
        width: 100%;
        max-width: 320px;
        height: auto;
        border-bottom: 1px solid #8d7346;
        padding-bottom: 8px;
      }
      .small {
        font-size: 13px;
        color: #5f523b;
      }
      @media print {
        body { background: #fff; }
        .page {
          width: auto;
          margin: 0;
          box-shadow: none;
          border: none;
        }
      }
    </style>
  </head>
  <body>
    <article class="page">
      <p class="eyebrow">${escapeHtml(document.lender_name)}</p>
      <h1>Consumer Loan Agreement</h1>
      <p class="small">Contract reference ${escapeHtml(document.contract_reference)} | Loan ID ${escapeHtml(meta.loanId)} | Hash ${escapeHtml(meta.contractHash)}</p>

      <div class="meta-grid">
        <div class="card"><span class="label">Borrower</span>${escapeHtml(document.borrower_name)}</div>
        <div class="card"><span class="label">National ID</span>${escapeHtml(document.borrower_cin)}</div>
        <div class="card"><span class="label">Issue date</span>${escapeHtml(formatLongDate(document.issue_date))}</div>
        <div class="card"><span class="label">Final due date</span>${escapeHtml(formatLongDate(document.due_date))}</div>
      </div>

      <div class="section">
        <h2>Facility terms</h2>
        <div class="terms-grid">
          <div class="card"><span class="label">Requested amount</span>${escapeHtml(formatTnd(document.requested_amount))}</div>
          <div class="card"><span class="label">Approved amount</span>${escapeHtml(formatTnd(document.approved_amount))}</div>
          <div class="card"><span class="label">Interest rate</span>${escapeHtml(formatPercent(document.annual_interest_rate))}</div>
          <div class="card"><span class="label">Duration</span>${escapeHtml(String(document.duration_months))} months</div>
          <div class="card"><span class="label">Estimated installment</span>${escapeHtml(document.monthly_installment != null ? formatTnd(document.monthly_installment) : "To be confirmed")}</div>
          <div class="card"><span class="label">Estimated total repayment</span>${escapeHtml(document.total_repayment != null ? formatTnd(document.total_repayment) : "To be confirmed")}</div>
        </div>
      </div>

      <div class="section">
        <h2>Purpose and underwriting basis</h2>
        <p>This loan is granted for <strong>${escapeHtml(document.purpose)}</strong>. Risk review result: ${escapeHtml(document.decision)}. Fraud flag: ${escapeHtml(document.fraud_risk_level ?? "N/A")}. AML flag: ${escapeHtml(document.aml_risk_level ?? "N/A")}.</p>
        ${reasons ? `<ul>${reasons}</ul>` : ""}
      </div>

      <div class="section">
        <h2>Legal clauses</h2>
        ${clauses}
      </div>

      <div class="section">
        <h2>Execution</h2>
        <p>${escapeHtml(document.signature.consent_statement)}</p>
        <p class="small" style="margin-top:8px;">${escapeHtml(document.signature.password_attestation)}</p>
        <div class="signature-block">
          <div>
            <img class="signature-img" src="${document.signature.drawn_signature_data_url}" alt="Borrower electronic signature" />
            <p class="small">Borrower electronic signature</p>
          </div>
          <div>
            <p><strong>${escapeHtml(document.signature.signer_name)}</strong></p>
            <p class="small">Signed on ${escapeHtml(new Date(document.signature.signed_at).toLocaleString("en-GB"))}</p>
            <p class="small">Borrower blockchain address: ${escapeHtml(document.borrower_address)}</p>
          </div>
        </div>
      </div>
    </article>
  </body>
</html>`;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [address, setAddress] = useState("");
  const [storedCin, setStoredCin] = useState("");
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [txs, setTxs] = useState<TxResponse["transactions"]>([]);

  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [submittingLoanRequest, setSubmittingLoanRequest] = useState(false);
  const [acceptingLoanOffer, setAcceptingLoanOffer] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loanError, setLoanError] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<"send" | "loan">("send");
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showContractPaper, setShowContractPaper] = useState(false);
  const [showCardBack, setShowCardBack] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuSection["id"]>("overview");

  const [portalOrigin, setPortalOrigin] = useState("");
  const [receiveAmountTnd, setReceiveAmountTnd] = useState(25);
  const [copiedReceiveLink, setCopiedReceiveLink] = useState(false);

  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipients, setRecipients] = useState<RecipientSearchResponse["results"]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientSearchResponse["results"][number] | null>(null);
  const [transferAmountTnd, setTransferAmountTnd] = useState(10);
  const [transferPin, setTransferPin] = useState("1234");
  const [transferMemo, setTransferMemo] = useState("");
  const [loanApplication, setLoanApplication] = useState<LoanApplicationDraft>(initialLoanApplication);
  const [loanScoreResult, setLoanScoreResult] = useState<LoanScoreResponse | null>(null);
  const [acceptedLoanResult, setAcceptedLoanResult] = useState<LoanApprovalResponse | null>(null);
  const [loanHistory, setLoanHistory] = useState<LoanHistoryItem[]>([]);
  const [loanAssessments, setLoanAssessments] = useState<LoanAssessmentRecord[]>([]);
  const [contractSignerName, setContractSignerName] = useState("");
  const [contractPassword, setContractPassword] = useState("");
  const [contractConsent, setContractConsent] = useState(false);
  const [contractSignatureDataUrl, setContractSignatureDataUrl] = useState("");
  const [contractSignatureReady, setContractSignatureReady] = useState(false);
  const [contractDownloadName, setContractDownloadName] = useState("");

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);

  const receiveAmountMillimes = useMemo(
    () => Math.max(1000, Math.round(receiveAmountTnd * 1000)),
    [receiveAmountTnd],
  );

  const transferAmountMillimes = useMemo(
    () => Math.max(0, Math.round(transferAmountTnd * 1000)),
    [transferAmountTnd],
  );

  const receiveLink = useMemo(() => {
    if (!account || !portalOrigin) return "";
    const params = new URLSearchParams({ amount: String(receiveAmountMillimes) });
    return `${portalOrigin}/pay/${account.chain_address}?${params.toString()}`;
  }, [account, portalOrigin, receiveAmountMillimes]);

  const loanStorageKey = useMemo(() => {
    if (!address) return "";
    return `nexapay_loan_assessments_${address}`;
  }, [address]);

  const latestLoanAssessment = useMemo(
    () => loanAssessments[0] ?? null,
    [loanAssessments],
  );

  const customerCin = account?.cin || storedCin;

  const pendingLoanContract = useMemo<LoanContractPayload | null>(() => {
    if (!account || !customerCin || !loanScoreResult?.result) return null;

    const result = loanScoreResult.result;
    const requestedLoan = result.repayment_estimates?.requested_loan;
    const recommendedLoan = result.repayment_estimates?.recommended_loan;
    const approvedAmount =
      result.max_recommended_loan ??
      (requestedLoan?.within_affordability_limit ? requestedLoan.amount : undefined);

    if (!approvedAmount || approvedAmount <= 0) return null;

    const durationMonths =
      result.recommended_duration_months ??
      requestedLoan?.duration_months ??
      Number(loanApplication.preferred_duration_months || 36);

    const issueDate = new Date().toISOString();
    const dueDate = addMonthsIso(new Date(), durationMonths);
    const contractReference = `NXP-CTR-${latestLoanAssessment?.id ?? Date.now()}`;
    const baseContract = {
      contract_version: "loan-contract-v1",
      contract_reference: contractReference,
      contract_type: "consumer-loan-agreement",
      lender_name: "NexaPay Bank",
      lender_branch: "Digital Lending Division",
      borrower_address: account.chain_address,
      borrower_name: account.full_name,
      borrower_cin: customerCin,
      purpose: loanApplication.loan_reason,
      requested_amount: loanApplication.requested_loan_amount,
      requested_amount_millimes: Math.round(loanApplication.requested_loan_amount * 1000),
      approved_amount: approvedAmount,
      approved_amount_millimes: Math.round(approvedAmount * 1000),
      duration_months: durationMonths,
      annual_interest_rate: loanApplication.annual_interest_rate,
      issue_date: issueDate,
      due_date: dueDate,
      decision: result.decision ?? "Offer available",
      monthly_installment:
        recommendedLoan?.estimated_monthly_installment ??
        requestedLoan?.estimated_monthly_installment ??
        null,
      total_repayment:
        recommendedLoan?.estimated_total_repayment ??
        requestedLoan?.estimated_total_repayment ??
        null,
      fraud_risk_level: result.fraud_risk_level ?? null,
      aml_risk_level: result.aml_risk_level ?? null,
      main_reasons: result.main_reasons ?? [],
      signature_rule: "Borrower must sign with legal name and account password before disbursement",
    };

    return {
      ...baseContract,
      clauses: buildContractClauses(baseContract),
    };
  }, [account, customerCin, latestLoanAssessment?.id, loanApplication.annual_interest_rate, loanApplication.loan_reason, loanApplication.preferred_duration_months, loanApplication.requested_loan_amount, loanScoreResult]);

  const txSummary = useMemo(() => {
    const totals = txs.reduce(
      (acc, tx) => {
        const amount = parseAmount(tx.amount_display);
        const isDebit = tx.direction.toLowerCase() === "out" || amount < 0;
        if (isDebit) {
          acc.debit += Math.abs(amount);
        } else {
          acc.credit += Math.abs(amount);
        }
        return acc;
      },
      { credit: 0, debit: 0 }
    );

    return {
      credit: totals.credit,
      debit: totals.debit,
    };
  }, [txs]);

  const chartValues = useMemo(() => {
    const fallback = [2500, 2600, 3100, 2900, 3400, 2800, 3600, 3000, 2700, 3300, 2900, 3200];
    if (txs.length === 0) return fallback;

    const buckets = Array.from({ length: 12 }, () => 0);
    txs.forEach((tx) => {
      const month = new Date(tx.timestamp).getMonth();
      const amount = Math.abs(parseAmount(tx.amount_display));
      if (month >= 0 && month < 12) {
        buckets[month] += amount;
      }
    });

    return buckets.map((value, index) => {
      if (value <= 0) return fallback[index];
      return Math.max(1200, Math.round(value * 0.7));
    });
  }, [txs]);

  const chartPath = useMemo(() => {
    const width = 680;
    const height = 220;
    const maxValue = Math.max(...chartValues, 1);
    return chartValues
      .map((value, index) => {
        const x = (index / (chartValues.length - 1)) * width;
        const y = height - (value / maxValue) * (height - 18);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [chartValues]);

  function hasInvalidSession(err: any): boolean {
    const status = err?.response?.status;
    const message = String(err?.response?.data?.error ?? "").toLowerCase();
    return status === 401 || status === 403 || message.includes("unauthorized") || message.includes("invalid token");
  }

  function logout(reason?: string) {
    try {
      localStorage.removeItem("nexapay_token");
      localStorage.removeItem("nexapay_address");
      localStorage.removeItem("nexapay_cin");
    } catch {}

    setToken("");
    setAddress("");
    setStoredCin("");
    setAccount(null);
    setTxs([]);

    const params = new URLSearchParams();
    if (reason) params.set("reason", reason);
    const query = params.toString();
    router.replace(query ? `/login?${query}` : "/login");
  }

  useEffect(() => {
    setPortalOrigin(window.location.origin);

    const params = new URLSearchParams(window.location.search);
    const pToken = params.get("token") ?? "";
    const pAddress = params.get("address") ?? "";

    let resolvedToken = pToken;
    let resolvedAddress = pAddress;

    try {
      const savedToken = localStorage.getItem("nexapay_token") ?? "";
      const savedAddress = localStorage.getItem("nexapay_address") ?? "";
      const savedCin = localStorage.getItem("nexapay_cin") ?? "";
      if (!resolvedToken) resolvedToken = savedToken;
      if (!resolvedAddress) resolvedAddress = savedAddress;
      setStoredCin(savedCin);
    } catch {}

    setToken(resolvedToken);
    setAddress(resolvedAddress);

    if (resolvedToken && resolvedAddress) {
      loadDashboardData(resolvedToken, resolvedAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loanStorageKey) return;

    try {
      const raw = localStorage.getItem(loanStorageKey);
      if (!raw) {
        setLoanAssessments([]);
        return;
      }

      const parsed = JSON.parse(raw);
      setLoanAssessments(Array.isArray(parsed) ? parsed : []);
    } catch {
      setLoanAssessments([]);
    }
  }, [loanStorageKey]);

  useEffect(() => {
    if (!showLoanModal || !account) return;
    setContractSignerName(account.full_name);
  }, [account, showLoanModal]);

  useEffect(() => {
    if (!showContractPaper) return;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#fbf4e7";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#1f3259";

    if (!contractSignatureDataUrl) return;

    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0, rect.width, rect.height);
    };
    image.src = contractSignatureDataUrl;
  }, [contractSignatureDataUrl, showContractPaper]);

  async function loadDashboardData(currentToken: string, currentAddress: string) {
    setError(null);
    setActionMessage(null);
    setLoadingDashboard(true);

    try {
      const headers = { "X-Account-Token": currentToken };
      const [accountRes, txRes, loansRes] = await Promise.all([
        api.get<AccountResponse>(`/accounts/${currentAddress}`, { headers }),
        api.get<TxResponse>(`/accounts/${currentAddress}/transactions`, { headers }),
        api.get<LoanHistoryResponse>(`/loans/${currentAddress}`, { headers }),
      ]);

      const fallbackCin = (() => {
        try {
          return localStorage.getItem("nexapay_cin") ?? "";
        } catch {
          return "";
        }
      })();

      const resolvedCin = accountRes.data.cin || fallbackCin;

      setAccount({
        ...accountRes.data,
        cin: resolvedCin,
      });
      setTxs(txRes.data.transactions);
      setLoanHistory(loansRes.data.loans);

      try {
        localStorage.setItem("nexapay_token", currentToken);
        localStorage.setItem("nexapay_address", currentAddress);
        if (resolvedCin) {
          localStorage.setItem("nexapay_cin", resolvedCin);
          setStoredCin(resolvedCin);
        }
      } catch {}
    } catch (err: any) {
      if (hasInvalidSession(err)) {
        logout("session_expired");
        return;
      }
      setError(err?.response?.data?.error ?? "Unable to load dashboard");
    } finally {
      setLoadingDashboard(false);
    }
  }

  function persistLoanAssessments(records: LoanAssessmentRecord[]) {
    setLoanAssessments(records);

    if (!loanStorageKey) return;
    try {
      localStorage.setItem(loanStorageKey, JSON.stringify(records));
    } catch {}
  }

  function closeLoanModal() {
    setShowContractPaper(false);
    setShowLoanModal(false);
  }

  function clearSignaturePad() {
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = "#fbf4e7";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }
    signatureDrawingRef.current = false;
    setContractSignatureDataUrl("");
    setContractSignatureReady(false);
  }

  function updateSignatureSnapshot() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    setContractSignatureDataUrl(canvas.toDataURL("image/png"));
    setContractSignatureReady(true);
  }

  function drawSignatureStroke(type: "start" | "move" | "end", event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (type === "start") {
      signatureDrawingRef.current = true;
      canvas.setPointerCapture(event.pointerId);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y + 0.01);
      ctx.stroke();
      return;
    }

    if (type === "move") {
      if (!signatureDrawingRef.current) return;
      ctx.lineTo(x, y);
      ctx.stroke();
      return;
    }

    if (!signatureDrawingRef.current) return;
    signatureDrawingRef.current = false;
    ctx.closePath();
    updateSignatureSnapshot();
  }

  function buildSignedContractDocument(signedAt: string): SignedLoanContractDocument | null {
    if (!pendingLoanContract || !contractSignatureDataUrl.trim()) return null;

    return {
      ...pendingLoanContract,
      signature: {
        signer_name: contractSignerName.trim(),
        drawn_signature_data_url: contractSignatureDataUrl,
        signed_at: signedAt,
        consent_statement:
          "The borrower confirms that this contract was reviewed in full, the repayment obligations were understood, and disbursement is authorized only on the signed approved amount.",
        password_attestation:
          "The borrower additionally confirmed identity using the protected account password at the time of signing.",
      },
    };
  }

  async function downloadSignedContract(document: SignedLoanContractDocument, meta: { loanId: string; contractHash: string }) {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 44;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (heightNeeded: number) => {
      if (y + heightNeeded <= pageHeight - margin) return;
      pdf.addPage();
      y = margin;
    };

    const addLine = (text: string, options?: { bold?: boolean; size?: number; gapAfter?: number }) => {
      const size = options?.size ?? 11;
      const lineGap = Math.max(16, Math.round(size * 1.45));
      const lines = pdf.splitTextToSize(text, contentWidth) as string[];

      pdf.setFont("helvetica", options?.bold ? "bold" : "normal");
      pdf.setFontSize(size);

      for (const line of lines) {
        ensureSpace(lineGap);
        pdf.text(line, margin, y);
        y += lineGap;
      }

      y += options?.gapAfter ?? 2;
    };

    addLine("Signed Loan Contract", { bold: true, size: 20, gapAfter: 4 });
    addLine(`Contract reference: ${document.contract_reference}`, { bold: true });
    addLine(`Loan ID: ${meta.loanId}`);
    addLine(`Contract hash: ${meta.contractHash}`, { gapAfter: 8 });

    addLine("Parties", { bold: true, size: 14, gapAfter: 0 });
    addLine(`Lender: ${document.lender_name} (${document.lender_branch})`);
    addLine(`Borrower: ${document.borrower_name}`);
    addLine(`Borrower CIN: ${document.borrower_cin}`);
    addLine(`Borrower address: ${document.borrower_address}`, { gapAfter: 8 });

    addLine("Loan Terms", { bold: true, size: 14, gapAfter: 0 });
    addLine(`Purpose: ${document.purpose}`);
    addLine(`Requested amount: ${formatTnd(document.requested_amount)}`);
    addLine(`Approved amount: ${formatTnd(document.approved_amount)}`);
    addLine(`Duration: ${document.duration_months} months`);
    addLine(`Annual interest rate: ${formatPercent(document.annual_interest_rate)}`);
    addLine(`Issue date: ${formatLongDate(document.issue_date)}`);
    addLine(`Due date: ${formatLongDate(document.due_date)}`);
    addLine(`Decision: ${document.decision}`, { gapAfter: 8 });

    if (document.monthly_installment != null) {
      addLine(`Estimated monthly installment: ${formatTnd(document.monthly_installment)}`);
    }
    if (document.total_repayment != null) {
      addLine(`Estimated total repayment: ${formatTnd(document.total_repayment)}`);
    }

    if (document.main_reasons.length > 0) {
      addLine("Main decision reasons", { bold: true, size: 14, gapAfter: 0 });
      for (const reason of document.main_reasons) {
        addLine(`- ${reason}`);
      }
    }

    addLine("Contract Clauses", { bold: true, size: 14, gapAfter: 0 });
    document.clauses.forEach((clause, index) => {
      addLine(`${index + 1}. ${clause.title}`, { bold: true, gapAfter: 0 });
      addLine(clause.body, { gapAfter: 4 });
    });

    addLine("Signature Record", { bold: true, size: 14, gapAfter: 0 });
    addLine(`Signer legal name: ${document.signature.signer_name}`);
    addLine(`Signed at: ${new Date(document.signature.signed_at).toLocaleString("en-GB")}`);
    addLine(`Consent statement: ${document.signature.consent_statement}`);
    addLine(`Password attestation: ${document.signature.password_attestation}`, { gapAfter: 6 });

    if (document.signature.drawn_signature_data_url.startsWith("data:image/")) {
      const signatureType = document.signature.drawn_signature_data_url.includes("image/jpeg") ? "JPEG" : "PNG";
      const signatureWidth = 240;
      const signatureHeight = 84;

      ensureSpace(signatureHeight + 34);
      addLine("Borrower signature:", { bold: true, gapAfter: 2 });
      try {
        pdf.addImage(document.signature.drawn_signature_data_url, signatureType, margin, y, signatureWidth, signatureHeight);
        y += signatureHeight + 10;
      } catch {
        addLine("Signature image could not be embedded in the PDF copy.");
      }
    }

    const safeBorrower = document.borrower_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "borrower";
    const filename = `loan-contract-${safeBorrower}-${meta.loanId}.pdf`;
    pdf.save(filename);
    setContractDownloadName(filename);
  }

  async function loadLoanHistory(currentToken: string, currentAddress: string) {
    setLoadingLoans(true);
    setLoanError(null);

    try {
      const { data } = await api.get<LoanHistoryResponse>(`/loans/${currentAddress}`, {
        headers: { "X-Account-Token": currentToken },
      });
      setLoanHistory(data.loans);
    } catch (err: any) {
      if (hasInvalidSession(err)) {
        logout("session_expired");
        return;
      }
      setLoanError(err?.response?.data?.error ?? "Unable to load loan history");
    } finally {
      setLoadingLoans(false);
    }
  }

  async function requestLoanScore() {
    setLoanError(null);
    setLoanScoreResult(null);
    setAcceptedLoanResult(null);
    setContractPassword("");
    setContractConsent(false);
    setContractSignatureDataUrl("");
    setContractSignatureReady(false);
    setContractDownloadName("");
    setShowContractPaper(false);

    const customerCin = account?.cin || storedCin;

    if (!customerCin) {
      setLoanError("Unable to identify your CIN for loan scoring");
      return;
    }

    if (!loanApplication.loan_reason.trim()) {
      setLoanError("Loan reason is required");
      return;
    }

    if (loanApplication.requested_loan_amount <= 0) {
      setLoanError("Requested loan amount must be greater than zero");
      return;
    }

    if (loanApplication.amt_income_total <= 0) {
      setLoanError("Annual income must be greater than zero");
      return;
    }

    setSubmittingLoanRequest(true);
    try {
      const payload = {
        cin_number: customerCin,
        loan: {
          requested_amount: loanApplication.requested_loan_amount,
          requested_duration_months: Number(loanApplication.preferred_duration_months || 36),
          annual_interest_rate: loanApplication.annual_interest_rate,
          reason: loanApplication.loan_reason,
          collateral_type: loanApplication.collateral_type,
          collateral_estimated_value: loanApplication.collateral_estimated_value,
        },
        financial: {
          amt_income_total: loanApplication.amt_income_total,
          amt_credit: loanApplication.amt_credit,
          amt_annuity: loanApplication.amt_annuity,
          amt_goods_price: loanApplication.amt_goods_price,
        },
        profile: {
          name_income_type: loanApplication.name_income_type,
          name_education_type: loanApplication.name_education_type,
          name_family_status: loanApplication.name_family_status,
          occupation_type: loanApplication.occupation_type,
          days_birth: loanApplication.days_birth,
          days_employed: loanApplication.days_employed,
          cnt_children: loanApplication.cnt_children,
          cnt_fam_members: loanApplication.cnt_fam_members,
        },
      };

      const response = await fetch("/api/loan/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: LoanScoreResponse = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error((data as any)?.error || "Unable to evaluate loan request");
      }

      setLoanScoreResult(data);
      setActionMessage("Loan score updated. Review the decision details in the modal and dashboard.");

      const result = data.result ?? {};
      const requestedLoan = result.repayment_estimates?.requested_loan;
      const assessment: LoanAssessmentRecord = {
        id: `${Date.now()}`,
        created_at: new Date().toISOString(),
        cin_number: customerCin,
        requested_amount: loanApplication.requested_loan_amount,
        preferred_duration_months: loanApplication.preferred_duration_months,
        collateral_type: loanApplication.collateral_type,
        decision: result.decision || "Pending review",
        credit_score: result.credit_score ?? null,
        recommended_amount: result.max_recommended_loan ?? null,
        recommended_duration_months: result.recommended_duration_months ?? null,
        affordability_ok: typeof requestedLoan?.within_affordability_limit === "boolean"
          ? requestedLoan.within_affordability_limit
          : null,
        probability_default: result.probability_default ?? null,
        fraud_risk_level: result.fraud_risk_level ?? null,
        aml_risk_level: result.aml_risk_level ?? null,
        response: data,
      };

      persistLoanAssessments([assessment, ...loanAssessments].slice(0, 12));
    } catch (err: any) {
      setLoanError(err?.message || "Unable to evaluate loan request");
    } finally {
      setSubmittingLoanRequest(false);
    }
  }

  async function acceptLoanOffer() {
    setLoanError(null);

    if (!account || !pendingLoanContract) {
      setLoanError("No signed loan contract is available yet");
      return;
    }

    if (!contractSignerName.trim()) {
      setLoanError("Signer legal name is required");
      return;
    }

    if (!contractConsent) {
      setLoanError("You must accept the contract terms before signing");
      return;
    }

    if (!contractPassword.trim()) {
      setLoanError("Account password is required to sign the contract");
      return;
    }

    if (!contractSignatureReady || !contractSignatureDataUrl.trim()) {
      setLoanError("A handwritten electronic signature is required before signing");
      return;
    }

    const amountMillimes = pendingLoanContract.approved_amount_millimes;
    if (amountMillimes <= 0) {
      setLoanError("Recommended loan amount is invalid");
      return;
    }

    setAcceptingLoanOffer(true);
    try {
      const signedAt = new Date().toISOString();
      const contractDocument = buildSignedContractDocument(signedAt);
      if (!contractDocument) {
        throw new Error("Unable to build the signed contract document");
      }

      const contractTerms = JSON.stringify(contractDocument);
      const contractHash = await sha256Hex(contractTerms);

      const { data } = await api.post<LoanApprovalResponse>(
        "/loans/request",
        {
          borrower: account.chain_address,
          amount: amountMillimes,
          purpose: pendingLoanContract.purpose || "Loan offer accepted from score result",
          duration_months: pendingLoanContract.duration_months,
          annual_interest_rate: pendingLoanContract.annual_interest_rate,
          requested_amount: pendingLoanContract.requested_amount_millimes,
          contract_hash: contractHash,
          contract_terms: contractTerms,
          contract_version: pendingLoanContract.contract_version,
          contract_signed_by: contractSignerName.trim(),
          contract_signature_data_url: contractSignatureDataUrl,
          contract_password: contractPassword,
        },
        { headers: { "X-Account-Token": token } },
      );

      setAcceptedLoanResult(data);
      setActionMessage("Loan offer accepted, the signed contract was stored, and the customer copy was downloaded.");
      setContractPassword("");
      setContractConsent(false);
      setShowContractPaper(false);
      await downloadSignedContract(contractDocument, { loanId: data.loan_id, contractHash: data.contract_hash });
      await loadDashboardData(token, address);
      await loadLoanHistory(token, address);
    } catch (err: any) {
      if (hasInvalidSession(err)) {
        logout("session_expired");
        return;
      }
      setLoanError(err?.response?.data?.error ?? "Unable to accept the loan offer");
    } finally {
      setAcceptingLoanOffer(false);
    }
  }

  async function searchRecipients() {
    setError(null);
    setActionMessage(null);

    if (recipientQuery.trim().length < 2) {
      setError("Type at least 2 characters to search");
      return;
    }

    setLoadingRecipients(true);
    try {
      const { data } = await api.get<RecipientSearchResponse>(`/accounts/${address}/search`, {
        params: { q: recipientQuery.trim() },
        headers: { "X-Account-Token": token },
      });
      setRecipients(data.results);
      if (data.results.length === 0) {
        setActionMessage("No recipient found for this query");
      }
    } catch (err: any) {
      if (hasInvalidSession(err)) {
        logout("session_expired");
        return;
      }
      setError(err?.response?.data?.error ?? "Unable to search recipients");
    } finally {
      setLoadingRecipients(false);
    }
  }

  async function sendTransfer() {
    setError(null);
    setActionMessage(null);

    if (!selectedRecipient) {
      setError("Select a recipient before sending");
      return;
    }

    if (transferAmountMillimes <= 0) {
      setError("Transfer amount must be positive");
      return;
    }

    setSubmittingTransfer(true);
    try {
      await api.post(
        `/accounts/${address}/transfer`,
        {
          to: selectedRecipient.chain_address,
          amount: transferAmountMillimes,
          memo: transferMemo || undefined,
          pin: transferPin,
        },
        { headers: { "X-Account-Token": token } },
      );

      setActionMessage(`Transfer sent to ${selectedRecipient.full_name}`);
      setTransferMemo("");
      await loadDashboardData(token, address);
    } catch (err: any) {
      if (hasInvalidSession(err)) {
        logout("session_expired");
        return;
      }
      setError(err?.response?.data?.error ?? "Transfer failed");
    } finally {
      setSubmittingTransfer(false);
    }
  }

  async function copyLink() {
    if (!receiveLink) return;

    try {
      await navigator.clipboard.writeText(receiveLink);
      setCopiedReceiveLink(true);
      window.setTimeout(() => setCopiedReceiveLink(false), 1800);
    } catch {
      setError("Copy failed. Please copy the payment link manually.");
    }
  }

  if (!token || !address) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <Card className="rounded-[28px] border-teal-300/20 bg-[linear-gradient(160deg,#121a31,#0c1120)] p-9 text-center">
          <h1 className="font-[var(--font-sora)] text-3xl font-semibold">Connect your dashboard session</h1>
          <p className="mx-auto mt-3 max-w-xl text-white/70">
            No active token was found on this browser. Connect again and we will restore your banking cockpit instantly.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/login" className="neo-btn neo-btn--primary">
              Connect again
            </Link>
            <Link href="/register" className="neo-btn neo-btn--dark">
              Create profile
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1420px] px-4 py-8 lg:py-10">
      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(150deg,#121a31_0%,#0a0f1d_65%)] shadow-[0_40px_80px_rgba(0,0,0,0.45)]">
        <div className="grid min-h-[860px] lg:grid-cols-[248px_1fr]">
          <aside className="flex flex-col border-b border-white/10 bg-[linear-gradient(180deg,#0d1c2e,#0a1523)] p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2">
              <BrandLogo withWordmark={false} size="md" />
              <div>
                <p className="text-lg font-semibold text-white">NexaPay</p>
                <p className="text-xs text-white/45">Customer cockpit</p>
              </div>
            </div>

            <nav className="mt-8 space-y-2">
              {dashboardSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition ${
                    activeMenu === section.id
                      ? "border-[#2de6c4]/45 bg-[#2de6c4]/20 text-[#7ff6e2]"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white"
                  }`}
                  onClick={() => setActiveMenu(section.id)}
                >
                  <span>{section.label}</span>
                  <span className="text-[10px] uppercase tracking-[0.16em]">{section.id.slice(0, 1)}</span>
                </button>
              ))}
            </nav>

            <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-white">Need support?</p>
              <p className="mt-1 text-xs leading-relaxed text-white/60">
                Try customer support for account help, transfer checks, and identity verification follow-up.
              </p>
              <Button size="sm" variant="ghost" className="mt-3 w-full border-[#2de6c4]/35 text-[#9ffbec] hover:bg-[#2de6c4]/15">
                Contact us
              </Button>
            </div>
          </aside>

          <div className="p-5 md:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">Cards</p>
                <h1 className="mt-1 font-[var(--font-sora)] text-3xl font-semibold text-white">One card, all controls</h1>
                <p className="mt-2 text-sm text-white/70">
                  Manage your NexaPay card, account details, and transfer actions from one focused workspace.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/login" className="neo-btn neo-btn--dark">Connect again</Link>
                <Button type="button" variant="ghost" className="h-[46px]" onClick={() => logout("manual_logout")}>Logout</Button>
              </div>
            </div>

            {loadingDashboard ? <p className="mt-3 text-sm text-white/70">Loading account...</p> : null}
            {error ? <p className="mt-3 text-sm text-[#ffb089]">{error}</p> : null}
            {actionMessage ? <p className="mt-3 text-sm text-[#8ef9e8]">{actionMessage}</p> : null}

            {account ? (
              <>
                <section className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#05090f] p-5">
                    <div className="pointer-events-none absolute -left-14 bottom-0 h-44 w-52 rounded-full bg-[#c6ff2a]/35 blur-[56px]" />
                    <div className="pointer-events-none absolute right-0 top-0 h-36 w-52 rounded-full bg-[#2de6c4]/22 blur-[48px]" />

                    <div className="relative z-10 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/55">Digital card</p>
                        <p className="mt-1 text-sm text-white/70">Styled like your landing card, now fully interactive</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80"
                        onClick={() => setShowCardBack((prev) => !prev)}
                      >
                        {showCardBack ? "Flip to front" : "Flip to back"}
                      </button>
                    </div>

                    <div className="relative z-10 mt-5 [perspective:1200px]">
                      <div
                        className="relative h-[220px] w-full rounded-2xl transform-gpu transition-transform duration-500"
                        style={{
                          transform: showCardBack ? "rotateY(180deg)" : "rotateY(0deg)",
                          transformStyle: "preserve-3d",
                          WebkitTransformStyle: "preserve-3d",
                        }}
                      >
                        <div
                          className="absolute inset-0 overflow-hidden rounded-2xl border border-white/20 bg-[linear-gradient(130deg,#191f2b,#0a0f18)] p-5"
                          style={{
                            transform: "rotateY(0deg)",
                            backfaceVisibility: "hidden",
                            WebkitBackfaceVisibility: "hidden",
                            opacity: showCardBack ? 0 : 1,
                            transition: "opacity 180ms ease",
                          }}
                        >
                          <div className="absolute -left-6 top-10 h-28 w-28 rounded-full bg-[#c6ff2a]/40 blur-[22px]" />
                          <div className="absolute right-4 top-4 h-7 w-7 rounded-full bg-white/20" />
                          <div className="absolute right-8 top-4 h-7 w-7 rounded-full bg-white/10" />
                          <div className="relative z-10">
                            <p className="text-xs uppercase tracking-[0.24em] text-white/65">NexaPay</p>
                            <p className="mt-8 text-2xl tracking-[0.21em] text-white">5224 4544 **** {account.card_last4}</p>
                            <div className="mt-8 flex items-center justify-between text-sm text-white/80">
                              <span>{account.full_name.toUpperCase()}</span>
                              <span>{account.card_expiry}</span>
                            </div>
                          </div>
                        </div>

                        <div
                          className="absolute inset-0 rounded-2xl border border-white/20 bg-[linear-gradient(130deg,#1c2438,#10192d)] p-5"
                          style={{
                            transform: "rotateY(180deg)",
                            backfaceVisibility: "hidden",
                            WebkitBackfaceVisibility: "hidden",
                            opacity: showCardBack ? 1 : 0,
                            transition: "opacity 180ms ease",
                          }}
                        >
                          <div className="h-10 rounded bg-black/35" />
                          <p className="mt-5 text-sm uppercase tracking-[0.18em] text-white/60">Security code</p>
                          <div className="mt-3 ml-auto max-w-[140px] rounded bg-white/85 px-3 py-2 text-right text-sm font-semibold text-black">
                            CVV {account.cvv || "***"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <Card className="rounded-2xl border-white/10 bg-[#10192b] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-white/55">Account details</p>
                      <div className="mt-3 space-y-2 text-sm text-white/80">
                        <p>Account Number: {account.account_number}</p>
                        <p>Card Expiry: {account.card_expiry}</p>
                        <p>IBAN: {account.iban}</p>
                        <p>RIB: {account.rib}</p>
                      </div>
                    </Card>

                    <Card className="rounded-2xl border-white/10 bg-[#10192b] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.18em] text-white/55">Actions</p>
                        <span className="rounded-lg border border-white/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/70">
                          Active: {activeAction}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] ${activeAction === "send" ? "border-[#2de6c4]/45 bg-[#2de6c4]/20 text-[#8ef9e8]" : "border-white/15 text-white/75"}`}
                          onClick={() => setActiveAction("send")}
                        >
                          Send
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-[#c6ff2a]/40 bg-[#c6ff2a]/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#dbff88]"
                          onClick={() => setShowReceiveModal(true)}
                        >
                          Receive
                        </button>
                        <button
                          type="button"
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] ${activeAction === "loan" ? "border-[#2de6c4]/45 bg-[#2de6c4]/20 text-[#8ef9e8]" : "border-white/15 text-white/75"}`}
                          onClick={() => {
                            setActiveAction("loan");
                            setLoanError(null);
                            setShowLoanModal(true);
                          }}
                        >
                          Loan
                        </button>
                      </div>

                      {activeAction === "send" ? (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                          <p className="text-sm text-white/75">Search recipient and transfer instantly</p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <input
                              className="h-10 min-w-[200px] flex-1 rounded-xl border border-white/15 bg-[#0b1426] px-3 text-sm text-white outline-none focus:border-[#2de6c4]"
                              placeholder="Search by name / CIN / phone"
                              value={recipientQuery}
                              onChange={(e) => setRecipientQuery(e.target.value)}
                            />
                            <Button type="button" onClick={searchRecipients} disabled={loadingRecipients} className="h-10 border-[#2de6c4]/40 bg-[linear-gradient(120deg,#2de6c4,#8fffe8)] text-[#06271f]">
                              {loadingRecipients ? "Searching..." : "Search"}
                            </Button>
                          </div>

                          {recipients.length > 0 ? (
                            <ul className="mt-3 grid gap-2">
                              {recipients.map((recipient) => (
                                <li
                                  key={recipient.chain_address}
                                  className={`cursor-pointer rounded-xl border p-2.5 text-xs ${
                                    selectedRecipient?.chain_address === recipient.chain_address
                                      ? "border-[#2de6c4]/45 bg-[#2de6c4]/10"
                                      : "border-white/10"
                                  }`}
                                  onClick={() => setSelectedRecipient(recipient)}
                                >
                                  <p className="font-semibold text-white">{recipient.full_name}</p>
                                  <p className="text-white/65">CIN: {recipient.cin} | Phone: {recipient.phone}</p>
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          <div className="mt-3 grid gap-2">
                            <input
                              type="number"
                              min={1}
                              className="h-10 rounded-xl border border-white/15 bg-[#0b1426] px-3 text-sm text-white outline-none focus:border-[#2de6c4]"
                              placeholder="Amount (TND)"
                              value={transferAmountTnd}
                              onChange={(e) => setTransferAmountTnd(Number(e.target.value))}
                            />
                            <input
                              className="h-10 rounded-xl border border-white/15 bg-[#0b1426] px-3 text-sm text-white outline-none focus:border-[#2de6c4]"
                              placeholder="PIN (4 digits)"
                              value={transferPin}
                              onChange={(e) => setTransferPin(e.target.value)}
                            />
                            <input
                              className="h-10 rounded-xl border border-white/15 bg-[#0b1426] px-3 text-sm text-white outline-none focus:border-[#2de6c4]"
                              placeholder="Memo (optional)"
                              value={transferMemo}
                              onChange={(e) => setTransferMemo(e.target.value)}
                            />
                          </div>

                          <Button
                            className="mt-3 h-10 border-[#2de6c4]/40 bg-[linear-gradient(120deg,#2de6c4,#8fffe8)] text-[#06271f]"
                            type="button"
                            onClick={sendTransfer}
                            disabled={submittingTransfer}
                          >
                            {submittingTransfer ? "Sending..." : "Send transfer"}
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                          <h3 className="font-[var(--font-sora)] text-base font-semibold">Loan scoring</h3>
                          <p className="mt-2 text-sm leading-relaxed text-white/70">
                            Open the loan request modal to submit your financial profile, run the external scoring engine, and review the recommendation before any manual compliance follow-up.
                          </p>
                          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs text-white/60">
                            Required inputs include loan amount, purpose, duration, collateral, income, credit exposure, and profile details.
                          </div>
                          <Button
                            type="button"
                            className="mt-3 h-10 border-[#2de6c4]/40 bg-[linear-gradient(120deg,#2de6c4,#8fffe8)] text-[#06271f]"
                            onClick={() => {
                              setLoanError(null);
                              setShowLoanModal(true);
                            }}
                          >
                            Open loan request
                          </Button>
                        </div>
                      )}
                    </Card>
                  </div>
                </section>

                <section className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[#2de6c4]/20 bg-[#0f1f32] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/55">Total Cash Balance</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{account.balance_display}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#121d32] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/55">Credits</p>
                    <p className="mt-2 text-2xl font-semibold text-[#8ef9e8]">{formatTnd(txSummary.credit)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#121d32] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/55">Debits</p>
                    <p className="mt-2 text-2xl font-semibold text-[#ffb089]">{formatTnd(txSummary.debit)}</p>
                  </div>
                </section>

                <section className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                  <Card className="rounded-2xl border-white/10 bg-[#111b30] p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="mr-auto">
                        <h2 className="font-[var(--font-sora)] text-xl font-semibold">Loan assessment history</h2>
                        <p className="mt-1 text-sm text-white/60">Every score request you submit from this customer dashboard is saved per account on this browser.</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="border-[#2de6c4]/35 text-[#9ffbec] hover:bg-[#2de6c4]/15"
                        onClick={() => {
                          setActiveAction("loan");
                          setShowLoanModal(true);
                        }}
                      >
                        New request
                      </Button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {loanAssessments.length === 0 ? (
                        <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/65">
                          No loan assessment has been submitted yet. Open the loan modal to evaluate the customer profile.
                        </p>
                      ) : (
                        loanAssessments.map((assessment) => (
                          <div key={assessment.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">{assessment.decision}</p>
                                <p className="mt-1 text-xs text-white/55">
                                  {new Date(assessment.created_at).toLocaleString()} | Requested {formatTnd(assessment.requested_amount)}
                                </p>
                              </div>
                              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${riskBadgeClassName(assessment.affordability_ok === false ? "high" : "low")}`}>
                                {assessment.affordability_ok === null
                                  ? "Assessment"
                                  : assessment.affordability_ok
                                    ? "Affordable"
                                    : "Over limit"}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-white/75 md:grid-cols-2">
                              <p>Credit score: {assessment.credit_score ?? "N/A"}</p>
                              <p>Probability of default: {assessment.probability_default ?? "N/A"}%</p>
                              <p>Recommended loan: {assessment.recommended_amount ? formatTnd(assessment.recommended_amount) : "N/A"}</p>
                              <p>Recommended duration: {assessment.recommended_duration_months ?? "N/A"} months</p>
                              <p>Fraud risk: {assessment.fraud_risk_level ?? "N/A"}</p>
                              <p>AML risk: {assessment.aml_risk_level ?? "N/A"}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>

                  <Card className="rounded-2xl border-white/10 bg-[#111b30] p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="mr-auto">
                        <h2 className="font-[var(--font-sora)] text-xl font-semibold">Current loan status</h2>
                        <p className="mt-1 text-sm text-white/60">Existing disbursed loans and repayment state from the core NexaPay backend.</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="border-white/15 hover:bg-white/10"
                        onClick={() => void loadLoanHistory(token, address)}
                      >
                        Refresh
                      </Button>
                    </div>

                    {loadingLoans ? <p className="mt-4 text-sm text-white/60">Loading loan history...</p> : null}
                    {loanError ? <p className="mt-4 text-sm text-[#ffb089]">{loanError}</p> : null}

                    <div className="mt-4 space-y-3">
                      {loanHistory.length === 0 ? (
                        <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/65">
                          No active or past loan has been stored for this account yet.
                        </p>
                      ) : (
                        loanHistory.map((loan) => (
                          <div key={loan.loan_id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">{formatTnd(loan.amount / 1000)}</p>
                                <p className="mt-1 text-xs text-white/55">
                                  Opened {new Date(loan.created_at).toLocaleDateString()} | Due {loan.due_date}
                                </p>
                              </div>
                              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${loanStatusClassName(loan.status)}`}>
                                {loan.status}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-white/75">
                              <p>Interest rate: {loan.interest_rate}</p>
                              {loan.duration_months ? <p>Duration: {loan.duration_months} months</p> : null}
                              {loan.purpose ? <p>Purpose: {loan.purpose}</p> : null}
                              {loan.contract_signed_by ? <p>Signed by: {loan.contract_signed_by}</p> : null}
                              {loan.contract_signed_at ? <p>Signed at: {new Date(loan.contract_signed_at).toLocaleString()}</p> : null}
                              <p className="break-all">Contract hash: {loan.contract_hash}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {latestLoanAssessment ? (
                      <div className="mt-4 rounded-xl border border-[#2de6c4]/20 bg-[#0d1d2a] p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-[#8ef9e8]">Latest scoring response</p>
                        <p className="mt-2 text-lg font-semibold text-white">{latestLoanAssessment.decision}</p>
                        <p className="mt-2 text-sm text-white/70">
                          Latest recommended ceiling:{" "}
                          {latestLoanAssessment.recommended_amount
                            ? formatTnd(latestLoanAssessment.recommended_amount)
                            : "No recommendation returned"}
                        </p>
                      </div>
                    ) : null}
                  </Card>
                </section>

                <section className="mt-5 grid gap-4">
                  <Card className="rounded-2xl border-white/10 bg-[#111b30] p-5">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <h2 className="mr-auto font-[var(--font-sora)] text-xl font-semibold">Annual balance statistic</h2>
                      <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">Monthly</span>
                      <span className="rounded-full border border-[#2de6c4]/40 bg-[#2de6c4]/20 px-3 py-1 text-xs text-[#9ffbed]">Yearly</span>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#0c1528] p-4">
                      <svg viewBox="0 0 680 220" className="h-[220px] w-full" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#7ff6e2" />
                            <stop offset="100%" stopColor="#26c2b6" />
                          </linearGradient>
                        </defs>
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <line
                            key={idx}
                            x1="0"
                            y1={22 + idx * 35}
                            x2="680"
                            y2={22 + idx * 35}
                            stroke="rgba(255,255,255,0.07)"
                          />
                        ))}
                        <path d={chartPath} fill="none" stroke="url(#lineStroke)" strokeWidth="4" strokeLinecap="round" />
                      </svg>
                      <div className="mt-3 grid grid-cols-6 gap-2 text-center text-[11px] uppercase tracking-[0.12em] text-white/45 md:grid-cols-12">
                        {[
                          "Jan",
                          "Feb",
                          "Mar",
                          "Apr",
                          "May",
                          "Jun",
                          "Jul",
                          "Aug",
                          "Sep",
                          "Oct",
                          "Nov",
                          "Dec",
                        ].map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                    </div>
                  </Card>

                  <Card className="rounded-2xl border-white/10 bg-[#111b30] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-[var(--font-sora)] text-xl font-semibold">All transactions</h2>
                      <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
                        {txs.length} item{txs.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {txs.length === 0 ? (
                        <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/65">No transactions yet.</p>
                      ) : (
                        txs.map((tx) => (
                          <div key={tx.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-white">{tx.memo || tx.type}</p>
                                <p className="text-xs text-white/55">{new Date(tx.timestamp).toLocaleString()}</p>
                              </div>
                              <p className={tx.direction.toLowerCase() === "out" ? "text-[#ffb089]" : "text-[#8ef9e8]"}>{tx.amount_display}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </section>

              </>
            ) : null}
          </div>
        </div>
      </section>

      {showLoanModal && account ? (
        <>
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/78 p-4" onClick={closeLoanModal}>
          <Card
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border-white/15 bg-[linear-gradient(150deg,#131d32,#0d1425)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/55">Loan request</p>
                <h2 className="mt-1 font-[var(--font-sora)] text-2xl font-semibold">Customer loan scoring form</h2>
                <p className="mt-2 text-sm text-white/70">
                  Submit the customer profile to the external scoring service, then review the recommendation and compliance flags before any manual approval step.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/20 px-3 py-1.5 text-sm text-white/80"
                onClick={closeLoanModal}
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void requestLoanScore();
                }}
              >
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-2">
                  <DashboardField label="CIN Number" value={account.cin} disabled />
                  <DashboardField label="Full Name" value={account.full_name} disabled />
                  <DashboardField
                    label="Requested Loan Amount (TND)"
                    type="number"
                    min={1}
                    value={loanApplication.requested_loan_amount}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        requested_loan_amount: Number(e.target.value),
                      }))
                    }
                  />
                  <DashboardField
                    label="Preferred Duration (months)"
                    type="number"
                    min={1}
                    placeholder="36"
                    value={loanApplication.preferred_duration_months}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        preferred_duration_months: e.target.value,
                      }))
                    }
                  />
                  <DashboardField
                    label="Annual Interest Rate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={loanApplication.annual_interest_rate}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        annual_interest_rate: Number(e.target.value),
                      }))
                    }
                  />
                  <DashboardField
                    label="Loan Reason"
                    className="md:col-span-2"
                    value={loanApplication.loan_reason}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        loan_reason: e.target.value,
                      }))
                    }
                  />
                  <DashboardSelect
                    label="Collateral Type"
                    value={loanApplication.collateral_type}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        collateral_type: e.target.value,
                      }))
                    }
                    options={["None", "Property", "Vehicle", "Cash deposit", "Equipment", "Other"]}
                  />
                  <DashboardField
                    label="Collateral Estimated Value (TND)"
                    type="number"
                    min={0}
                    value={loanApplication.collateral_estimated_value}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        collateral_estimated_value: Number(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-2">
                  <DashboardField
                    label="Annual Income Total"
                    type="number"
                    min={0}
                    value={loanApplication.amt_income_total}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        amt_income_total: Number(e.target.value),
                      }))
                    }
                  />
                  <DashboardField
                    label="Current Credit Exposure"
                    type="number"
                    min={0}
                    value={loanApplication.amt_credit}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        amt_credit: Number(e.target.value),
                      }))
                    }
                  />
                  <DashboardField
                    label="Annual Annuity"
                    type="number"
                    min={0}
                    value={loanApplication.amt_annuity}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        amt_annuity: Number(e.target.value),
                      }))
                    }
                  />
                  <DashboardField
                    label="Goods Price"
                    type="number"
                    min={0}
                    value={loanApplication.amt_goods_price}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        amt_goods_price: Number(e.target.value),
                      }))
                    }
                  />
                  <DashboardSelect
                    label="Income Type"
                    value={loanApplication.name_income_type}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        name_income_type: e.target.value,
                      }))
                    }
                    options={["Working", "Commercial associate", "Pensioner", "State servant", "Businessman", "Student"]}
                  />
                  <DashboardSelect
                    label="Education Type"
                    value={loanApplication.name_education_type}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        name_education_type: e.target.value,
                      }))
                    }
                    options={["Higher education", "Secondary / secondary special", "Incomplete higher", "Lower secondary", "Academic degree"]}
                  />
                  <DashboardSelect
                    label="Family Status"
                    value={loanApplication.name_family_status}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        name_family_status: e.target.value,
                      }))
                    }
                    options={["Married", "Single / not married", "Civil marriage", "Separated", "Widow"]}
                  />
                  <DashboardField
                    label="Occupation Type"
                    value={loanApplication.occupation_type}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        occupation_type: e.target.value,
                      }))
                    }
                  />
                  <DashboardField
                    label="Days Birth"
                    type="number"
                    value={loanApplication.days_birth}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        days_birth: Number(e.target.value),
                      }))
                    }
                  />
                  <DashboardField
                    label="Days Employed"
                    type="number"
                    value={loanApplication.days_employed}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        days_employed: Number(e.target.value),
                      }))
                    }
                  />
                  <DashboardField
                    label="Children Count"
                    type="number"
                    min={0}
                    value={loanApplication.cnt_children}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        cnt_children: Number(e.target.value),
                      }))
                    }
                  />
                  <DashboardField
                    label="Family Members Count"
                    type="number"
                    min={1}
                    value={loanApplication.cnt_fam_members}
                    onChange={(e) =>
                      setLoanApplication((prev) => ({
                        ...prev,
                        cnt_fam_members: Number(e.target.value),
                      }))
                    }
                  />
                </div>

                {loanError ? <p className="text-sm text-[#ffb089]">{loanError}</p> : null}

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={submittingLoanRequest}>
                    {submittingLoanRequest ? "Evaluating loan..." : "Evaluate Loan Request"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setLoanApplication(initialLoanApplication);
                      setLoanError(null);
                      setContractPassword("");
                      setContractConsent(false);
                      setContractSignatureDataUrl("");
                      setContractSignatureReady(false);
                      setContractDownloadName("");
                      setShowContractPaper(false);
                    }}
                  >
                    Reset Form
                  </Button>
                </div>
              </form>

              <div className="grid gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Current response</p>

                  {loanScoreResult?.result ? (
                    <div className="mt-3 space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <LoanMetricCard label="Credit score" value={String(loanScoreResult.result.credit_score ?? "N/A")} />
                        <LoanMetricCard
                          label="Decision"
                          value={loanScoreResult.result.decision ?? "Pending"}
                          accent
                        />
                        <LoanMetricCard
                          label="Probability default"
                          value={
                            loanScoreResult.result.probability_default != null
                              ? `${loanScoreResult.result.probability_default}%`
                              : "N/A"
                          }
                        />
                        <LoanMetricCard
                          label="Recommended max loan"
                          value={
                            loanScoreResult.result.max_recommended_loan != null
                              ? formatTnd(loanScoreResult.result.max_recommended_loan)
                              : "N/A"
                          }
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClassName(loanScoreResult.result.fraud_risk_level)}`}>
                          Fraud: {loanScoreResult.result.fraud_risk_level ?? "N/A"}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClassName(loanScoreResult.result.aml_risk_level)}`}>
                          AML: {loanScoreResult.result.aml_risk_level ?? "N/A"}
                        </span>
                      </div>

                      {loanScoreResult.result.main_reasons && loanScoreResult.result.main_reasons.length > 0 ? (
                        <div>
                          <p className="text-sm font-semibold text-white">Main reasons</p>
                          <ul className="mt-2 space-y-2 text-sm text-white/72">
                            {loanScoreResult.result.main_reasons.map((reason) => (
                              <li key={reason} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
                        <p className="font-semibold text-white">Repayment estimate</p>
                        <p className="mt-2">
                          Requested installment:{" "}
                          {loanScoreResult.result.repayment_estimates?.requested_loan?.estimated_monthly_installment != null
                            ? formatTnd(loanScoreResult.result.repayment_estimates.requested_loan.estimated_monthly_installment)
                            : "N/A"}
                        </p>
                        <p className="mt-1">
                          Recommended installment:{" "}
                          {loanScoreResult.result.repayment_estimates?.recommended_loan?.estimated_monthly_installment != null
                            ? formatTnd(loanScoreResult.result.repayment_estimates.recommended_loan.estimated_monthly_installment)
                            : "N/A"}
                        </p>
                        <p className="mt-1">
                          Affordability check:{" "}
                          {loanScoreResult.result.repayment_estimates?.requested_loan?.within_affordability_limit == null
                            ? "N/A"
                            : loanScoreResult.result.repayment_estimates.requested_loan.within_affordability_limit
                              ? "Within limit"
                              : "Above allowed monthly limit"}
                        </p>
                      </div>

                      {pendingLoanContract ? (
                        <div className="rounded-xl border border-[#8aa7ff]/20 bg-[#8aa7ff]/10 p-4 text-sm text-white/78">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-white">Formal contract package ready</p>
                            <span className="rounded-full border border-[#8aa7ff]/25 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[#d7e0ff]">
                              Signature required
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <p>Contract ref: {pendingLoanContract.contract_reference}</p>
                            <p>Lender: {pendingLoanContract.lender_name}</p>
                            <p>Borrower: {pendingLoanContract.borrower_name}</p>
                            <p>CIN: {pendingLoanContract.borrower_cin}</p>
                            <p>Requested amount: {formatTnd(pendingLoanContract.requested_amount)}</p>
                            <p>Approved amount: {formatTnd(pendingLoanContract.approved_amount)}</p>
                            <p>Duration: {pendingLoanContract.duration_months} months</p>
                            <p>Interest rate: {formatPercent(pendingLoanContract.annual_interest_rate)}</p>
                            <p>Estimated installment: {pendingLoanContract.monthly_installment != null ? formatTnd(pendingLoanContract.monthly_installment) : "To be confirmed"}</p>
                            <p>Estimated total repayment: {pendingLoanContract.total_repayment != null ? formatTnd(pendingLoanContract.total_repayment) : "To be confirmed"}</p>
                            <p>Purpose: {pendingLoanContract.purpose}</p>
                            <p>Due date: {pendingLoanContract.due_date}</p>
                          </div>
                          {pendingLoanContract.main_reasons.length > 0 ? (
                            <div className="mt-3">
                              <p className="text-xs uppercase tracking-[0.14em] text-white/55">Offer basis</p>
                              <ul className="mt-2 space-y-2 text-sm text-white/72">
                                {pendingLoanContract.main_reasons.map((reason) => (
                                  <li key={reason} className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                                    {reason}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <p className="mt-3 text-xs text-white/60">
                            {pendingLoanContract.signature_rule}
                          </p>
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <Button type="button" onClick={() => setShowContractPaper(true)}>
                              Open Contract Paper
                            </Button>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${contractSignatureReady ? "border-[#2de6c4]/35 bg-[#2de6c4]/12 text-[#9ffbec]" : "border-white/10 bg-black/20 text-white/65"}`}>
                              {contractSignatureReady ? "Drawn signature captured" : "Awaiting handwritten e-signature"}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-white/64">
                            The customer must open the contract paper, review the legal clauses, draw an electronic signature with touch or mouse, confirm the account password, and sign before the loan is disbursed.
                          </p>
                          {contractDownloadName ? (
                            <p className="mt-2 text-xs text-[#d7e0ff]">
                              Latest downloaded copy: {contractDownloadName}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {acceptedLoanResult ? (
                        <div className="rounded-xl border border-[#2de6c4]/25 bg-[#2de6c4]/10 p-4 text-sm text-white/80">
                          <p className="font-semibold text-white">Loan accepted successfully</p>
                          <p className="mt-2">Amount disbursed: {acceptedLoanResult.amount_display}</p>
                          <p className="mt-1">Status: {acceptedLoanResult.status}</p>
                          <p className="mt-1">Due date: {acceptedLoanResult.due_date}</p>
                          <p className="mt-1 break-all">Loan ID: {acceptedLoanResult.loan_id}</p>
                          {contractDownloadName ? <p className="mt-1">Signed copy downloaded: {contractDownloadName}</p> : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-white/65">
                      No score response yet. Submit the form to get the decision, recommendation, fraud flags, AML flags, and repayment estimates.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Loan history snapshot</p>
                  <div className="mt-3 space-y-3">
                    {loanHistory.slice(0, 3).map((loan) => (
                      <div key={loan.loan_id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                        <div className="flex items-center justify-between gap-3">
                          <span>{formatTnd(loan.amount / 1000)}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${loanStatusClassName(loan.status)}`}>
                            {loan.status}
                          </span>
                        </div>
                        <p className="mt-2 text-white/55">Due {loan.due_date}</p>
                        {loan.contract_signed_at ? (
                          <p className="mt-1 text-white/55">Signed {new Date(loan.contract_signed_at).toLocaleDateString()}</p>
                        ) : null}
                      </div>
                    ))}
                    {loanHistory.length === 0 ? <p className="text-sm text-white/60">No stored loans yet.</p> : null}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
        {showContractPaper && pendingLoanContract ? (
          <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#070b14]/88 p-3 sm:p-5" onClick={() => setShowContractPaper(false)}>
            <div
              className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[28px] border border-[#bca47a] bg-[#eadcc0] p-3 text-[#221b12] shadow-[0_40px_80px_rgba(0,0,0,0.45)] sm:p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-[24px] border border-[#c9b28a] bg-[linear-gradient(180deg,#f7eedf,#efe1c7)] p-5 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ceb892] pb-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[#6f5730]">{pendingLoanContract.lender_name}</p>
                    <h2 className="mt-2 font-[Georgia] text-3xl font-semibold">Consumer Loan Agreement</h2>
                    <p className="mt-2 text-sm text-[#5e4a2e]">
                      Contract reference {pendingLoanContract.contract_reference} | Borrower address {pendingLoanContract.borrower_address}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-[#8f7347] px-3 py-1.5 text-sm text-[#49361a]"
                    onClick={() => setShowContractPaper(false)}
                  >
                    Close paper
                  </button>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <PaperStat label="Borrower" value={pendingLoanContract.borrower_name} />
                  <PaperStat label="CIN" value={pendingLoanContract.borrower_cin} />
                  <PaperStat label="Issue date" value={formatLongDate(pendingLoanContract.issue_date)} />
                  <PaperStat label="Final due date" value={formatLongDate(pendingLoanContract.due_date)} />
                  <PaperStat label="Requested amount" value={formatTnd(pendingLoanContract.requested_amount)} />
                  <PaperStat label="Approved amount" value={formatTnd(pendingLoanContract.approved_amount)} />
                  <PaperStat label="Interest rate" value={formatPercent(pendingLoanContract.annual_interest_rate)} />
                  <PaperStat label="Duration" value={`${pendingLoanContract.duration_months} months`} />
                  <PaperStat label="Monthly installment" value={pendingLoanContract.monthly_installment != null ? formatTnd(pendingLoanContract.monthly_installment) : "To be confirmed"} />
                  <PaperStat label="Total repayment" value={pendingLoanContract.total_repayment != null ? formatTnd(pendingLoanContract.total_repayment) : "To be confirmed"} />
                  <PaperStat label="Fraud risk" value={pendingLoanContract.fraud_risk_level ?? "N/A"} />
                  <PaperStat label="AML risk" value={pendingLoanContract.aml_risk_level ?? "N/A"} />
                </div>

                <section className="mt-8">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#735831]">Purpose and approval basis</p>
                  <p className="mt-3 text-[15px] leading-7 text-[#2e2418]">
                    NexaPay Bank agrees to extend a consumer loan to <strong>{pendingLoanContract.borrower_name}</strong> for the stated purpose of <strong>{pendingLoanContract.purpose}</strong>, subject to the obligations below and the underwriting outcome recorded as <strong>{pendingLoanContract.decision}</strong>.
                  </p>
                  {pendingLoanContract.main_reasons.length > 0 ? (
                    <ul className="mt-4 space-y-2 text-[15px] leading-7 text-[#2e2418]">
                      {pendingLoanContract.main_reasons.map((reason) => (
                        <li key={reason} className="rounded-2xl border border-[#d3bf98] bg-white/35 px-4 py-3">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <section className="mt-8">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#735831]">Legal terms</p>
                  <div className="mt-4 space-y-4">
                    {pendingLoanContract.clauses.map((clause, index) => (
                      <div key={clause.title} className="rounded-[22px] border border-[#d0bb92] bg-white/35 px-4 py-4 sm:px-5">
                        <p className="text-base font-semibold text-[#241b10]">
                          {index + 1}. {clause.title}
                        </p>
                        <p className="mt-2 text-[15px] leading-7 text-[#33281a]">{clause.body}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="mt-8 rounded-[24px] border border-[#bca176] bg-[rgba(255,252,245,0.72)] p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#735831]">Borrower signature block</p>
                      <p className="mt-2 text-sm text-[#5f4c31]">
                        Draw your signature with a mouse or touch screen, then confirm your legal name and account password.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-[#8f7347] px-3 py-1.5 text-sm text-[#49361a]"
                      onClick={clearSignaturePad}
                    >
                      Clear signature
                    </button>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[22px] border border-dashed border-[#9f8051] bg-[#fbf4e7]">
                    <canvas
                      ref={signatureCanvasRef}
                      className="block h-[220px] w-full touch-none"
                      onPointerDown={(event) => drawSignatureStroke("start", event)}
                      onPointerMove={(event) => drawSignatureStroke("move", event)}
                      onPointerUp={(event) => drawSignatureStroke("end", event)}
                      onPointerLeave={(event) => drawSignatureStroke("end", event)}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <PaperField
                      label="Legal Name Signature"
                      value={contractSignerName}
                      onChange={(e) => setContractSignerName(e.target.value)}
                    />
                    <PaperField
                      label="Account Password"
                      type="password"
                      value={contractPassword}
                      onChange={(e) => setContractPassword(e.target.value)}
                    />
                  </div>

                  <label className="mt-4 flex items-start gap-3 text-sm text-[#4d3c24]">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={contractConsent}
                      onChange={(e) => setContractConsent(e.target.checked)}
                    />
                    <span>
                      I have reviewed this loan agreement, I accept the repayment obligations and interest charges, I will pay each installment on time, and I authorize NexaPay Bank to store and issue this signed electronic contract.
                    </span>
                  </label>

                  {contractSignerName.trim() && contractSignerName.trim().toLowerCase() !== account.full_name.trim().toLowerCase() ? (
                    <p className="mt-3 text-sm text-[#9a4728]">
                      The legal name signature must exactly match the account holder name: {account.full_name}
                    </p>
                  ) : null}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      disabled={
                        acceptingLoanOffer ||
                        !contractConsent ||
                        !contractPassword.trim() ||
                        !contractSignatureReady ||
                        contractSignerName.trim().toLowerCase() !== account.full_name.trim().toLowerCase()
                      }
                      onClick={() => void acceptLoanOffer()}
                    >
                      {acceptingLoanOffer ? "Signing & disbursing..." : "Sign Contract & Disburse"}
                    </Button>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${contractSignatureReady ? "border-[#3a8b6c] bg-[#d8f4eb] text-[#19523f]" : "border-[#ad8c5f] bg-[#f3e7cf] text-[#755935]"}`}>
                      {contractSignatureReady ? "Signature ready" : "Draw signature to continue"}
                    </span>
                    <p className="text-sm text-[#5f4c31]">
                      The signed contract will be stored in the database and a customer copy will download automatically after approval.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : null}
        </>
      ) : null}

      {showReceiveModal && account ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/72 p-4" onClick={() => setShowReceiveModal(false)}>
          <Card
            className="w-full max-w-2xl rounded-3xl border-white/15 bg-[linear-gradient(150deg,#131d32,#0d1425)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-[var(--font-sora)] text-2xl font-semibold">Receive money</h2>
              <button
                type="button"
                className="rounded-full border border-white/20 px-2 py-1 text-sm text-white/80"
                onClick={() => setShowReceiveModal(false)}
              >
                Close
              </button>
            </div>

            <p className="mt-2 text-sm text-white/70">Set amount and share your QR payment link in one tap.</p>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={1}
                className="h-11 rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white outline-none focus:border-[var(--brand)]"
                value={receiveAmountTnd}
                onChange={(e) => setReceiveAmountTnd(Number(e.target.value))}
              />
                <span className="text-sm text-white/70">TND</span>
            </div>

            {receiveLink ? (
              <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(receiveLink)}`}
                  alt="Wallet payment QR code"
                  className="h-[220px] w-[220px] rounded-xl border border-white/10 bg-white p-2"
                />

                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-white">Payment Link</p>
                  <p className="break-all rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs text-white/80">{receiveLink}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" onClick={copyLink}>Copy link</Button>
                    <Link
                      href={`/pay/${account.chain_address}?amount=${receiveAmountMillimes}`}
                      className="neo-btn neo-btn--dark"
                    >
                      Open pay page
                    </Link>
                  </div>
                  {copiedReceiveLink ? <p className="text-[#8ef9e8]">Link copied.</p> : null}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </main>
  );
}

function riskBadgeClassName(level?: string | null): string {
  const normalized = String(level ?? "").toLowerCase();
  if (normalized.includes("high")) {
    return "border-[#ffb089]/45 bg-[#ffb089]/12 text-[#ffd1b3]";
  }
  if (normalized.includes("medium")) {
    return "border-[#ffd76b]/45 bg-[#ffd76b]/12 text-[#ffe7a7]";
  }
  return "border-[#2de6c4]/35 bg-[#2de6c4]/12 text-[#9ffbec]";
}

function loanStatusClassName(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("repaid")) {
    return "border-[#2de6c4]/35 bg-[#2de6c4]/12 text-[#9ffbec]";
  }
  if (normalized.includes("approved")) {
    return "border-[#8aa7ff]/35 bg-[#8aa7ff]/12 text-[#c8d5ff]";
  }
  if (normalized.includes("pending")) {
    return "border-[#ffd76b]/45 bg-[#ffd76b]/12 text-[#ffe7a7]";
  }
  return "border-[#ffb089]/45 bg-[#ffb089]/12 text-[#ffd1b3]";
}

function DashboardField({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-white/80 ${className ?? ""}`}>
      <span>{label}</span>
      <input
        className="h-11 rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white outline-none transition focus:border-[var(--brand)] disabled:cursor-not-allowed disabled:bg-white/[0.04] disabled:text-white/60"
        {...props}
      />
    </label>
  );
}

function PaperField({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-[#4f3d24] ${className ?? ""}`}>
      <span>{label}</span>
      <input
        className="h-11 rounded-xl border border-[#c9b28a] bg-[#fffaf2] px-3 text-[#21180d] outline-none transition focus:border-[#7f6339]"
        {...props}
      />
    </label>
  );
}

function DashboardSelect({
  label,
  options,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[] }) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-white/80 ${className ?? ""}`}>
      <span>{label}</span>
      <select
        className="h-11 rounded-xl border border-white/15 bg-[#0d1328] px-3 text-white outline-none transition focus:border-[var(--brand)]"
        {...props}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function LoanMetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? "border-[#2de6c4]/25 bg-[#2de6c4]/10" : "border-white/10 bg-white/[0.03]"}`}>
      <p className="text-xs uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function PaperStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[#d0bb92] bg-white/35 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#735831]">{label}</p>
      <p className="mt-2 text-[15px] font-semibold text-[#241b10]">{value}</p>
    </div>
  );
}
