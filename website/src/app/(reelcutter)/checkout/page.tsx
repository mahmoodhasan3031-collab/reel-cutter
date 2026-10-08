import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanById, isValidPlanId } from "@/config/pricing";
import CheckoutForm from "./CheckoutForm";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Subscribe to Reel Cutter — secure monthly payment.",
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
            Subscribe to {plan.name}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Review your selection and complete your subscription.
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

          {/* Checkout Form */}
          <CheckoutForm plan={plan} />
        </div>
      </div>
    </section>
  );
}
