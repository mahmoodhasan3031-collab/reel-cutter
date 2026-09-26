import type { Metadata } from "next";
import PaymentsList from "./PaymentsList";

export const metadata: Metadata = { title: "Payments" };

export default function AdminPaymentsPage() {
  return <PaymentsList />;
}
