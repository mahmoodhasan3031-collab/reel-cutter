"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getPlanById } from "@/config/pricing";
import {
  MANUAL_PAYMENT_ENDPOINTS,
  getManualPaymentMethod,
} from "@/config/manualPayment";

interface PaymentStatusClientProps {
  paymentId: string;
}

interface PaymentStatusData {
  id: string;
  plan_id?: string;
  payment_method?: string;
  amount?: number;
  currency?: string;
  status: string;
  rejection_reason?: string | null;
  transaction_id?: string;
  created_at?: string;
  updated_at?: string;
}

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          Pending Review
        </span>
      );
    case "approved":
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
          Approved
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
          Rejected
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-300">
          {status}
        </span>
      );
  }
}

function formatDate(value?: string): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export default function PaymentStatusClient({
  paymentId,
}: PaymentStatusClientProps) {
  const [payment, setPayment] = useState<PaymentStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(MANUAL_PAYMENT_ENDPOINTS.status(paymentId), {
        headers,
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.payment) {
        if (res.status === 404) {
          setError("Payment not found. Check your payment ID and try again.");
        } else if (res.status === 429) {
          setError("Too many requests. Please wait a moment and try again.");
        } else {
          setError(
            data?.error?.message ||
              "Could not load payment status. Please try again."
          );
        }
        setPayment(null);
        return;
      }

      setError(null);
      setPayment(data.payment);
    } catch {
      setError(
        "Could not connect to the payment server. Please try again later."
      );
      setPayment(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [paymentId]);

  useEffect(() => {
    // Initial load: all setState calls inside fetchStatus run only after await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStatus();
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
          Checking payment status…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            fetchStatus();
          }}
          disabled={refreshing}
          className="mt-4 inline-flex items-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950"
        >
          {refreshing ? "Retrying…" : "Try Again"}
        </button>
      </div>
    );
  }

  if (!payment) {
    return null;
  }

  const plan = payment.plan_id ? getPlanById(payment.plan_id) : null;
  const method = payment.payment_method
    ? getManualPaymentMethod(payment.payment_method)
    : null;
  const isRejected = payment.status === "rejected";
  const isApproved = payment.status === "approved";
  const hasReason =
    isRejected && payment.rejection_reason && payment.rejection_reason.trim();

  return (
    <div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Payment ID
            </p>
            <p className="mt-1 font-mono text-sm font-semibold break-all text-slate-900 dark:text-white">
              {payment.id}
            </p>
          </div>
          {statusBadge(payment.status)}
        </div>

        <dl className="mt-6 space-y-3 border-t border-slate-200 pt-6 text-sm dark:border-slate-700">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-slate-500 dark:text-slate-400">Plan</dt>
            <dd className="text-right font-medium text-slate-900 dark:text-white">
              {plan ? plan.name : (payment.plan_id ?? "—")}
            </dd>
          </div>

          {payment.payment_method && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">
                Payment Method
              </dt>
              <dd className="text-right font-medium text-slate-900 dark:text-white">
                {method ? method.displayName : payment.payment_method}
              </dd>
            </div>
          )}

          {typeof payment.amount === "number" && payment.amount > 0 && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Amount</dt>
              <dd className="text-right font-medium text-slate-900 dark:text-white">
                {payment.currency ?? ""} {payment.amount.toLocaleString()}
              </dd>
            </div>
          )}

          {payment.transaction_id && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">
                Transaction ID
              </dt>
              <dd className="text-right font-mono text-slate-900 break-all dark:text-white">
                {payment.transaction_id}
              </dd>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <dt className="text-slate-500 dark:text-slate-400">Submitted</dt>
            <dd className="text-right text-slate-900 dark:text-white">
              {formatDate(payment.created_at)}
            </dd>
          </div>

          {payment.status !== "pending" && payment.updated_at && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">
                Last Updated
              </dt>
              <dd className="text-right text-slate-900 dark:text-white">
                {formatDate(payment.updated_at)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {isApproved && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-800 dark:bg-green-950">
          <p className="text-sm font-semibold text-green-900 dark:text-green-100">
            Your payment has been approved.
          </p>
          <p className="mt-1 text-sm text-green-800 dark:text-green-200">
            Your license key has been issued and sent to your email. Check your
            inbox (and spam folder), then download the app and activate your
            key.
          </p>
        </div>
      )}

      {isRejected && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950">
          <p className="text-sm font-semibold text-red-900 dark:text-red-100">
            This payment was rejected.
          </p>
          {hasReason && (
            <p className="mt-1 text-sm text-red-800 dark:text-red-200">
              Reason: {payment.rejection_reason}
            </p>
          )}
          <p className="mt-2 text-sm text-red-800 dark:text-red-200">
            Contact support if you believe this is a mistake, or submit a new
            payment.
          </p>
        </div>
      )}

      {payment.status === "pending" && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Our team is verifying your payment. You will receive an email once
            it has been reviewed. This page updates automatically when you
            refresh.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            fetchStatus();
          }}
          disabled={refreshing}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          {refreshing ? "Refreshing…" : "Refresh Status"}
        </button>
        <Link
          href="/payment/manual"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
        >
          Submit Another Payment
        </Link>
      </div>
    </div>
  );
}
