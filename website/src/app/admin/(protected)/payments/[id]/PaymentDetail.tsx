"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_API } from "@/config/adminApi";
import {
  adminFetch,
  describeAdminError,
  isConflictError,
} from "@/lib/adminApi";

interface ProofInfo {
  reference: string | null;
  signed_url: string | null;
  expires_in_seconds: number;
}

interface PaymentDetailData {
  id: string;
  customer_name: string;
  customer_email: string;
  whatsapp_number: string | null;
  plan_id: string;
  payment_method: string;
  amount: number;
  currency: string;
  transaction_id: string | null;
  sender_account: string | null;
  proof_url: string | null;
  status: string;
  admin_note: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  license_id: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  proof?: ProofInfo;
}

interface ApproveResult {
  license: { id?: string; licenseKey?: string; tier?: string } | null;
  email: { success?: boolean; error?: string } | null;
  already_approved?: boolean;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd
        className={`text-sm text-gray-900 ${mono ? "font-mono break-all" : ""}`}
      >
        {value === null || value === undefined || value === ""
          ? "—"
          : value}
      </dd>
    </div>
  );
}

export default function PaymentDetail({ paymentId }: { paymentId: string }) {
  const [payment, setPayment] = useState<PaymentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [proofBroken, setProofBroken] = useState(false);
  const [proofKey, setProofKey] = useState(0);

  const [confirmAction, setConfirmAction] = useState<
    "approve" | "reject" | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(
    null
  );

  const load = useCallback(
    async (showSpinner = true) => {
      // Yield before the first setState so the effect body stays async
      // (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const data = await adminFetch(ADMIN_API.payment(paymentId));
        setPayment(data.payment as PaymentDetailData);
        setProofBroken(false);
        setProofKey((k) => k + 1);
      } catch (err) {
        setError(describeAdminError(err));
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [paymentId]
  );

  useEffect(() => {
    // Initial detail fetch: load() awaits before its first setState, so no
    // cascading sync render occurs; rule cannot see through useCallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleApprove() {
    if (submitting) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);
    try {
      // Server is authoritative: only optional admin_note is sent.
      const body: Record<string, string> = {};
      if (adminNote.trim()) body.admin_note = adminNote.trim();
      const data = await adminFetch(ADMIN_API.approve(paymentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setApproveResult({
        license: (data.license as ApproveResult["license"]) ?? null,
        email: (data.email as ApproveResult["email"]) ?? null,
        already_approved: Boolean(data.already_approved),
      });
      setActionSuccess(
        data.already_approved
          ? "Payment was already approved. Details refreshed."
          : "Payment approved successfully."
      );
      setConfirmAction(null);
      setAdminNote("");
      await load(false);
    } catch (err) {
      setActionError(describeAdminError(err));
      if (isConflictError(err)) {
        setConfirmAction(null);
        await load(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (submitting) return;
    setActionError(null);
    setActionSuccess(null);
    if (!rejectReason.trim()) {
      setActionError("A rejection reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = { reason: rejectReason.trim() };
      if (adminNote.trim()) body.admin_note = adminNote.trim();
      const data = await adminFetch(ADMIN_API.reject(paymentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setActionSuccess(
        data.already_rejected
          ? "Payment was already rejected. Details refreshed."
          : "Payment rejected."
      );
      setConfirmAction(null);
      setRejectReason("");
      setAdminNote("");
      await load(false);
    } catch (err) {
      setActionError(describeAdminError(err));
      if (isConflictError(err)) {
        setConfirmAction(null);
        await load(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !payment) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">Loading payment…</p>
    );
  }

  if (error && !payment) {
    return (
      <div className="space-y-4">
        <p
          role="alert"
          className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {error}
        </p>
        <Link href="/admin/payments" className="text-sm text-blue-600 hover:underline">
          ← Back to payments
        </Link>
      </div>
    );
  }

  if (!payment) return null;

  const isPending = payment.status === "pending";
  const signedUrl = payment.proof?.signed_url || null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/admin/payments"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to payments
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">
            Payment Details
          </h1>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full border text-xs font-semibold capitalize ${
            payment.status === "pending"
              ? "bg-yellow-50 text-yellow-700 border-yellow-200"
              : payment.status === "approved"
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {payment.status}
        </span>
      </div>

      {actionSuccess ? (
        <div
          role="status"
          className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 space-y-1"
        >
          <p>{actionSuccess}</p>
          {approveResult ? (
            <div className="text-xs text-green-800">
              {approveResult.already_approved ? (
                <p>Previously approved — no duplicate license was created.</p>
              ) : approveResult.license ? (
                <p>
                  License ID:{" "}
                  <span className="font-mono">
                    {approveResult.license.id || "—"}
                  </span>
                </p>
              ) : (
                <p>No license was created (manual review required).</p>
              )}
              {approveResult.email ? (
                <p>
                  Customer email:{" "}
                  {approveResult.email.success
                    ? "sent successfully"
                    : `not sent${approveResult.email.error ? ` (${approveResult.email.error})` : ""}`}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {actionError ? (
        <p
          role="alert"
          className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {actionError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Payment information
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Customer name" value={payment.customer_name} />
            <Field label="Customer email" value={payment.customer_email} />
            <Field label="WhatsApp" value={payment.whatsapp_number} />
            <Field label="Plan" value={payment.plan_id} />
            <Field label="Payment method" value={payment.payment_method} />
            <Field
              label="Amount"
              value={`${payment.amount} ${payment.currency?.toUpperCase() || ""}`}
            />
            <Field label="Transaction ID" value={payment.transaction_id} mono />
            <Field label="Sender account" value={payment.sender_account} mono />
            <Field label="Submitted" value={formatDate(payment.created_at)} />
            <Field label="Last updated" value={formatDate(payment.updated_at)} />
            <Field label="Reviewed at" value={formatDate(payment.reviewed_at)} />
            <Field label="Reviewed by" value={payment.reviewed_by} />
            <Field label="License ID" value={payment.license_id} mono />
            <Field label="Admin note" value={payment.admin_note} />
            <div className="sm:col-span-2">
              <Field
                label="Rejection reason"
                value={payment.rejection_reason}
              />
            </div>
          </dl>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Payment proof
          </h2>
          {signedUrl && !proofBroken ? (
            // Signed URL is held only in component state for preview and
            // is never persisted to storage or shared publicly.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={proofKey}
              src={signedUrl}
              alt="Payment proof"
              className="w-full rounded-lg border border-gray-200 max-h-96 object-contain bg-gray-50"
              onError={() => setProofBroken(true)}
            />
          ) : (
            <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-4 text-center">
              {proofBroken
                ? "The proof link expired or could not be loaded."
                : "No proof image available."}
              {payment.proof_url ? (
                <p className="mt-1 text-xs break-all">
                  Reference: {payment.proof?.reference || payment.proof_url}
                </p>
              ) : null}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setProofBroken(false);
              load(false);
            }}
            className="mt-3 w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            Refresh proof link
          </button>
          {payment.proof?.expires_in_seconds ? (
            <p className="mt-2 text-xs text-gray-400">
              Link expires in {payment.proof.expires_in_seconds}s — refresh to
              get a new one.
            </p>
          ) : null}
        </section>
      </div>

      {isPending ? (
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Review actions</h2>

          {confirmAction === null ? (
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setConfirmAction("approve")}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                Approve payment
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction("reject")}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                Reject payment
              </button>
            </div>
          ) : null}

          {confirmAction === "approve" ? (
            <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
              <p className="text-sm text-green-900 font-medium">
                Approve this payment? A license will be created and the
                customer will be emailed automatically. This cannot be undone.
              </p>
              <div>
                <label
                  htmlFor="approve-note"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Admin note (optional)
                </label>
                <textarea
                  id="approve-note"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={2}
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Optional internal note"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {submitting ? "Approving…" : "Confirm approval"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {confirmAction === "reject" ? (
            <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-3">
              <p className="text-sm text-red-900 font-medium">
                Reject this payment? A reason is required.
              </p>
              <div>
                <label
                  htmlFor="reject-reason"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Rejection reason (required)
                </label>
                <textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  disabled={submitting}
                  maxLength={1000}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Why is this payment being rejected?"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {rejectReason.length}/1000 characters
                </p>
              </div>
              <div>
                <label
                  htmlFor="reject-note"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Admin note (optional)
                </label>
                <textarea
                  id="reject-note"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={2}
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={submitting || !rejectReason.trim()}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {submitting ? "Rejecting…" : "Confirm rejection"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">
            This payment is {payment.status} — review actions are disabled.
          </p>
        </section>
      )}
    </div>
  );
}
