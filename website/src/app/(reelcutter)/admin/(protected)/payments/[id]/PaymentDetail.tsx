"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_API } from "@/config/adminApi";
import { PUBLIC_ENV } from "@/config/publicEnv";
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

interface LicenseInfo {
  id?: string;
  licenseKey?: string;
  license_key?: string;
  tier?: string;
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
  license_key?: string | null;
  license?: LicenseInfo | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  proof?: ProofInfo;
}

interface ApproveResult {
  license: LicenseInfo | null;
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
        className={
          "text-sm text-gray-900" + (mono ? " font-mono break-all" : "")
        }
      >
        {value === null || value === undefined || value === "" ? "—" : value}
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
    null,
  );

  /**
   * License key is intentionally kept in component state.
   *
   * The backend approval response can return the licenseKey.
   * The payment detail endpoint may only return license_id.
   */
  const [licenseKey, setLicenseKey] = useState<string | null>(null);

  const [licenseAction, setLicenseAction] = useState<
    "reset-hwid" | "revoke" | null
  >(null);

  const [copySuccess, setCopySuccess] = useState(false);

  const load = useCallback(
    async (showSpinner = true) => {
      await Promise.resolve();

      if (showSpinner) {
        setLoading(true);
      }

      setError(null);

      try {
        const data = await adminFetch(ADMIN_API.payment(paymentId));

        const paymentData = data.payment as PaymentDetailData;

        setPayment(paymentData);

        /*
         * If the backend detail response includes the license key,
         * use it. Otherwise keep the key obtained from approval.
         */
        const detailLicenseKey =
          paymentData.license_key ||
          paymentData.license?.licenseKey ||
          paymentData.license?.license_key ||
          null;

        if (detailLicenseKey) {
          setLicenseKey(detailLicenseKey);
        }

        setProofBroken(false);
        setProofKey((k) => k + 1);
      } catch (err) {
        setError(describeAdminError(err));
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [paymentId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleApprove() {
    if (submitting) return;

    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);

    try {
      const body: Record<string, string> = {};

      if (adminNote.trim()) {
        body.admin_note = adminNote.trim();
      }

      const data = await adminFetch(ADMIN_API.approve(paymentId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const returnedLicense =
        (data.license as ApproveResult["license"]) ?? null;

      setApproveResult({
        license: returnedLicense,
        email: (data.email as ApproveResult["email"]) ?? null,
        already_approved: Boolean(data.already_approved),
      });

      /*
       * Save the actual license key returned by the secure
       * admin approval endpoint.
       */
      const returnedLicenseKey =
        returnedLicense?.licenseKey || returnedLicense?.license_key || null;

      if (returnedLicenseKey) {
        setLicenseKey(returnedLicenseKey);
      }

      setActionSuccess(
        data.already_approved
          ? "Payment was already approved. Details refreshed."
          : returnedLicenseKey ? "Payment approved successfully." : "Payment approved successfully. No license was created.",
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
      const body: Record<string, string> = {
        reason: rejectReason.trim(),
      };

      if (adminNote.trim()) {
        body.admin_note = adminNote.trim();
      }

      const data = await adminFetch(ADMIN_API.reject(paymentId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      setActionSuccess(
        data.already_rejected
          ? "Payment was already rejected. Details refreshed."
          : "Payment rejected.",
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

  async function handleCopyLicenseKey() {
    if (!licenseKey) return;

    setActionError(null);
    setActionSuccess(null);

    try {
      await navigator.clipboard.writeText(licenseKey);

      setCopySuccess(true);
      setActionSuccess("License key copied to clipboard.");

      window.setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch {
      setCopySuccess(false);
      setActionError(
        "Could not copy the license key. Please copy it manually.",
      );
    }
  }

  async function handleResetHwid() {
    if (!licenseKey || licenseAction) return;

    const confirmed = window.confirm(
      "Reset this license HWID?\n\nThe current device binding will be cleared. The customer can activate the license on another device.",
    );

    if (!confirmed) return;

    setLicenseAction("reset-hwid");
    setActionError(null);
    setActionSuccess(null);

    try {
      await adminFetch(ADMIN_API.resetLicenseHwid(licenseKey), {
        method: "POST",
      });

      setActionSuccess("License HWID has been reset successfully.");

      await load(false);
    } catch (err) {
      setActionError(describeAdminError(err));
    } finally {
      setLicenseAction(null);
    }
  }

  async function handleRevokeLicense() {
    if (!licenseKey || licenseAction) return;

    const confirmed = window.confirm(
      "Revoke this license?\n\nThis action disables the license and should only be used when you are certain.",
    );

    if (!confirmed) return;

    setLicenseAction("revoke");
    setActionError(null);
    setActionSuccess(null);

    try {
      await adminFetch(ADMIN_API.revokeLicense(licenseKey), {
        method: "POST",
      });

      setActionSuccess("License has been revoked successfully.");

      await load(false);
    } catch (err) {
      setActionError(describeAdminError(err));
    } finally {
      setLicenseAction(null);
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

        <Link
          href="/admin/payments"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to payments
        </Link>
      </div>
    );
  }

  if (!payment) return null;

  const isPending = payment.status === "pending";
  const isApproved = payment.status === "approved";

  const signedUrl = payment.proof?.signed_url || null;

  const displayedLicenseKey =
    licenseKey ||
    payment.license_key ||
    payment.license?.licenseKey ||
    payment.license?.license_key ||
    null;

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
          className={
            "px-2.5 py-1 rounded-full border text-xs font-semibold capitalize " +
            (payment.status === "pending"
              ? "bg-yellow-50 text-yellow-700 border-yellow-200"
              : payment.status === "approved"
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-red-50 text-red-700 border-red-200")
          }
        >
          {payment.status}
        </span>
      </div>

      {actionSuccess ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          <p>{actionSuccess}</p>

          {approveResult ? (
            <div className="mt-2 text-xs text-green-800">
              <p>
                License key:{" "}
                <span className="font-mono break-all">
                  {approveResult.license?.licenseKey ??
                    approveResult.license?.license_key ??
                    "generated"}
                </span>
              </p>

              {approveResult.email ? (
                <p>
                  Customer email:{" "}
                  {approveResult.email.success
                    ? "sent successfully"
                    : approveResult.email.error
                      ? "not sent (" + approveResult.email.error + ")"
                      : "not sent"}
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
              value={
                String(payment.amount) +
                (payment.currency ? " " + payment.currency.toUpperCase() : "")
              }
            />

            <Field label="Transaction ID" value={payment.transaction_id} mono />

            <Field label="Sender account" value={payment.sender_account} mono />

            <Field label="Submitted" value={formatDate(payment.created_at)} />

            <Field
              label="Last updated"
              value={formatDate(payment.updated_at)}
            />

            <Field
              label="Reviewed at"
              value={formatDate(payment.reviewed_at)}
            />

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
            <>
              {/* Signed URL is held only in component state for preview. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={proofKey}
                src={signedUrl}
                alt="Payment proof"
                className="w-full rounded-lg border border-gray-200 max-h-96 object-contain bg-gray-50"
                onError={() => setProofBroken(true)}
              />
            </>
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

      {/* ============================================================
          LICENSE MANAGEMENT
          ============================================================ */}

      {isApproved ? (
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">
              License Management
            </h2>

            <p className="text-xs text-gray-500 mt-1">
              Manage the license associated with this approved payment.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="text-xs uppercase tracking-wide text-gray-500">
                License Key
              </label>

              {displayedLicenseKey ? (
                <button
                  type="button"
                  onClick={handleCopyLicenseKey}
                  disabled={copySuccess}
                  className="text-xs px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                >
                  {copySuccess ? "Copied!" : "Copy License Key"}
                </button>
              ) : null}
            </div>

            {displayedLicenseKey ? (
              <div className="font-mono text-sm text-gray-900 bg-white border border-gray-200 rounded-md px-3 py-2 break-all select-all">
                {displayedLicenseKey}
              </div>
            ) : (
              <div className="text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-md px-3 py-3">
                License key is not available in the current admin response.
              </div>
            )}

            {payment.license_id ? (
              <p className="text-xs text-gray-500 mt-2">
                License ID:{" "}
                <span className="font-mono">{payment.license_id}</span>
              </p>
            ) : null}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleResetHwid}
              disabled={!displayedLicenseKey || !!licenseAction}
              className="px-4 py-2 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-800 text-sm font-semibold hover:bg-yellow-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {licenseAction === "reset-hwid"
                ? "Resetting HWID…"
                : "Reset HWID"}
            </button>

            <button
              type="button"
              onClick={handleRevokeLicense}
              disabled={!displayedLicenseKey || !!licenseAction}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {licenseAction === "revoke" ? "Revoking…" : "Revoke License"}
            </button>
          </div>

          {!displayedLicenseKey ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              The license ID is available, but the license key is not present in
              the current API response. Reset HWID and Revoke are disabled until
              the server provides the license key.
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              Reset HWID clears the current device binding. Revoke permanently
              disables the license.
            </p>
          )}
        </section>
      ) : null}

      {/* ============================================================
          PAYMENT REVIEW ACTIONS
          ============================================================ */}

      {isPending ? (
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Review actions
          </h2>

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
                Approve this payment? A license will be created and the customer
                will be emailed automatically. This cannot be undone.
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
                  className="block text-xs font-medium text-gray-600 mb-1"
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
                  className="block text-xs font-medium text-gray-600 mb-1"
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
