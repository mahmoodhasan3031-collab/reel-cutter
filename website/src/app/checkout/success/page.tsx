import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Subscription Confirmed",
  description: "Your Reel Cutter subscription has been confirmed.",
  robots: { index: false, follow: false },
};

interface SuccessPageProps {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const sessionId = params.session_id;

  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-6 p-6 rounded-lg border border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950">
          <svg
            className="mx-auto h-12 w-12 text-green-400 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Subscription Confirmed
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            Your payment has been processed successfully. Your subscription is now active
            and your license key will be sent to your email address shortly.
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            License provisioning is handled automatically by our system.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link
              href="/account"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              View Account
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
            >
              Download Reel Cutter
            </Link>
          </div>
        </div>

        {sessionId && (
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            Reference: <code className="font-mono">{sessionId}</code>
          </p>
        )}
      </div>
    </section>
  );
}
