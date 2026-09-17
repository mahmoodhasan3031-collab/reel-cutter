import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Checkout Cancelled",
  description: "Your checkout was cancelled.",
  robots: { index: false, follow: false },
};

export default function CheckoutCancelPage() {
  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <svg
            className="h-8 w-8 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Checkout Cancelled
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          Your checkout was cancelled. No payment was processed.
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          You can return to the pricing page to choose a different plan
          or continue using the free version of Reel Cutter.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Return to Pricing
          </Link>
          <Link
            href="/download"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
          >
            Download Free
          </Link>
        </div>
      </div>
    </section>
  );
}
