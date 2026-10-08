import type { Metadata } from "next";
import Link from "next/link";
import PaymentStatusClient from "./PaymentStatusClient";

export const metadata: Metadata = {
  title: "Payment Status",
  description: "Check the review status of your Reel Cutter manual payment.",
  robots: { index: false, follow: false },
};

interface PaymentStatusPageProps {
  params: Promise<{ id: string }>;
}

export default async function PaymentStatusPage({
  params,
}: PaymentStatusPageProps) {
  const { id } = await params;
  const paymentId = decodeURIComponent(id);

  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back to Pricing
        </Link>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Payment Status
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Live status for your manual payment submission.
          </p>

          <div className="mt-8">
            <PaymentStatusClient paymentId={paymentId} />
          </div>
        </div>
      </div>
    </section>
  );
}
