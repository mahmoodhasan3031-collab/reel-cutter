import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Payment Confirmation",
  description: "Payment confirmation for Reel Cutter.",
  robots: { index: false, follow: false },
};

interface SuccessPageProps {
  searchParams: Promise<{ sessionId?: string }>;
}

export default async function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const sessionId = params.sessionId;

  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl text-center">
        {sessionId ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Session ID: <code className="monospace">{sessionId}</code>
          </p>
        ) : null}
        {true ? (
          <div className="mb-6 p-6 rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
            {true ? (
              // Payment successful state
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
                  Payment Successful
                </h1>
                <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
                  Your payment has been processed. Your license key is being generated
                  and will be sent to your email address shortly.
                </p>
                <div className="mt-4">
                  <Link
                    href="/pricing"
                    className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  >
                    View Pricing
                  </Link>
                  <Link
                    href="/download"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Download Reel Cutter
                  </Link>
                </div>
              </div>
            ) : (
              // Payment confirmation state
              <div className="mb-6 p-6 rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                  Payment Confirmation
                </h1>
                <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
                  Payment confirmation will appear here after secure checkout.
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Once your payment is processed, you&apos;ll receive your license key via email
                  and be able to activate Reel Cutter immediately.
                </p>
                <div className="mt-4">
                  <Link
                    href="/pricing"
                    className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  >
                    View Pricing
                  </Link>
                  <Link
                    href="/download"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Download Reel Cutter
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}