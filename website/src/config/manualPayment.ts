/**
 * Manual Payment Configuration (STEP 20A)
 *
 * Single source of truth for the customer-facing manual payment flow:
 * payment methods, destinations (via NEXT_PUBLIC_ env vars), instructions,
 * suggested amounts, and backend endpoints.
 *
 * This file is CLIENT-SAFE. It must never contain:
 *   - Supabase service-role keys
 *   - Admin credentials or session secrets
 *   - Storage credentials
 *   - Stripe secret/webhook keys
 *
 * The backend (server/routes/manualPayment.js) remains authoritative for
 * all validation and approval. Suggested amounts here are display-only.
 *
 * Environment Variables (client-side, inlined at build time):
 *   NEXT_PUBLIC_API_BASE_URL     - Backend API origin
 *   NEXT_PUBLIC_BKASH_NUMBER     - bKash destination number
 *   NEXT_PUBLIC_NAGAD_NUMBER     - Nagad destination number
 *   NEXT_PUBLIC_ROCKET_NUMBER    - Rocket destination number
 *   NEXT_PUBLIC_BANK_ACCOUNT     - Bank account details (name/number/branch)
 *   NEXT_PUBLIC_BINANCE_PAY_ID   - Binance Pay ID
 */

import { getPlanById, type TierId } from "./pricing";

export type ManualPaymentMethodId =
  | "bkash"
  | "nagad"
  | "rocket"
  | "bank"
  | "binance";

export type ManualPaymentCurrency = "BDT" | "USDT";

export interface ManualPaymentMethod {
  id: ManualPaymentMethodId;
  displayName: string;
  currency: ManualPaymentCurrency;
  /** Destination label shown to the customer (e.g. "bKash number to send to"). */
  accountLabel: string;
  /** Destination value from env. Falls back to a support prompt when unset. */
  account: string;
  /** Label for the "Sender Account" form field. */
  senderAccountLabel: string;
  senderAccountRequired: boolean;
  /** Ordered payment instructions shown after the method is selected. */
  instructions: string[];
}

const _apiBaseUrl: string =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

function destination(envValue: string | undefined): string {
  const value = (envValue || "").trim();
  return value || "Not configured — contact support for payment details.";
}

/**
 * Backend endpoints for the manual payment flow.
 * The status endpoint is a function so the payment ID is URL-encoded.
 */
export const MANUAL_PAYMENT_ENDPOINTS = {
  submit: `${_apiBaseUrl}/api/manual-payment/submit`,
  status: (paymentId: string): string =>
    `${_apiBaseUrl}/api/manual-payment/status/${encodeURIComponent(paymentId)}`,
  uploadProof: `${_apiBaseUrl}/api/upload/proof`,
} as const;

/**
 * Proof upload constraints — must mirror server/routes/upload.js.
 */
export const PROOF_UPLOAD = {
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  allowedTypesLabel: "JPEG, PNG, or WEBP",
  maxBytes: 5 * 1024 * 1024,
  maxLabel: "5 MB",
} as const;

/**
 * Suggested BDT amounts for local payment methods (display-only).
 * Kept in this single file — never duplicated elsewhere in the UI.
 * The backend validates amount > 0 and admin review remains authoritative.
 */
export const MANUAL_PLAN_SUGGESTED_BDT: Record<TierId, number> = {
  basic: 1000,
  standard: 2000,
  pro: 3500,
};

/**
 * Suggested amount for a plan in the given currency.
 * BDT comes from MANUAL_PLAN_SUGGESTED_BDT; USDT reuses the plan price
 * from the centralized pricing configuration (no duplicated price data).
 * Returns null when the plan is unknown.
 */
export function getSuggestedAmount(
  planId: string,
  currency: ManualPaymentCurrency
): number | null {
  if (currency === "USDT") {
    const plan = getPlanById(planId);
    return plan ? plan.price : null;
  }
  const amount = MANUAL_PLAN_SUGGESTED_BDT[planId as TierId];
  return typeof amount === "number" ? amount : null;
}

/**
 * All supported manual payment methods with customer-facing instructions.
 * Destinations come from environment variables — never hardcode them here.
 */
export const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = [
  {
    id: "bkash",
    displayName: "bKash",
    currency: "BDT",
    accountLabel: "bKash number to send to",
    account: destination(process.env.NEXT_PUBLIC_BKASH_NUMBER),
    senderAccountLabel: "Your bKash wallet number",
    senderAccountRequired: true,
    instructions: [
      "Open the bKash app and tap Send Money.",
      "Send the exact amount shown in the Amount field.",
      "Copy the TrxID from the confirmation screen — you will paste it below.",
      "Keep the confirmation screenshot; you will upload it as payment proof.",
    ],
  },
  {
    id: "nagad",
    displayName: "Nagad",
    currency: "BDT",
    accountLabel: "Nagad number to send to",
    account: destination(process.env.NEXT_PUBLIC_NAGAD_NUMBER),
    senderAccountLabel: "Your Nagad wallet number",
    senderAccountRequired: true,
    instructions: [
      "Open the Nagad app and tap Send Money.",
      "Send the exact amount shown in the Amount field.",
      "Copy the Transaction ID from the confirmation screen — you will paste it below.",
      "Keep the confirmation screenshot; you will upload it as payment proof.",
    ],
  },
  {
    id: "rocket",
    displayName: "Rocket",
    currency: "BDT",
    accountLabel: "Rocket number to send to",
    account: destination(process.env.NEXT_PUBLIC_ROCKET_NUMBER),
    senderAccountLabel: "Your Rocket wallet number",
    senderAccountRequired: true,
    instructions: [
      "Dial the Rocket Send Money menu or use the Rocket app.",
      "Send the exact amount shown in the Amount field.",
      "Copy the TrxID from the confirmation message — you will paste it below.",
      "Keep the confirmation screenshot; you will upload it as payment proof.",
    ],
  },
  {
    id: "bank",
    displayName: "Bank Transfer",
    currency: "BDT",
    accountLabel: "Bank account details",
    account: destination(process.env.NEXT_PUBLIC_BANK_ACCOUNT),
    senderAccountLabel: "Your bank account or account holder name",
    senderAccountRequired: true,
    instructions: [
      "Transfer the exact amount shown in the Amount field to the account below.",
      "Use your email address as the transfer reference.",
      "Copy the transaction reference ID from your bank — you will paste it below.",
      "Keep the transfer receipt; you will upload it as payment proof.",
    ],
  },
  {
    id: "binance",
    displayName: "Binance Pay",
    currency: "USDT",
    accountLabel: "Binance Pay ID to send to",
    account: destination(process.env.NEXT_PUBLIC_BINANCE_PAY_ID),
    senderAccountLabel: "Your Binance UID or email",
    senderAccountRequired: true,
    instructions: [
      "Open Binance → Pay and send USDT.",
      "Send the exact amount shown in the Amount field.",
      "Copy the Transaction ID from the transfer history — you will paste it below.",
      "Keep the transfer confirmation; you will upload it as payment proof.",
    ],
  },
];

/**
 * Look up a payment method by ID. Returns null when unknown.
 */
export function getManualPaymentMethod(
  methodId: string
): ManualPaymentMethod | null {
  return MANUAL_PAYMENT_METHODS.find((m) => m.id === methodId) ?? null;
}
