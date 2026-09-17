import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanById, isValidPlanId } from "@/config/pricing";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your Reel Cutter purchase.",
  robots: { index: false, follow: false },
};

interface CheckoutPageProps {
  searchParams: Promise<{ plan?: string }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const planId = params.plan;

  if (!planId || !isValidPlanId(planId)) {
    notFound();
  }

  const plan = getPlanById(planId);
  if (!plan) {
    notFound();
  }

  return (
    <>
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Pricing
          </Link>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-800 dark:bg-slate-900">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Checkout
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Review your selection and complete your purchase.
            </p>

            {/* Selected Plan */}
            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {plan.name} Plan
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {plan.description}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {plan.priceDisplay}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {plan.billingPeriod}
                  </div>
                </div>
              </div>

              {/* Feature List */}
              <ul className="mt-6 space-y-2 border-t border-slate-200 pt-6 dark:border-slate-700">
                {plan.features
                  .filter((f) => f.included)
                  .map((feature) => (
                    <li key={feature.name} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {feature.name}
                    </li>
                  ))}
              </ul>
            </div>

            {/* Email Field */}
            <div className="mt-6">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-900 dark:text-white"
              >
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="you@example.com"
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Your license key will be sent to this email after payment.
              </p>
            </div>

            {/* Checkout Notice */}
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <div>
                  <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Secure Checkout Coming Soon
                  </h3>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    Online payment is currently in development. Your license will be delivered
                    automatically after secure payment processing is complete.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-8">
              <button
                type="button"
                disabled
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-300 px-4 py-3 text-sm font-semibold text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
              >
                Checkout Not Yet Available
              </button>
              <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
                Secure payment processing will be available soon.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
