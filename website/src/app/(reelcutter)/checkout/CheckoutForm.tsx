"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_CONFIG } from "@/config/payment";
import type { PricingPlan } from "@/config/pricing";
import type { User } from "@supabase/supabase-js";

interface CheckoutFormProps {
  plan: PricingPlan;
}

export default function CheckoutForm({ plan }: CheckoutFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      const user = data.user;
      if (user) {
        setUserId(user.id);
        if (user.email) {
          setEmail(user.email);
        }
      }
      setAuthChecked(true);
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loading) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(PAYMENT_CONFIG.checkoutEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: plan.id,
            email: email.trim() || undefined,
            userId: userId || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          const message =
            data?.error?.message || "Could not start checkout. Please try again.";
          setError(message);
          setLoading(false);
          return;
        }

        if (data.url) {
          window.location.href = data.url;
        } else {
          setError("No checkout URL received. Please try again.");
          setLoading(false);
        }
      } catch {
        setError("Could not connect to payment server. Please try again later.");
        setLoading(false);
      }
    },
    [plan.id, email, userId, loading]
  );

  return (
    <form onSubmit={handleSubmit}>
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Your subscription confirmation will be sent to this email.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Submit */}
      <div className="mt-8">
        <button
          type="submit"
          disabled={loading || !authChecked}
          className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          {loading ? (
            <>
              <svg
                className="mr-2 h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Redirecting to Stripe...
            </>
          ) : (
            `Subscribe to ${plan.name} — ${plan.priceDisplay}/mo`
          )}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          You&apos;ll be redirected to Stripe for secure payment processing.
        </p>
      </div>
    </form>
  );
}
