/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Manual Payment Configuration (STEP 20A) — CommonJS twin
 *
 * Mirrors manualPayment.ts for Node-based tests (require()).
 * Keep both files in sync when changing payment methods, endpoints,
 * instructions, or suggested amounts.
 *
 * CLIENT-SAFE. Never add service-role keys, admin credentials,
 * storage credentials, or Stripe secrets here.
 */

const { getPlanById } = require('./pricing');
const { PUBLIC_ENV } = require('./publicEnv');

const _apiBaseUrl = PUBLIC_ENV.apiBaseUrl;

function destination(envValue) {
  const value = (envValue || '').trim();
  return value || 'Not configured — contact support for payment details.';
}

const MANUAL_PAYMENT_ENDPOINTS = {
  submit: `${_apiBaseUrl}/api/manual-payment/submit`,
  status: (paymentId) =>
    `${_apiBaseUrl}/api/manual-payment/status/${encodeURIComponent(paymentId)}`,
  uploadProof: `${_apiBaseUrl}/api/upload/proof`,
};

const PROOF_UPLOAD = {
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedTypesLabel: 'JPEG, PNG, or WEBP',
  maxBytes: 5 * 1024 * 1024,
  maxLabel: '5 MB',
};

const MANUAL_PLAN_SUGGESTED_BDT = {
  basic: 1000,
  standard: 2000,
  pro: 3500,
};

function getSuggestedAmount(planId, currency) {
  if (currency === 'USDT') {
    const plan = getPlanById(planId);
    return plan ? plan.price : null;
  }
  const amount = MANUAL_PLAN_SUGGESTED_BDT[planId];
  return typeof amount === 'number' ? amount : null;
}

const MANUAL_PAYMENT_METHODS = [
  {
    id: 'bkash',
    displayName: 'bKash',
    currency: 'BDT',
    accountLabel: 'bKash number to send to',
    account: destination(process.env.NEXT_PUBLIC_BKASH_NUMBER),
    senderAccountLabel: 'Your bKash wallet number',
    senderAccountRequired: true,
    instructions: [
      'Open the bKash app and tap Send Money.',
      'Send the exact amount shown in the Amount field.',
      'Copy the TrxID from the confirmation screen — you will paste it below.',
      'Keep the confirmation screenshot; you will upload it as payment proof.',
    ],
  },
  {
    id: 'nagad',
    displayName: 'Nagad',
    currency: 'BDT',
    accountLabel: 'Nagad number to send to',
    account: destination(process.env.NEXT_PUBLIC_NAGAD_NUMBER),
    senderAccountLabel: 'Your Nagad wallet number',
    senderAccountRequired: true,
    instructions: [
      'Open the Nagad app and tap Send Money.',
      'Send the exact amount shown in the Amount field.',
      'Copy the Transaction ID from the confirmation screen — you will paste it below.',
      'Keep the confirmation screenshot; you will upload it as payment proof.',
    ],
  },
  {
    id: 'rocket',
    displayName: 'Rocket',
    currency: 'BDT',
    accountLabel: 'Rocket number to send to',
    account: destination(process.env.NEXT_PUBLIC_ROCKET_NUMBER),
    senderAccountLabel: 'Your Rocket wallet number',
    senderAccountRequired: true,
    instructions: [
      'Dial the Rocket Send Money menu or use the Rocket app.',
      'Send the exact amount shown in the Amount field.',
      'Copy the TrxID from the confirmation message — you will paste it below.',
      'Keep the confirmation screenshot; you will upload it as payment proof.',
    ],
  },
  {
    id: 'bank',
    displayName: 'Bank Transfer',
    currency: 'BDT',
    accountLabel: 'Bank account details',
    account: destination(process.env.NEXT_PUBLIC_BANK_ACCOUNT),
    senderAccountLabel: 'Your bank account or account holder name',
    senderAccountRequired: true,
    instructions: [
      'Transfer the exact amount shown in the Amount field to the account below.',
      'Use your email address as the transfer reference.',
      'Copy the transaction reference ID from your bank — you will paste it below.',
      'Keep the transfer receipt; you will upload it as payment proof.',
    ],
  },
  {
    id: 'binance',
    displayName: 'Binance Pay',
    currency: 'USDT',
    accountLabel: 'Binance Pay ID to send to',
    account: destination(process.env.NEXT_PUBLIC_BINANCE_PAY_ID),
    senderAccountLabel: 'Your Binance UID or email',
    senderAccountRequired: true,
    instructions: [
      'Open Binance → Pay and send USDT.',
      'Send the exact amount shown in the Amount field.',
      'Copy the Transaction ID from the transfer history — you will paste it below.',
      'Keep the transfer confirmation; you will upload it as payment proof.',
    ],
  },
];

function getManualPaymentMethod(methodId) {
  return MANUAL_PAYMENT_METHODS.find((m) => m.id === methodId) || null;
}

module.exports = {
  MANUAL_PAYMENT_ENDPOINTS,
  PROOF_UPLOAD,
  MANUAL_PLAN_SUGGESTED_BDT,
  getSuggestedAmount,
  MANUAL_PAYMENT_METHODS,
  getManualPaymentMethod,
};
