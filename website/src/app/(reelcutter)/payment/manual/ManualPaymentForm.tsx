"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PLANS } from "@/config/pricing";
import {
  MANUAL_PAYMENT_ENDPOINTS,
  MANUAL_PAYMENT_METHODS,
  PROOF_UPLOAD,
  getSuggestedAmount,
  type ManualPaymentMethodId,
} from "@/config/manualPayment";

interface ManualPaymentFormProps {
  defaultPlanId: string;
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; fileName: string }
  | { status: "done"; fileName: string; path: string }
  | { status: "error"; fileName: string; message: string };

interface SuccessState {
  id: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{7,20}$/;

function normalizePhone(value: string): string {
  return value.replace(/[\s\-().]/g, "").trim();
}

export default function ManualPaymentForm({
  defaultPlanId,
}: ManualPaymentFormProps) {
  const [planId, setPlanId] = useState<string>(defaultPlanId);
  const [methodId, setMethodId] = useState<ManualPaymentMethodId>("bkash");
  const [amountEdited, setAmountEdited] = useState(false);
  const method =
    MANUAL_PAYMENT_METHODS.find((m) => m.id === methodId) ??
    MANUAL_PAYMENT_METHODS[0];
  const [amount, setAmount] = useState<string>(() => {
    const suggested = getSuggestedAmount(defaultPlanId, method.currency);
    return suggested !== null ? String(suggested) : "";
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [senderAccount, setSenderAccount] = useState("");

  const [upload, setUpload] = useState<UploadState>({ status: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const tokenRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncSuggestedAmount = useCallback(
    (nextPlanId: string, nextCurrency: "BDT" | "USDT") => {
      if (amountEdited) return;
      const suggested = getSuggestedAmount(nextPlanId, nextCurrency);
      if (suggested !== null) {
        setAmount(String(suggested));
      }
    },
    [amountEdited]
  );

  // Detect signed-in user: prefill email, keep token for submit/upload
  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(
        ({ data }: { data: { session: { access_token?: string } | null } }) => {
          const session = data.session;
          if (session?.access_token) {
            tokenRef.current = session.access_token;
          }
        }
      )
      .catch(() => {})
      .then(() => {
        return supabase.auth.getUser();
      })
      .then(({ data }: { data: { user: { email?: string } | null } }) => {
        const user = data.user;
        if (user?.email) {
          setEmail((prev) => prev || user.email!);
        }
        setAuthChecked(true);
      })
      .catch(() => {
        setAuthChecked(true);
      });
  }, []);

  const validate = useCallback((): Record<string, string> => {
    const errors: Record<string, string> = {};

    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      errors.name = "Enter your name (1-100 characters).";
    }

    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail) || trimmedEmail.length > 254) {
      errors.email = "Enter a valid email address.";
    }

    if (whatsapp.trim()) {
      const normalized = normalizePhone(whatsapp);
      if (normalized.length > 20 || !PHONE_RE.test(normalized)) {
        errors.whatsapp = "Enter a valid WhatsApp number (digits, 7-20).";
      }
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      errors.amount = "Enter a positive amount.";
    } else if (parsedAmount > 1_000_000) {
      errors.amount = "Amount exceeds the maximum allowed.";
    }

    if (transactionId.trim().length < 1 || transactionId.trim().length > 100) {
      errors.transactionId = "Enter the transaction ID (1-100 characters).";
    }

    if (method.senderAccountRequired && !senderAccount.trim()) {
      errors.senderAccount = `${method.senderAccountLabel} is required.`;
    } else if (senderAccount.trim().length > 100) {
      errors.senderAccount = "Sender account must be at most 100 characters.";
    }

    if (upload.status !== "done") {
      errors.proof =
        upload.status === "uploading"
          ? "Wait for the proof upload to finish."
          : `Upload your payment proof (${PROOF_UPLOAD.allowedTypesLabel}, max ${PROOF_UPLOAD.maxLabel}).`;
    }

    return errors;
  }, [
    name,
    email,
    whatsapp,
    amount,
    transactionId,
    senderAccount,
    method,
    upload,
  ]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!(PROOF_UPLOAD.allowedTypes as readonly string[]).includes(file.type)) {
        setUpload({
          status: "error",
          fileName: file.name,
          message: `Unsupported file type. Use ${PROOF_UPLOAD.allowedTypesLabel}.`,
        });
        return;
      }
      if (file.size > PROOF_UPLOAD.maxBytes) {
        setUpload({
          status: "error",
          fileName: file.name,
          message: `File must be ${PROOF_UPLOAD.maxLabel} or smaller.`,
        });
        return;
      }

      setUpload({ status: "uploading", fileName: file.name });
      try {
        const headers: Record<string, string> = {
          "Content-Type": file.type,
        };
        const token = tokenRef.current;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await fetch(MANUAL_PAYMENT_ENDPOINTS.uploadProof, {
          method: "POST",
          headers,
          body: file,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success || !data?.proof?.path) {
          setUpload({
            status: "error",
            fileName: file.name,
            message:
              data?.error?.message ||
              "Upload failed. Please try again with a different image.",
          });
          return;
        }
        setUpload({
          status: "done",
          fileName: file.name,
          path: data.proof.path,
        });
      } catch {
        setUpload({
          status: "error",
          fileName: file.name,
          message: "Could not reach the upload server. Check your connection and try again.",
        });
      }
    },
    []
  );

  const removeProof = useCallback(() => {
    setUpload({ status: "idle" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const resetForm = useCallback(() => {
    setSuccess(null);
    setTransactionId("");
    setSenderAccount("");
    setWhatsapp("");
    setAmountEdited(false);
    setUpload({ status: "idle" });
    setFieldErrors({});
    setSubmitError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting || success) return;

      const errors = validate();
      setFieldErrors(errors);
      setSubmitError(null);
      if (Object.keys(errors).length > 0) return;

      setSubmitting(true);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const token = tokenRef.current;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const body: Record<string, unknown> = {
          customer_name: name.trim(),
          customer_email: email.trim(),
          plan_id: planId,
          payment_method: methodId,
          amount: parseFloat(amount),
          currency: method.currency,
          transaction_id: transactionId.trim(),
          sender_account: senderAccount.trim(),
        };
        if (whatsapp.trim()) {
          body.whatsapp_number = normalizePhone(whatsapp);
        }
        if (upload.status === "done") {
          body.proof_url = upload.path;
        }

        const res = await fetch(MANUAL_PAYMENT_ENDPOINTS.submit, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
          const code = data?.error?.code;
          let message =
            data?.error?.message || "Submission failed. Please try again.";
          if (code === "DUPLICATE_TRANSACTION") {
            message =
              "A payment with this transaction ID and method has already been submitted. If that was you, check your payment status.";
          } else if (code === "RATE_LIMITED") {
            message =
              "Too many attempts. Please wait a minute and try again.";
          }
          setSubmitError(message);
          return;
        }

        setSuccess({ id: data.payment.id });
      } catch {
        setSubmitError(
          "Could not connect to the payment server. Please try again later."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      success,
      validate,
      name,
      email,
      planId,
      methodId,
      amount,
      method.currency,
      transactionId,
      senderAccount,
      whatsapp,
      upload,
    ]
  );

  if (success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950">
        <h2 className="text-lg font-semibold text-green-900 dark:text-green-100">
          Payment submitted
        </h2>
        <p className="mt-2 text-sm text-green-800 dark:text-green-200">
          Your payment is pending review. You will receive an email after it
          has been verified. Keep your payment ID to check the status anytime.
        </p>
        <div className="mt-4 rounded-lg border border-green-200 bg-white p-4 dark:border-green-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Payment ID
          </p>
          <p className="mt-1 font-mono text-sm font-semibold break-all text-slate-900 dark:text-white">
            {success.id}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/payment/status/${success.id}`}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            View payment status
          </Link>
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
          >
            Submit another payment
          </button>
        </div>
      </div>
    );
  }

  const inputClass =
    "mt-2 block w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500";
  const labelClass =
    "block text-sm font-medium text-slate-900 dark:text-white";
  const errorClass = "mt-1 text-xs text-red-600 dark:text-red-400";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Plan & Amount */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="plan" className={labelClass}>
            Plan
          </label>
          <select
            id="plan"
            name="plan"
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              syncSuggestedAmount(e.target.value, method.currency);
            }}
            className={inputClass}
          >
            {PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.priceDisplay}/mo)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amount" className={labelClass}>
            Amount ({method.currency})
          </label>
          <input
            type="number"
            id="amount"
            name="amount"
            min={1}
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmountEdited(true);
              setAmount(e.target.value);
            }}
            placeholder="0"
            className={inputClass}
            required
          />
          {fieldErrors.amount && (
            <p className={errorClass}>{fieldErrors.amount}</p>
          )}
        </div>
      </div>

      {/* Payment Method */}
      <fieldset className="mt-6">
        <legend className={labelClass}>Payment Method</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MANUAL_PAYMENT_METHODS.map((m) => (
            <label
              key={m.id}
              className={`cursor-pointer rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition-colors ${
                methodId === m.id
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-300"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <input
                type="radio"
                name="payment_method"
                value={m.id}
                checked={methodId === m.id}
                onChange={() => {
                  setMethodId(m.id);
                  syncSuggestedAmount(planId, m.currency);
                }}
                className="sr-only"
              />
              {m.displayName}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Instructions (centralized config) */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          How to pay with {method.displayName}
        </h3>
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {method.accountLabel}
          </p>
          <p className="mt-1 rounded-md bg-slate-100 px-3 py-2 font-mono text-sm break-all text-slate-900 dark:bg-slate-900 dark:text-white">
            {method.account}
          </p>
        </div>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-400">
          {method.instructions.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
          Send <strong>{method.currency} {amount || "—"}</strong> for the{" "}
          {PLANS.find((p) => p.id === planId)?.name ?? planId} plan. The
          backend and our team remain the final authority on the accepted
          amount.
        </p>
      </div>

      {/* Your Details */}
      <div className="mt-6">
        <label htmlFor="customer_name" className={labelClass}>
          Full Name
        </label>
        <input
          type="text"
          id="customer_name"
          name="customer_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Your full name"
          className={inputClass}
          required
        />
        {fieldErrors.name && <p className={errorClass}>{fieldErrors.name}</p>}
      </div>

      <div className="mt-4">
        <label htmlFor="customer_email" className={labelClass}>
          Email Address
        </label>
        <input
          type="email"
          id="customer_email"
          name="customer_email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          placeholder="you@example.com"
          className={inputClass}
          required
        />
        {fieldErrors.email && (
          <p className={errorClass}>{fieldErrors.email}</p>
        )}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Your license key and review updates are sent to this email.
        </p>
      </div>

      <div className="mt-4">
        <label htmlFor="whatsapp_number" className={labelClass}>
          WhatsApp Number{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          type="tel"
          id="whatsapp_number"
          name="whatsapp_number"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          maxLength={20}
          placeholder="+8801XXXXXXXXX"
          className={inputClass}
        />
        {fieldErrors.whatsapp && (
          <p className={errorClass}>{fieldErrors.whatsapp}</p>
        )}
      </div>

      {/* Transaction Details */}
      <div className="mt-4">
        <label htmlFor="transaction_id" className={labelClass}>
          Transaction ID
        </label>
        <input
          type="text"
          id="transaction_id"
          name="transaction_id"
          value={transactionId}
          onChange={(e) => setTransactionId(e.target.value)}
          maxLength={100}
          placeholder="TrxID / reference from the confirmation"
          className={inputClass}
          required
        />
        {fieldErrors.transactionId && (
          <p className={errorClass}>{fieldErrors.transactionId}</p>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="sender_account" className={labelClass}>
          Sender Account
          {method.senderAccountRequired ? "" : " (optional)"}
        </label>
        <input
          type="text"
          id="sender_account"
          name="sender_account"
          value={senderAccount}
          onChange={(e) => setSenderAccount(e.target.value)}
          maxLength={100}
          placeholder={method.senderAccountLabel}
          className={inputClass}
          required={method.senderAccountRequired}
        />
        {fieldErrors.senderAccount && (
          <p className={errorClass}>{fieldErrors.senderAccount}</p>
        )}
      </div>

      {/* Proof Upload */}
      <div className="mt-6">
        <label htmlFor="payment_proof" className={labelClass}>
          Payment Proof
        </label>
        <input
          ref={fileInputRef}
          type="file"
          id="payment_proof"
          name="payment_proof"
          accept={PROOF_UPLOAD.allowedTypes.join(",")}
          onChange={handleFileChange}
          disabled={upload.status === "uploading"}
          className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700 dark:text-slate-400 dark:file:bg-indigo-500"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {PROOF_UPLOAD.allowedTypesLabel} only, max {PROOF_UPLOAD.maxLabel}.
        </p>

        {upload.status === "uploading" && (
          <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950">
            <p className="text-sm text-indigo-800 dark:text-indigo-200">
              Uploading {upload.fileName}…
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-900">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-500" />
            </div>
          </div>
        )}
        {upload.status === "done" && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
            <p className="text-sm break-all text-green-800 dark:text-green-200">
              Uploaded: {upload.fileName}
            </p>
            <button
              type="button"
              onClick={removeProof}
              className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
            >
              Remove
            </button>
          </div>
        )}
        {upload.status === "error" && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
            <p className="text-sm text-red-700 dark:text-red-300">
              {upload.message}
            </p>
          </div>
        )}
        {fieldErrors.proof && upload.status === "idle" && (
          <p className={errorClass}>{fieldErrors.proof}</p>
        )}
      </div>

      {/* Submit Error */}
      {submitError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">
            {submitError}
          </p>
        </div>
      )}

      {/* Submit */}
      <div className="mt-8">
        <button
          type="submit"
          disabled={
            submitting || !authChecked || upload.status === "uploading"
          }
          className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          {submitting ? (
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
              Submitting…
            </>
          ) : (
            "Submit Payment for Review"
          )}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          Your payment stays pending until our team verifies it. No license is
          issued at submission time.
        </p>
      </div>
    </form>
  );
}
