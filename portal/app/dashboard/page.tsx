"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

type AccountResponse = {
  chain_address: string;
  full_name: string;
  balance: number;
  balance_display: string;
  account_number: string;
  rib: string;
  iban: string;
  card_last4: string;
  card_expiry: string;
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

type LoanRequestResponse = {
  loan_id: string;
  status: string;
  amount_display: string;
  due_date: string;
  message: string;
};

type LoansResponse = {
  loans: Array<{
    loan_id: string;
    amount: number;
    status: string;
    interest_rate: string;
    due_date: string;
    created_at: string;
  }>;
};

export default function DashboardPage() {
  const [token, setToken] = useState("");
  const [address, setAddress] = useState("");
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [txs, setTxs] = useState<TxResponse["transactions"]>([]);
  const [recipients, setRecipients] = useState<RecipientSearchResponse["results"]>([]);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientSearchResponse["results"][number] | null>(null);
  const [transferAmountTnd, setTransferAmountTnd] = useState(10);
  const [transferPin, setTransferPin] = useState("1234");
  const [transferMemo, setTransferMemo] = useState("");
  const [receiveAmountTnd, setReceiveAmountTnd] = useState(25);
  const [loanAmountTnd, setLoanAmountTnd] = useState(500);
  const [loans, setLoans] = useState<LoansResponse["loans"]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [portalOrigin, setPortalOrigin] = useState("");
  const [copiedReceiveLink, setCopiedReceiveLink] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [submittingLoan, setSubmittingLoan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transferAmountMillimes = useMemo(() => Math.max(0, Math.round(transferAmountTnd * 1000)), [transferAmountTnd]);
  const receiveAmountMillimes = useMemo(() => Math.max(1000, Math.round(receiveAmountTnd * 1000)), [receiveAmountTnd]);
  const loanAmountMillimes = useMemo(() => Math.max(0, Math.round(loanAmountTnd * 1000)), [loanAmountTnd]);
  const receiveLink = useMemo(() => {
    if (!account || !portalOrigin) {
      return "";
    }

    const params = new URLSearchParams({ amount: String(receiveAmountMillimes) });
    return `${portalOrigin}/pay/${account.chain_address}?${params.toString()}`;
  }, [account, portalOrigin, receiveAmountMillimes]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pToken = params.get("token") ?? "";
    const pAddress = params.get("address") ?? "";

    if (pToken || pAddress) {
      setToken((prev) => prev || pToken);
      setAddress((prev) => prev || pAddress);

      if (pToken && pAddress) {
        loadDashboardData(pToken, pAddress);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPortalOrigin(window.location.origin);
  }, []);

  async function loadDashboard(e: FormEvent) {
    e.preventDefault();
    await loadDashboardData(token, address);
  }

  async function loadDashboardData(currentToken: string, currentAddress: string) {
    setError(null);
    setActionMessage(null);
    setLoadingDashboard(true);

    try {
      const headers = { "X-Account-Token": currentToken };
      const [accountRes, txRes, loansRes] = await Promise.all([
        api.get<AccountResponse>(`/accounts/${currentAddress}`, { headers }),
        api.get<TxResponse>(`/accounts/${currentAddress}/transactions`, { headers }),
        api.get<LoansResponse>(`/loans/${currentAddress}`, { headers }),
      ]);

      setAccount(accountRes.data);
      setTxs(txRes.data.transactions);
      setLoans(loansRes.data.loans);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Unable to load dashboard");
    } finally {
      setLoadingDashboard(false);
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
        setActionMessage("No accounts found for this search");
      }
    } catch (err: any) {
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
      await api.post(`/accounts/${address}/transfer`,
        {
          to: selectedRecipient.chain_address,
          amount: transferAmountMillimes,
          memo: transferMemo || undefined,
          pin: transferPin,
        },
        { headers: { "X-Account-Token": token } }
      );

      setActionMessage(`Transfer sent to ${selectedRecipient.full_name}`);
      setTransferMemo("");
      await loadDashboardData(token, address);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Transfer failed");
    } finally {
      setSubmittingTransfer(false);
    }
  }

  async function requestLoan() {
    setError(null);
    setActionMessage(null);
    if (loanAmountMillimes <= 0) {
      setError("Loan amount must be positive");
      return;
    }

    setSubmittingLoan(true);
    try {
      const { data } = await api.post<LoanRequestResponse>(
        "/loans/request",
        {
          borrower: address,
          amount: loanAmountMillimes,
          purpose: "Personal request from dashboard",
        },
        { headers: { "X-Account-Token": token } }
      );

      setActionMessage(`Loan ${data.status}: ${data.amount_display}`);
      await loadDashboardData(token, address);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Loan request failed");
    } finally {
      setSubmittingLoan(false);
    }
  }

  async function copyLink() {
    if (!receiveLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(receiveLink);
      setCopiedReceiveLink(true);
      window.setTimeout(() => setCopiedReceiveLink(false), 1800);
    } catch {
      setError("Copy failed. Please copy the payment link manually.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[var(--font-sora)] text-3xl font-semibold">Wallet Dashboard</h1>
        <Link href="/login" className="text-sm font-semibold text-tide underline">
          Login with another account
        </Link>
      </div>

      <form onSubmit={loadDashboard} className="mt-5 grid gap-3 rounded-2xl border border-ink/10 bg-white/75 p-4 md:grid-cols-3">
        <input
          className="h-10 rounded-xl border border-ink/15 px-3"
          placeholder="X-Account-Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <input
          className="h-10 rounded-xl border border-ink/15 px-3"
          placeholder="Chain address (NXP...)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
        <Button>Load Dashboard</Button>
      </form>

      {loadingDashboard ? <p className="mt-3 text-sm text-ink/70">Loading dashboard...</p> : null}
      {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      {actionMessage ? <p className="mt-3 text-sm text-tide">{actionMessage}</p> : null}

      {account ? (
        <>
          <Card className="mt-6 card-sheen overflow-hidden bg-gradient-to-br from-ink to-tide p-6 text-paper">
            <p className="text-xs uppercase tracking-[0.3em] text-paper/70">NexaPay Secure Card</p>
            <p className="mt-6 text-2xl tracking-[0.22em]">**** **** **** {account.card_last4}</p>
            <div className="mt-7 flex items-center justify-between">
              <p>{account.full_name}</p>
              <p>{account.card_expiry}</p>
            </div>
          </Card>

          <Card className="mt-4 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-ink/50">Available Balance</p>
            <p className="mt-2 font-[var(--font-sora)] text-5xl font-semibold">{account.balance_display}</p>
            <div className="mt-4 text-sm text-ink/70">
              <p>Account: {account.account_number}</p>
              <p>Address: {account.chain_address}</p>
            </div>
          </Card>

          <Card className="mt-4 p-6">
            <h2 className="text-lg font-semibold">Receive Money With QR</h2>
            <p className="mt-1 text-sm text-ink/70">
              Set an amount, show this QR to the sender, and they can pay from their wallet or by card.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                className="h-10 rounded-xl border border-ink/15 px-3"
                value={receiveAmountTnd}
                onChange={(e) => setReceiveAmountTnd(Number(e.target.value))}
              />
              <span className="text-sm text-ink/70">TND</span>
              {receiveLink ? (
                <Link href={`/pay/${account.chain_address}?amount=${receiveAmountMillimes}`} className="text-sm font-semibold text-tide underline">
                  Open Payment Page
                </Link>
              ) : null}
            </div>

            {receiveLink ? (
              <div className="mt-4 grid gap-4 md:grid-cols-[240px_1fr]">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(receiveLink)}`}
                  alt="Wallet payment QR code"
                  className="h-[240px] w-[240px] rounded-xl border border-ink/10 bg-white p-2"
                />

                <div className="space-y-2 text-sm">
                  <p className="font-semibold">Payment Link</p>
                  <p className="break-all rounded-xl border border-ink/10 bg-ink/5 p-3 font-mono text-xs">{receiveLink}</p>
                  <Button type="button" variant="ghost" onClick={copyLink}>Copy Link</Button>
                  {copiedReceiveLink ? <p className="text-tide">Link copied.</p> : null}
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="mt-4 p-6">
            <h2 className="text-lg font-semibold">Send Money in Network</h2>
            <p className="mt-1 text-sm text-ink/70">Search recipient by full name, CIN, or phone and transfer instantly.</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="h-10 min-w-[220px] flex-1 rounded-xl border border-ink/15 px-3"
                placeholder="Search by name / CIN / phone"
                value={recipientQuery}
                onChange={(e) => setRecipientQuery(e.target.value)}
              />
              <Button type="button" onClick={searchRecipients} disabled={loadingRecipients}>
                {loadingRecipients ? "Searching..." : "Search"}
              </Button>
            </div>

            {recipients.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {recipients.map((recipient) => (
                  <li
                    key={recipient.chain_address}
                    className={`cursor-pointer rounded-xl border p-3 text-sm ${
                      selectedRecipient?.chain_address === recipient.chain_address
                        ? "border-tide bg-tide/5"
                        : "border-ink/10"
                    }`}
                    onClick={() => setSelectedRecipient(recipient)}
                  >
                    <p className="font-semibold">{recipient.full_name}</p>
                    <p className="text-ink/70">CIN: {recipient.cin} • Phone: {recipient.phone}</p>
                    <p className="font-mono text-xs text-ink/60">{recipient.chain_address}</p>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                type="number"
                min={1}
                className="h-10 rounded-xl border border-ink/15 px-3"
                placeholder="Amount (TND)"
                value={transferAmountTnd}
                onChange={(e) => setTransferAmountTnd(Number(e.target.value))}
              />
              <input
                className="h-10 rounded-xl border border-ink/15 px-3"
                placeholder="PIN (4 digits)"
                value={transferPin}
                onChange={(e) => setTransferPin(e.target.value)}
              />
              <input
                className="h-10 rounded-xl border border-ink/15 px-3"
                placeholder="Memo (optional)"
                value={transferMemo}
                onChange={(e) => setTransferMemo(e.target.value)}
              />
            </div>

            <Button className="mt-3" type="button" onClick={sendTransfer} disabled={submittingTransfer}>
              {submittingTransfer ? "Sending..." : "Send Transfer"}
            </Button>
          </Card>

          <Card className="mt-4 p-6">
            <h2 className="text-lg font-semibold">Loan Request</h2>
            <p className="mt-1 text-sm text-ink/70">For this phase, requests are auto-approved and disbursed instantly.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={100}
                className="h-10 rounded-xl border border-ink/15 px-3"
                value={loanAmountTnd}
                onChange={(e) => setLoanAmountTnd(Number(e.target.value))}
              />
              <span className="text-sm">TND</span>
              <Button type="button" onClick={requestLoan} disabled={submittingLoan}>
                {submittingLoan ? "Requesting..." : "Request Loan"}
              </Button>
            </div>

            {loans.length > 0 ? (
              <ul className="mt-4 space-y-2 text-sm">
                {loans.map((loan) => (
                  <li key={loan.loan_id} className="rounded-xl border border-ink/10 p-3">
                    <p className="font-semibold">Loan #{loan.loan_id.slice(0, 8)}</p>
                    <p>Status: {loan.status} • Amount: {(loan.amount / 1000).toFixed(3)} TND</p>
                    <p>Due: {loan.due_date} • Rate: {loan.interest_rate}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink/65">No loans yet.</p>
            )}
          </Card>

          <Card className="mt-4 p-6">
            <h2 className="text-lg font-semibold">Transaction History</h2>
            <ul className="mt-3 space-y-2">
              {txs.map((tx) => (
                <li key={tx.id} className="rounded-xl border border-ink/10 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">
                      {tx.type} • {tx.direction}
                    </p>
                    <p>{tx.amount_display}</p>
                  </div>
                  <p className="mt-1 text-ink/60">{tx.memo || "No memo"}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </main>
  );
}
