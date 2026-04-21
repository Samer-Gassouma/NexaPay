import { Suspense } from "react";

import { PaymentSuccessClient } from "./payment-success-client";

type PaymentSuccessPageProps = {
  searchParams?: {
    intent_id?: string;
    status?: string;
  };
};

export default function PaymentSuccessPage({
  searchParams,
}: PaymentSuccessPageProps) {
  const intentId = searchParams?.intent_id ?? "unknown";
  const statusParam = searchParams?.status ?? "pending";

  return (
    <Suspense fallback={null}>
      <PaymentSuccessClient intentId={intentId} statusParam={statusParam} />
    </Suspense>
  );
}
