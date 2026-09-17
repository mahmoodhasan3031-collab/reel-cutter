import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "View pricing plans for Reel Cutter — professional desktop video editing software for short-form content creation.",
  openGraph: {
    title: "Pricing | Reel Cutter",
    description: "View pricing plans for Reel Cutter video editing software.",
  },
};

const tiers = [
  {
    name: "Basic",
    price: "$10",
    period: "one-time",
    description: "Essential video cutting and export for getting started.",
    features: [
      "Video cutting and segment extraction",
      "1080p Full HD export",
      "9:16 vertical reel format",
      "Basic output modes (blur, crop, pad)",
    ],
    cta: "Coming Soon",
    highlighted: false,
  },
  {
    name: "Standard",
    price: "$20",
    period: "one-time",
    description: "Full aspect ratio support and higher quality export.",
    features: [
      "Everything in Basic",
      "4K Ultra HD export (3840x2160)",
      "All aspect ratios (9:16, 1:1, 4:5, 16:9)",
      "Custom duration timestamps",
      "Multiple output modes",
    ],
    cta: "Coming Soon",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$30",
    period: "one-time",
    description: "Complete toolkit with AI features, bulk export, and automation.",
    features: [
      "Everything in Standard",
      "AI Thumbnails and Smart Crop",
      "AI Caption Generator",
      "Caption quality and experiments",
      "Workflow Recipes",
      "Bulk Export and Batch Queue",
      "Export History and Recovery",
      "Intelligence Dashboard",
      "Command Center",
      "Content Variation Presets",
      "Export Presets",
    ],
    cta: "Coming Soon",
    highlighted: true,
  },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Pricing
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Simple, one-time pricing. No subscriptions. No hidden fees.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-8 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative flex flex-col rounded-2xl border p-8 ${
                  tier.highlighted
                    ? "border-indigo-600 bg-white shadow-lg dark:border-indigo-500 dark:bg-slate-800"
                    : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800"
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                      Most Popular
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {tier.name}
                  </h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-900 dark:text-white">
                      {tier.price}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {tier.period}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    {tier.description}
                  </p>
                </div>
                <ul className="mt-8 flex-1 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <span className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
                    {tier.cta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coming Soon Notice */}
      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl text-center">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 dark:border-amber-800 dark:bg-amber-950">
            <h2 className="text-xl font-bold text-amber-800 dark:text-amber-200">
              Pricing Coming Soon
            </h2>
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              Online purchase and license activation are currently in development.
              The pricing shown reflects the planned tier structure.
              Contact us for early access or questions about licensing.
            </p>
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
                Updates are included.
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
