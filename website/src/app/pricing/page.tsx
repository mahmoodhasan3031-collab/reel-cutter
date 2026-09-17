import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, FEATURE_CATEGORIES } from "@/config/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "View pricing plans for Reel Cutter — professional desktop video editing software. Simple one-time pricing with no subscriptions.",
  openGraph: {
    title: "Pricing | Reel Cutter",
    description: "View pricing plans for Reel Cutter video editing software.",
  },
};

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Simple, Transparent Pricing
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            One-time payment. No subscriptions. No hidden fees.
            Choose the plan that fits your workflow.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-8 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-8 ${
                  plan.highlight
                    ? "border-indigo-600 bg-white shadow-lg dark:border-indigo-500 dark:bg-slate-800"
                    : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                      Most Popular
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {plan.name}
                  </h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-900 dark:text-white">
                      {plan.priceDisplay}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {plan.billingPeriod}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    {plan.description}
                  </p>
                </div>
                <ul className="mt-8 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature.name}
                      className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400"
                    >
                      {feature.included ? (
                        <svg
                          className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      )}
                      {feature.name}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Link
                    href={`/checkout?plan=${plan.id}`}
                    className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                      plan.highlight
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Feature Comparison
          </h2>
          <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
            Compare what&apos;s included in each plan.
          </p>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="pb-4 pr-4 font-semibold text-slate-900 dark:text-white">
                    Feature
                  </th>
                  <th className="pb-4 px-4 text-center font-semibold text-slate-900 dark:text-white">
                    Basic
                  </th>
                  <th className="pb-4 px-4 text-center font-semibold text-slate-900 dark:text-white">
                    Standard
                  </th>
                  <th className="pb-4 pl-4 text-center font-semibold text-slate-900 dark:text-white">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_CATEGORIES.map((category) => (
                  <>
                    <tr key={`cat-${category.category}`}>
                      <td
                        colSpan={4}
                        className="pb-2 pt-6 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                      >
                        {category.category}
                      </td>
                    </tr>
                    {category.features.map((feature) => (
                      <tr
                        key={feature.name}
                        className="border-b border-slate-100 dark:border-slate-900"
                      >
                        <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
                          {feature.name}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {feature.basic ? (
                            <svg
                              className="mx-auto h-4 w-4 text-indigo-600 dark:text-indigo-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {feature.standard ? (
                            <svg
                              className="mx-auto h-4 w-4 text-indigo-600 dark:text-indigo-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                        </td>
                        <td className="py-3 pl-4 text-center">
                          {feature.pro ? (
                            <svg
                              className="mx-auto h-4 w-4 text-indigo-600 dark:text-indigo-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Pricing Questions
          </h2>
          <div className="mt-8 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Are there any recurring fees?
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No. All pricing is one-time. You purchase a license once and own it forever.
                Software updates are included.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Can I upgrade my tier later?
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Upgrade options will be available when the online store launches.
                You&apos;ll only pay the difference between tiers.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Is there a free trial?
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Reel Cutter can be downloaded and installed for free. Basic features are available
                for evaluation. A license key is required to unlock full functionality.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                What payment methods are accepted?
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Online payment is coming soon. Currently, licenses are available through
                direct purchase. Contact us for more information.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to Get Started?
          </h2>
          <p className="mt-4 text-lg text-indigo-100">
            Download Reel Cutter and try it for free today.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/download"
              className="inline-flex items-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50"
            >
              Download for Free
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center rounded-lg border border-indigo-400 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              View Features
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
