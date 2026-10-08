import type { Metadata } from "next";
import PaymentDetail from "./PaymentDetail";

export const metadata: Metadata = { title: "Payment Details" };

export default async function AdminPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PaymentDetail paymentId={id} />;
}
