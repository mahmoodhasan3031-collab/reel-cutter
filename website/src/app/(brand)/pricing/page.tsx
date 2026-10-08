import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { PLANS, FEATURE_CATEGORIES } from "@/config/pricing";
import { Container, Eyebrow, Section, SectionHeader, Surface } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "DialDazzle pricing for Reel Cutter — simple monthly subscription plans with transparent prices, a full feature comparison, and card or manual payment options.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing | DialDazzle",
    description:
      "Transparent monthly pricing for Reel Cutter, the current DialDazzle product.",
    url: "/pricing",
    type: "website",
    siteName: "DialDazzle",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "DialDazzle - Software for modern work.",
      },
    ],
  },
};

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <Section spacing="large" id="pricing-hero" ariaLabelledBy="pricing-title">
        <Container className="flex flex-col items-center gap-5 text-center">
          <Eyebrow>DialDazzle pricing</Eyebrow>
          <h1 id="pricing-title" className="dd-display text-foreground">
            Simple, Transparent Pricing
          </h1>
          <p className="dd-body max-w-[68ch] text-muted-foreground">
            Monthly subscription. Cancel anytime. No hidden fees.
            Choose the plan that fits your workflow.
          </p>
          <p className="dd-small max-w-[68ch] text-muted-foreground">
            The plans below cover Reel Cutter, the current DialDazzle product.
          </p>
        </Container>
      </Section>

      {/* Pricing Cards */}
      <Section spacing="normal" id="pricing-plans" ariaLabelledBy="pricing-plans-title">
        <Container className="flex flex-col gap-8">
          <SectionHeader
            eyebrow="Reel Cutter"
            title="Reel Cutter plans"
            description="Three subscription tiers. Prices, features and checkout behaviour are driven by the DialDazzle pricing configuration."
            align="center"
            id="pricing-plans-title"
          />
          <Surface tone="inset" radius="xl" className="p-6 sm:p-10">
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
                            aria-hidden="true"
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
                            aria-hidden="true"
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
                      className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-dd-base ${
                        plan.highlight
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                      }`}
                    >
                      {plan.cta}
                    </Link>
                    <Link
                      href={`/payment/manual?plan=${plan.id}`}
                      className="mt-3 inline-flex w-full items-center justify-center text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Pay manually (bKash, Nagad, Bank&hellip;)
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Surface>

          <Surface tone="base" radius="lg" className="border border-border-subtle px-6 py-8">
            <SectionHeader
              eyebrow="Other products"
              title="Only Reel Cutter has published plans"
              description="Reel Cutter is the current DialDazzle product, so it is the only product with pricing today. Other DialDazzle products will list their plans here when they become available."
              level={3}
              id="pricing-future-title"
            />
          </Surface>
        </Container>
      </Section>

      {/* Feature Comparison Table */}
      <Section spacing="large" id="pricing-comparison" ariaLabelledBy="pricing-comparison-title">
        <Container className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Compare"
            title="Feature Comparison"
            description="Compare what's included in each plan."
            id="pricing-comparison-title"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Feature comparison across the Basic, Standard and Pro plans
              </caption>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th scope="col" className="pb-4 pr-4 font-semibold text-slate-900 dark:text-white">
                    Feature
                  </th>
                  <th scope="col" className="pb-4 px-4 text-center font-semibold text-slate-900 dark:text-white">
                    Basic
                  </th>
                  <th scope="col" className="pb-4 px-4 text-center font-semibold text-slate-900 dark:text-white">
                    Standard
                  </th>
                  <th scope="col" className="pb-4 pl-4 text-center font-semibold text-slate-900 dark:text-white">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_CATEGORIES.map((category) => (
                  <Fragment key={category.category}>
                    <tr>
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
                        <th
                          scope="row"
                          className="py-3 pr-4 text-left font-normal text-slate-700 dark:text-slate-300"
                        >
                          {feature.name}
                        </th>
                        <td className="py-3 px-4 text-center">
                          {feature.basic ? (
                            <svg
                              className="mx-auto h-4 w-4 text-indigo-600 dark:text-indigo-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              aria-hidden="true"
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
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                          <span className="sr-only">
                            {feature.basic ? "Included" : "Not included"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {feature.standard ? (
                            <svg
                              className="mx-auto h-4 w-4 text-indigo-600 dark:text-indigo-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              aria-hidden="true"
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
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                          <span className="sr-only">
                            {feature.standard ? "Included" : "Not included"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {feature.pro ? (
                            <svg
                              className="mx-auto h-4 w-4 text-indigo-600 dark:text-indigo-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              aria-hidden="true"
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
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                          <span className="sr-only">
                            {feature.pro ? "Included" : "Not included"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section spacing="large" id="pricing-faq" ariaLabelledBy="pricing-faq-title">
        <Container className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Questions"
            title="Pricing Questions"
            id="pricing-faq-title"
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <Surface tone="raised" radius="lg" className="p-6">
              <h3 className="dd-h3 text-foreground">Are there any recurring fees?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Yes. All pricing is monthly subscription. You&apos;re billed each month
                and can cancel anytime. Software updates are included.
              </p>
            </Surface>
            <Surface tone="raised" radius="lg" className="p-6">
              <h3 className="dd-h3 text-foreground">Can I upgrade my tier later?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Yes. You can upgrade or downgrade your subscription at any time from
                your account page. Changes take effect on your next billing cycle.
              </p>
            </Surface>
            <Surface tone="raised" radius="lg" className="p-6">
              <h3 className="dd-h3 text-foreground">Is there a free trial?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Reel Cutter can be downloaded and installed for free. Basic features are available
                for evaluation. A license key is required to unlock full functionality.
              </p>
            </Surface>
            <Surface tone="raised" radius="lg" className="p-6">
              <h3 className="dd-h3 text-foreground">What payment methods are accepted?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                We accept all major credit cards through Stripe, our secure payment
                processor. Your payment information is encrypted and never stored on our servers.
                You can also pay manually with bKash, Nagad, Rocket, bank transfer, or
                Binance Pay — see{" "}
                <Link
                  href="/payment/manual"
                  className="font-medium text-accent-text underline-offset-4 hover:underline dd-focus"
                >
                  Manual Payment
                </Link>
                .
              </p>
            </Surface>
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section spacing="large" id="pricing-cta" ariaLabelledBy="pricing-cta-title">
        <Container>
          <Surface tone="accent" radius="xl" className="px-6 py-12 sm:px-10 sm:py-16">
            <div className="flex flex-col items-center gap-6 text-center">
              <SectionHeader
                eyebrow="Get started"
                title="Ready to Get Started?"
                description="Download Reel Cutter and try it for free today."
                align="center"
                id="pricing-cta-title"
              />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/download"
                  className="inline-flex items-center justify-center rounded-lg bg-accent-hover px-6 py-3 text-sm font-semibold text-white transition-colors duration-dd-base hover:bg-accent-press dd-focus"
                >
                  Download for Free
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors duration-dd-base hover:bg-surface-elevated dd-focus"
                >
                  View Features
                </Link>
              </div>
            </div>
          </Surface>
        </Container>
      </Section>
    </>
  );
}
