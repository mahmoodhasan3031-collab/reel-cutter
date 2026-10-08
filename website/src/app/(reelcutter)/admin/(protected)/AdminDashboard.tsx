"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_API, ADMIN_LIST_FILTERS } from "@/config/adminApi";
import { adminFetch, describeAdminError } from "@/lib/adminApi";

interface PaymentRow {
  id: string;
  customer_name: string;
  customer_email: string;
  plan_id: string;
  payment_method: string;
  amount: number;
  currency: string;
  transaction_id: string | null;
  status: string;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface StatusCount {
  status: string;
  total: number;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function AdminDashboard() {
  const [counts, setCounts] = useState<StatusCount[] | null>(null);
  const [recent, setRecent] = useState<PaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Yield before the first setState so the effect body stays async
    // (react-hooks/set-state-in-effect).
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      // pagination.total is the server's exact global count per status;
      // limit=1 keeps the response minimal.
      const countResults = await Promise.all(
        ADMIN_LIST_FILTERS.map(async (status) => {
          const data = await adminFetch(
            ADMIN_API.payments({ status, page: 1, limit: 1 })
          );
          const pagination = data.pagination as Pagination | undefined;
          return { status, total: pagination?.total ?? 0 };
        })
      );
      setCounts(countResults);

      const recentData = await adminFetch(
        ADMIN_API.payments({ status: "pending", page: 1, limit: 5 })
      );
      setRecent((recentData.payments as PaymentRow[]) || []);
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial data fetch: load() awaits before its first setState, so no
    // cascading sync render occurs; rule cannot see through useCallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Payment counts">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Payment counts
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(counts || ADMIN_LIST_FILTERS.map((s) => ({ status: s, total: -1 }))).map(
            (c) => (
              <div
                key={c.status}
                className="bg-white border border-gray-200 rounded-xl p-4"
              >
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  {c.status}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading || c.total < 0 ? "…" : c.total}
                </p>
              </div>
            )
          )}
        </div>
      </section>

      <section aria-label="Recent pending submissions">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Recent submissions (pending)
          </h2>
          <Link
            href="/admin/payments"
            className="text-sm text-blue-600 hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading && !recent.length ? (
            <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>
          ) : !recent.length && !error ? (
            <p className="px-4 py-6 text-sm text-gray-500">
              No pending payments.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/payments/${p.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {p.customer_name || "—"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {p.customer_email} · {p.plan_id} · {p.payment_method}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {p.amount} {p.currency}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(p.created_at)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
