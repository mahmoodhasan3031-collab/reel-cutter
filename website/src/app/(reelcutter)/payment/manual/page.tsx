import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanById, isValidPlanId, PLANS } from "@/config/pricing";
import ManualPaymentForm from "./ManualPaymentForm";

export const metadata: Metadata = {
  title: "Manual Payment",
  description:
    "Pay for Reel Cutter with bKash, Nagad, Rocket, bank transfer, or Binance Pay.",
  robots: { index: false, follow: false },
};

interface ManualPaymentPageProps {
  searchParams: Promise<{ plan?: string }>;
}

export default async function ManualPaymentPage({
  searchParams,
}: ManualPaymentPageProps) {
  const params = await searchParams;
  const planParam = params.plan;

  if (planParam !== undefined && !isValidPlanId(planParam)) {
    notFound();
  }

  const planId =
    planParam && isValidPlanId(planParam) ? planParam : PLANS[0].id;
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
            Manual Payment
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Send payment using your preferred method, then submit your
            transaction details for review.
          </p>

          {/* Manual verification notice */}
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Payment is manually verified by our team. Your license is issued
              only after verification.
            </p>
          </div>

          {/* Flow steps */}
          <ol className="mt-6 space-y-2 border-t border-slate-200 pt-6 dark:border-slate-700">
            {[
              "Choose your plan and payment method.",
              "Send the payment to the account shown.",
              "Upload the confirmation screenshot.",
              "Enter your details and transaction ID.",
              "Submit for review and keep your payment ID.",
              "Track the result on the status page.",
              "After approval, your license key is emailed to you.",
            ].map((step, index) => (
              <li
                key={step}
                className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          {/* Form */}
          <div className="mt-8">
            <ManualPaymentForm defaultPlanId={plan.id} />
          </div>
        </div>
      </div>
    </section>
  );
}
