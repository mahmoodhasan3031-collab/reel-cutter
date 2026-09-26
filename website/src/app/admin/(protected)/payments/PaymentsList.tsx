"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ADMIN_API,
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_FILTERS,
} from "@/config/adminApi";
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

type StatusFilter = (typeof ADMIN_LIST_FILTERS)[number];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function statusBadge(status: string): string {
  switch (status) {
    case "pending":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "approved":
      return "bg-green-50 text-green-700 border-green-200";
    case "rejected":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

export default function PaymentsList() {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: StatusFilter, pageNum: number) => {
    // Yield before the first setState so the effect body stays async
    // (react-hooks/set-state-in-effect).
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch(
        ADMIN_API.payments({
          status,
          page: pageNum,
          limit: ADMIN_LIST_DEFAULT_LIMIT,
        })
      );
      setPayments((data.payments as PaymentRow[]) || []);
      setPagination((data.pagination as Pagination) || null);
    } catch (err) {
      setError(describeAdminError(err));
      setPayments([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial/filter data fetch: load() awaits before its first setState, so
    // no cascading sync render occurs; rule cannot see through useCallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(filter, page);
  }, [filter, page, load]);

  function changeFilter(status: StatusFilter) {
    setFilter(status);
    setPage(1);
  }

  const totalPages = pagination?.total_pages || 1;
  const total = pagination?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">Payments</h1>
        <button
          type="button"
          onClick={() => load(filter, page)}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Filter payments by status"
        className="flex gap-2 flex-wrap"
      >
        {ADMIN_LIST_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filter === status}
            onClick={() => changeFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
              filter === status
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {error}
        </p>
      ) : null}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Currency</th>
              <th className="px-4 py-3">Transaction ID</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {loading && !payments.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                  Loading payments…
                </td>
              </tr>
            ) : !payments.length && !error ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                  No {filter} payments found.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    router.push(`/admin/payments/${p.id}`);
                  }}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/payments/${p.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {p.customer_name || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.customer_email}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.plan_id}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">
                    {p.payment_method}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {p.amount}
                  </td>
                  <td className="px-4 py-3 text-gray-600 uppercase">
                    {p.currency}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {p.transaction_id || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${statusBadge(
                        p.status
                      )}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(p.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-gray-600">
        <span>
          {total} payment{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((n) => Math.max(1, n - 1))}
            disabled={loading || page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
            disabled={loading || page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
