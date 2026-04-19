"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

type PublicAccountResponse = {
  chain_address: string;
  full_name: string;
  account_number_masked: string;
  iban_masked: string;
};

type CardWalletPayResponse = {
  success: boolean;
  status: string;
  recipient: string;
  amount: number;
  amount_display: string;
  tx_hash?: string;
  block?: number;
  recipient_balance?: number;
  failure_reason?: string;
};

type WalletTransferResponse = {
  success: boolean;
  tx_hash: string;
  block: number;
  new_balance: number;
};

export default function PayWalletPage() {
  const params = useParams<{ address: string }>();
  const walletAddress = params.address;

  const [receiver, setReceiver] = useState<PublicAccountResponse | null>(null);
  const [amountTnd, setAmountTnd] = useState(20);
  const [token, setToken] = useState("");
  const [payerAddress, setPayerAddress] = useState("");
  const [walletPin, setWalletPin] = useState("1234");
  const [walletMemo, setWalletMemo] = useState("Wallet payment via QR");

  const [cardHolderName, setCardHolderName] = useState("Guest User");
  const [cardNumber, setCardNumber] = useState("4242424242424242");
  const [cardExpiryMonth, setCardExpiryMonth] = useState("12");
  const [cardExpiryYear, setCardExpiryYear] = useState("2030");
  const [cardCvv, setCardCvv] = useState("123");
  const [cardPin, setCardPin] = useState("1234");

  const [loadingReceiver, setLoadingReceiver] = useState(false);
  const [submittingWallet, setSubmittingWallet] = useState(false);
  const [submittingCard, setSubmittingCard] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountMillimes = useMemo(() => Math.max(1000, Math.round(amountTnd * 1000)), [amountTnd]);
  const loginHref = useMemo(() => {
    return `/login?next=${encodeURIComponent(`/pay/${walletAddress}?amount=${amountMillimes}`)}`;
  }, [walletAddress, amountMillimes]);
  const inputClass =
    "h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-white placeholder:text-white/45 outline-none transition focus:border-[var(--brand)]";

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const queryAmount = Number(search.get("amount") ?? "");
    const queryToken = search.get("token") ?? "";
    const queryAddress = search.get("address") ?? "";

    if (Number.isFinite(queryAmount) && queryAmount > 0) {
      setAmountTnd(queryAmount / 1000);
    }

    if (queryToken || queryAddress) {
      setToken(queryToken);
      setPayerAddress(queryAddress);
    }
  }, []);

  useEffect(() => {
    setLoadingReceiver(true);
    setError(null);

    api
      .get<PublicAccountResponse>(`/accounts/${walletAddress}/public`)
      .then((res) => {
        setReceiver(res.data);
      })
      .catch((err: any) => {
        setError(err?.response?.data?.error ?? "Unable to load recipient wallet");
      })
      .finally(() => {
        setLoadingReceiver(false);
      });
  }, [walletAddress]);

  async function submitWalletPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResultMessage(null);

    if (!token || !payerAddress) {
      setError("Login details are required for wallet-to-wallet payment");
      return;
    }

    setSubmittingWallet(true);
    try {
      const { data } = await api.post<WalletTransferResponse>(
        `/accounts/${payerAddress}/transfer`,
        {
          to: walletAddress,
          amount: amountMillimes,
          memo: walletMemo || undefined,
          pin: walletPin,
        },
        { headers: { "X-Account-Token": token } }
      );

      if (data.success) {
        setResultMessage(`Payment sent successfully. TX: ${data.tx_hash}`);
      } else {
        setError("Transfer failed");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Transfer failed");
    } finally {
      setSubmittingWallet(false);
    }
  }

  async function submitCardPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResultMessage(null);

    setSubmittingCard(true);
    try {
      const { data } = await api.post<CardWalletPayResponse>(`/wallets/${walletAddress}/pay-by-card`, {
        amount: amountMillimes,
        card_number: cardNumber,
        expiry_month: cardExpiryMonth,
        expiry_year: cardExpiryYear,
        cvv: cardCvv,
        pin: cardPin,
        card_holder_name: cardHolderName,
        memo: `Card payment to ${walletAddress}`,
      });

      if (data.success) {
        setResultMessage(`Card payment succeeded. TX: ${data.tx_hash}`);
      } else {
        setError(`Card payment failed: ${data.failure_reason ?? "declined"}`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Card payment failed");
    } finally {
      setSubmittingCard(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs uppercase tracking-[0.3em] text-ink/45">NexaPay Wallet Pay</p>
      <h1 className="mt-2 font-[var(--font-sora)] text-3xl font-semibold">Pay This Wallet</h1>

      <Card className="mt-5 p-5">
        {loadingReceiver ? <p className="text-sm text-ink/70">Loading recipient...</p> : null}
        {receiver ? (
          <div className="space-y-1 text-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-ink/50">Recipient</p>
            <p className="text-xl font-semibold">{receiver.full_name}</p>
            <p>Wallet: {receiver.chain_address}</p>
            <p>Account: {receiver.account_number_masked}</p>
            <p>IBAN: {receiver.iban_masked}</p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium">Amount (TND)</label>
          <input
            type="number"
            min={1}
            className={`${inputClass} w-40`}
            value={amountTnd}
            onChange={(e) => setAmountTnd(Number(e.target.value))}
          />
          <p className="text-sm text-ink/65">{(amountMillimes / 1000).toFixed(3)} TND</p>
        </div>
      </Card>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Pay From Wallet (Logged In User)</h2>
          <p className="mt-1 text-sm text-ink/70">
            If you already logged in, use your session token and send directly from your wallet.
          </p>
          <p className="mt-2 text-sm">
            Need login first? <Link href={loginHref} className="font-semibold text-tide underline">Login and return here</Link>
          </p>

          <form className="mt-3 grid gap-3" onSubmit={submitWalletPayment}>
            <input
              className={inputClass}
              placeholder="X-Account-Token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
            <input
              className={inputClass}
              placeholder="Your wallet address (NXP...)"
              value={payerAddress}
              onChange={(e) => setPayerAddress(e.target.value)}
              required
            />
            <input
              className={inputClass}
              placeholder="PIN"
              value={walletPin}
              onChange={(e) => setWalletPin(e.target.value)}
              required
            />
            <input
              className={inputClass}
              placeholder="Memo"
              value={walletMemo}
              onChange={(e) => setWalletMemo(e.target.value)}
            />

            <Button disabled={submittingWallet}>{submittingWallet ? "Paying..." : "Pay From Wallet"}</Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold">Pay By Card (Guest)</h2>
          <p className="mt-1 text-sm text-ink/70">No login required. You can pay this wallet directly by card.</p>

          <div className="mt-3 rounded-xl border border-ink/10 bg-ink/5 p-3 text-xs">
            <p className="font-semibold">Testing cards</p>
            <p className="mt-1">Success: 4242424242424242 (PIN 1234)</p>
            <p>Success: 5555555555554444 (PIN 1234)</p>
            <p>Fail: 4000000000000002 (PIN 1234)</p>
          </div>

          <form className="mt-3 grid gap-3" onSubmit={submitCardPayment}>
            <input
              className={inputClass}
              placeholder="Card holder"
              value={cardHolderName}
              onChange={(e) => setCardHolderName(e.target.value)}
              required
            />
            <input
              className={inputClass}
              placeholder="Card number"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              required
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                className={inputClass}
                placeholder="MM"
                value={cardExpiryMonth}
                onChange={(e) => setCardExpiryMonth(e.target.value)}
                required
              />
              <input
                className={inputClass}
                placeholder="YYYY"
                value={cardExpiryYear}
                onChange={(e) => setCardExpiryYear(e.target.value)}
                required
              />
              <input
                className={inputClass}
                placeholder="CVV"
                value={cardCvv}
                onChange={(e) => setCardCvv(e.target.value)}
                required
              />
            </div>
            <input
              className={inputClass}
              placeholder="PIN"
              value={cardPin}
              onChange={(e) => setCardPin(e.target.value)}
              required
            />

            <Button disabled={submittingCard}>{submittingCard ? "Charging..." : "Pay By Card"}</Button>
          </form>
        </Card>
      </div>

      {resultMessage ? <p className="mt-4 text-sm text-tide">{resultMessage}</p> : null}
      {error ? <p className="mt-4 text-sm text-ember">{error}</p> : null}

      <div className="mt-8">
        <Link href="/" className="text-sm font-semibold text-tide underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
