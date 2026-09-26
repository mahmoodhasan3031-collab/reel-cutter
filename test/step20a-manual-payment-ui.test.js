'use strict';

/**
 * STEP 20A Tests — Customer Manual Payment UI
 *
 * Tests:
 *   A. Centralized Payment Method Configuration
 *   B. Manual Payment Page Structure
 *   C. Form Fields & Validation
 *   D. Proof Upload Integration (STEP 18)
 *   E. Payment Submission (STEP 17)
 *   F. Status Page (STEP 17)
 *   G. Pricing Page Integration
 *   H. Security: No Secrets in Frontend
 *   I. No Admin/Stripe/HWID Touches
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const CONFIG_TS = path.join(ROOT, 'website', 'src', 'config', 'manualPayment.ts');
const CONFIG_JS = path.join(ROOT, 'website', 'src', 'config', 'manualPayment.js');
const MANUAL_PAGE = path.join(ROOT, 'website', 'src', 'app', 'payment', 'manual', 'page.tsx');
const MANUAL_FORM = path.join(ROOT, 'website', 'src', 'app', 'payment', 'manual', 'ManualPaymentForm.tsx');
const STATUS_PAGE = path.join(ROOT, 'website', 'src', 'app', 'payment', 'status', '[id]', 'page.tsx');
const STATUS_CLIENT = path.join(ROOT, 'website', 'src', 'app', 'payment', 'status', '[id]', 'PaymentStatusClient.tsx');
const PRICING_PAGE = path.join(ROOT, 'website', 'src', 'app', 'pricing', 'page.tsx');
const ENV_EXAMPLE = path.join(ROOT, 'website', '.env.example');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 20A — Customer Manual Payment UI Tests');
console.log('═══════════════════════════════════════════════════════════════\n');

// ─── A. Centralized Payment Method Configuration ────────────────────────────

console.log('── A. Centralized Payment Method Configuration ──');

test('A1. manualPayment.ts config exists', () => {
  assert.ok(fs.existsSync(CONFIG_TS), 'manualPayment.ts must exist');
});

test('A2. manualPayment.js CJS twin exists', () => {
  assert.ok(fs.existsSync(CONFIG_JS), 'manualPayment.js must exist');
});

test('A3. Config exports 5 methods: bkash, nagad, rocket, bank, binance', () => {
  const config = require('../website/src/config/manualPayment');
  const ids = config.MANUAL_PAYMENT_METHODS.map((m) => m.id);
  assert.deepStrictEqual(ids, ['bkash', 'nagad', 'rocket', 'bank', 'binance']);
});

test('A4. BDT methods use BDT, binance uses USDT', () => {
  const config = require('../website/src/config/manualPayment');
  const byId = Object.fromEntries(config.MANUAL_PAYMENT_METHODS.map((m) => [m.id, m]));
  assert.strictEqual(byId.bkash.currency, 'BDT');
  assert.strictEqual(byId.nagad.currency, 'BDT');
  assert.strictEqual(byId.rocket.currency, 'BDT');
  assert.strictEqual(byId.bank.currency, 'BDT');
  assert.strictEqual(byId.binance.currency, 'USDT');
});

test('A5. Every method has a destination read from env (not hardcoded)', () => {
  const config = require('../website/src/config/manualPayment');
  config.MANUAL_PAYMENT_METHODS.forEach((m) => {
    assert.ok(typeof m.account === 'string' && m.account.length > 0,
      `${m.id} must have a destination`);
    assert.ok(m.accountLabel && m.accountLabel.length > 0,
      `${m.id} must have an account label`);
  });
  const src = read(CONFIG_TS);
  ['NEXT_PUBLIC_BKASH_NUMBER', 'NEXT_PUBLIC_NAGAD_NUMBER',
   'NEXT_PUBLIC_ROCKET_NUMBER', 'NEXT_PUBLIC_BANK_ACCOUNT',
   'NEXT_PUBLIC_BINANCE_PAY_ID'].forEach((envVar) => {
    assert.ok(src.includes(envVar), `config must read ${envVar}`);
  });
});

test('A6. Every method has ordered instructions', () => {
  const config = require('../website/src/config/manualPayment');
  config.MANUAL_PAYMENT_METHODS.forEach((m) => {
    assert.ok(Array.isArray(m.instructions) && m.instructions.length >= 3,
      `${m.id} must have at least 3 instructions`);
  });
});

test('A7. Endpoints point to upload/proof, manual-payment/submit, manual-payment/status', () => {
  const config = require('../website/src/config/manualPayment');
  assert.ok(config.MANUAL_PAYMENT_ENDPOINTS.uploadProof.endsWith('/api/upload/proof'),
    `upload endpoint: ${config.MANUAL_PAYMENT_ENDPOINTS.uploadProof}`);
  assert.ok(config.MANUAL_PAYMENT_ENDPOINTS.submit.endsWith('/api/manual-payment/submit'),
    `submit endpoint: ${config.MANUAL_PAYMENT_ENDPOINTS.submit}`);
  const statusUrl = config.MANUAL_PAYMENT_ENDPOINTS.status('abc-123');
  assert.ok(statusUrl.endsWith('/api/manual-payment/status/abc-123'),
    `status endpoint: ${statusUrl}`);
});

test('A8. Proof upload constraints mirror server: jpeg/png/webp, 5MB', () => {
  const config = require('../website/src/config/manualPayment');
  assert.deepStrictEqual(config.PROOF_UPLOAD.allowedTypes,
    ['image/jpeg', 'image/png', 'image/webp']);
  assert.strictEqual(config.PROOF_UPLOAD.maxBytes, 5 * 1024 * 1024);
});

test('A9. Suggested BDT amounts defined for all plans; USDT reuses pricing', () => {
  const config = require('../website/src/config/manualPayment');
  ['basic', 'standard', 'pro'].forEach((plan) => {
    const bdt = config.getSuggestedAmount(plan, 'BDT');
    assert.ok(typeof bdt === 'number' && bdt > 0, `${plan} BDT suggestion`);
    const usdt = config.getSuggestedAmount(plan, 'USDT');
    assert.ok(typeof usdt === 'number' && usdt > 0, `${plan} USDT suggestion`);
  });
  assert.strictEqual(config.getSuggestedAmount('unknown', 'BDT'), null);
  const { PLANS } = require('../website/src/config/pricing');
  PLANS.forEach((p) => {
    assert.strictEqual(config.getSuggestedAmount(p.id, 'USDT'), p.price,
      `${p.id} USDT amount must reuse pricing config`);
  });
});

// ─── B. Manual Payment Page Structure ───────────────────────────────────────

console.log('\n── B. Manual Payment Page Structure ──');

test('B1. /payment/manual page exists', () => {
  assert.ok(fs.existsSync(MANUAL_PAGE), 'manual page.tsx must exist');
});

test('B2. ManualPaymentForm client component exists', () => {
  assert.ok(fs.existsSync(MANUAL_FORM), 'ManualPaymentForm.tsx must exist');
});

test('B3. Page is noindex and reads ?plan= search param', () => {
  const src = read(MANUAL_PAGE);
  assert.ok(src.includes('searchParams'), 'page must read searchParams');
  assert.ok(src.includes('robots'), 'page must set robots metadata');
  assert.ok(src.includes('isValidPlanId'), 'page must validate plan param');
});

test('B4. Page shows manual verification notice', () => {
  const src = read(MANUAL_PAGE);
  assert.ok(src.includes('manually verified'), 'must show manual verification notice');
  assert.ok(/license is issued\s+only after verification/.test(src),
    'must say license issued only after verification');
});

test('B5. Page shows the customer flow steps (upload, submit, status, license)', () => {
  const src = read(MANUAL_PAGE);
  assert.ok(/upload/i.test(src), 'steps must mention upload');
  assert.ok(/transaction ID/i.test(src), 'steps must mention transaction ID');
  assert.ok(/status/i.test(src), 'steps must mention status tracking');
  assert.ok(/license key/i.test(src), 'steps must mention license key delivery');
});

// ─── C. Form Fields & Validation ────────────────────────────────────────────

console.log('\n── C. Form Fields & Validation ──');

test('C1. Form has plan selector populated from pricing config', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('from "@/config/pricing"'), 'must import pricing config');
  assert.ok(src.includes('PLANS.map'), 'must render plan options from PLANS');
  assert.ok(/name="plan"|id="plan"/.test(src), 'must have a plan field');
});

test('C2. Form has all required fields: name, email, whatsapp, method, amount, txn, sender, proof', () => {
  const src = read(MANUAL_FORM);
  ['customer_name', 'customer_email', 'whatsapp_number', 'payment_method',
   'amount', 'transaction_id', 'sender_account', 'payment_proof'].forEach((field) => {
    assert.ok(src.includes(field), `form must include field ${field}`);
  });
});

test('C3. Form renders payment method options from centralized config', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('from "@/config/manualPayment"'),
    'must import manual payment config');
  assert.ok(src.includes('MANUAL_PAYMENT_METHODS.map'),
    'must render methods from config');
});

test('C4. Form shows destination and instructions for selected method', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('method.account'), 'must show destination account');
  assert.ok(src.includes('method.accountLabel'), 'must show destination label');
  assert.ok(src.includes('method.instructions'), 'must show instructions');
  assert.ok(src.includes('How to pay'), 'must have a how-to-pay heading');
});

test('C5. Client-side validation: name, email, whatsapp, amount, txn, sender', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('EMAIL_RE'), 'must validate email format');
  assert.ok(src.includes('PHONE_RE'), 'must validate phone format');
  assert.ok(src.includes('trimmedName.length < 1 || trimmedName.length > 100'),
    'must validate name length 1-100');
  assert.ok(src.includes('parsedAmount <= 0'), 'must require positive amount');
  assert.ok(src.includes('1_000_000'), 'must cap amount at 1M');
  assert.ok(src.includes('transactionId.trim().length < 1'),
    'must require transaction ID');
  assert.ok(src.includes('senderAccountRequired && !senderAccount.trim()'),
    'must require sender account when appropriate');
});

test('C6. Authenticated user Bearer token attached on submit', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('getSession'), 'must read session');
  assert.ok(src.includes('access_token'), 'must extract access token');
  assert.ok(src.includes('"Authorization"') || src.includes("'Authorization'"),
    'must set Authorization header');
});

test('C7. Currency derived from selected method (BDT vs USDT)', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('currency: method.currency'),
    'must submit method-derived currency');
  assert.ok(src.includes('Amount ({method.currency})'),
    'must label amount field with currency');
});

// ─── D. Proof Upload Integration (STEP 18) ─────────────────────────────────

console.log('\n── D. Proof Upload Integration (STEP 18) ──');

test('D1. File input restricted to allowed types and size', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('accept={PROOF_UPLOAD.allowedTypes.join(",")}'),
    'file input must use allowed types');
  assert.ok(/allowedTypes[^)]*\)\.includes\(file\.type\)/.test(src),
    'must validate type before upload');
  assert.ok(src.includes('file.size > PROOF_UPLOAD.maxBytes'),
    'must validate size before upload');
});

test('D2. Upload posts raw binary to STEP 18 endpoint', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('MANUAL_PAYMENT_ENDPOINTS.uploadProof'),
    'must use uploadProof endpoint');
  assert.ok(src.includes('body: file'), 'must post the file as raw body');
  assert.ok(src.includes('"Content-Type": file.type'),
    'must send file Content-Type');
});

test('D3. Upload stores returned proof reference for submit', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('data?.proof?.path'), 'must read proof.path from response');
  assert.ok(src.includes('body.proof_url = upload.path'),
    'must submit stored proof reference as proof_url');
});

test('D4. Upload shows progress/state; no proof_url text input exists', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('uploading'), 'must show uploading state');
  assert.ok(src.includes('Uploaded:'), 'must show uploaded state');
  assert.ok(src.includes('Remove'), 'must allow removing proof');
  assert.ok(!/type="url"[^>]*proof|proof_url[^>]*type="text"/.test(src),
    'must not expose a free-text proof URL field');
});

test('D5. Submit blocked while upload in progress', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes("upload.status === \"uploading\""),
    'submit must be disabled while uploading');
});

// ─── E. Payment Submission (STEP 17) ───────────────────────────────────────

console.log('\n── E. Payment Submission (STEP 17) ──');

test('E1. Submit posts to STEP 17 endpoint with JSON body', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('MANUAL_PAYMENT_ENDPOINTS.submit'),
    'must use submit endpoint');
  assert.ok(src.includes('"Content-Type": "application/json"'),
    'must send JSON');
  assert.ok(src.includes('JSON.stringify(body)'), 'must serialize body');
});

test('E2. Body contains all allowed STEP 17 fields', () => {
  const src = read(MANUAL_FORM);
  ['customer_name', 'customer_email', 'plan_id', 'payment_method',
   'amount', 'currency', 'transaction_id', 'sender_account',
   'whatsapp_number', 'proof_url'].forEach((field) => {
    assert.ok(src.includes(field), `body must include ${field}`);
  });
});

test('E3. Body never submits status/rejection/license fields', () => {
  const src = read(MANUAL_FORM);
  assert.ok(!/body\.status\s*=/.test(src), 'must not set body.status');
  assert.ok(!/body\.rejection_reason\s*=/.test(src),
    'must not set body.rejection_reason');
  assert.ok(!/body\.reviewed_by\s*=/.test(src), 'must not set body.reviewed_by');
  assert.ok(!/body\.license_key\s*=/.test(src), 'must not set body.license_key');
});

test('E4. DUPLICATE_TRANSACTION (409) gets a friendly message', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('DUPLICATE_TRANSACTION'),
    'must handle DUPLICATE_TRANSACTION code');
  assert.ok(src.includes('already been submitted'),
    'must show friendly duplicate message');
});

test('E5. Handles rate limiting and generic network errors', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('RATE_LIMITED'), 'must handle rate limiting');
  assert.ok(src.includes('Too many attempts'), 'must show rate limit message');
  assert.ok(src.includes('Could not connect to the payment server'),
    'must show network error fallback');
});

test('E6. Success screen shows payment ID and status page link', () => {
  const src = read(MANUAL_FORM);
  assert.ok(src.includes('Payment submitted'), 'must show success heading');
  assert.ok(src.includes('Payment ID'), 'must show payment ID');
  assert.ok(src.includes('/payment/status/'), 'must link to status page');
  assert.ok(src.includes('pending review'), 'must explain pending review');
});

// ─── F. Status Page (STEP 17) ───────────────────────────────────────────────

console.log('\n── F. Status Page (STEP 17) ──');

test('F1. /payment/status/[id] page and client component exist', () => {
  assert.ok(fs.existsSync(STATUS_PAGE), 'status page.tsx must exist');
  assert.ok(fs.existsSync(STATUS_CLIENT), 'PaymentStatusClient.tsx must exist');
});

test('F2. Status page is noindex; client fetches STEP 17 status endpoint', () => {
  const pageSrc = read(STATUS_PAGE);
  assert.ok(pageSrc.includes('robots'), 'status page must set robots metadata');
  const clientSrc = read(STATUS_CLIENT);
  assert.ok(clientSrc.includes('MANUAL_PAYMENT_ENDPOINTS.status'),
    'must use status endpoint');
});

test('F3. Status page renders all statuses: pending, approved, rejected', () => {
  const src = read(STATUS_CLIENT);
  assert.ok(src.includes('"pending"'), 'must render pending');
  assert.ok(src.includes('"approved"'), 'must render approved');
  assert.ok(src.includes('"rejected"'), 'must render rejected');
  assert.ok(src.includes('Pending Review'), 'pending badge label');
  assert.ok(src.includes('Approved'), 'approved badge label');
  assert.ok(src.includes('Rejected'), 'rejected badge label');
});

test('F4. Displays payment details: id, plan, method, amount, txn, dates', () => {
  const src = read(STATUS_CLIENT);
  ['Payment ID', 'Plan', 'Payment Method', 'Amount', 'Transaction ID',
   'Submitted'].forEach((label) => {
    assert.ok(src.includes(label), `status page must show ${label}`);
  });
  assert.ok(src.includes('Last Updated'), 'must show reviewed/updated date when available');
});

test('F5. Rejected: shows rejection reason when returned', () => {
  const src = read(STATUS_CLIENT);
  assert.ok(src.includes('rejection_reason'), 'must read rejection_reason');
  assert.ok(src.includes('Reason:'), 'must display the reason');
  assert.ok(src.includes('This payment was rejected'),
    'must show rejected explanation');
});

test('F6. Approved: explains license key issued and emailed', () => {
  const src = read(STATUS_CLIENT);
  assert.ok(src.includes('approved'), 'must detect approved status');
  assert.ok(src.includes('license key has been issued and sent to your email'),
    'must explain license delivery');
});

test('F7. Handles 404 NOT_FOUND and connection errors', () => {
  const src = read(STATUS_CLIENT);
  assert.ok(src.includes('Payment not found'), 'must handle 404');
  assert.ok(src.includes('429'), 'must handle rate limiting');
  assert.ok(src.includes('Could not connect'),
    'must handle connection failure');
});

test('F8. Anonymous access allowed (Authorization only when session exists)', () => {
  const src = read(STATUS_CLIENT);
  assert.ok(src.includes('if (token)'), 'must attach token only when present');
  assert.ok(src.includes('getSession'), 'must check for session');
});

// ─── G. Pricing Page Integration ────────────────────────────────────────────

console.log('\n── G. Pricing Page Integration ──');

test('G1. Pricing cards link to /payment/manual?plan=', () => {
  const src = read(PRICING_PAGE);
  assert.ok(src.includes('/payment/manual?plan='),
    'pricing page must link to manual payment per plan');
});

test('G2. Pricing FAQ mentions manual payment methods', () => {
  const src = read(PRICING_PAGE);
  assert.ok(src.includes('/payment/manual'),
    'FAQ must link to manual payment');
  assert.ok(src.includes('bKash'), 'FAQ must mention bKash');
  assert.ok(src.includes('Binance Pay'), 'FAQ must mention Binance Pay');
});

test('G3. .env.example documents all manual payment destination vars', () => {
  const src = read(ENV_EXAMPLE);
  ['NEXT_PUBLIC_BKASH_NUMBER', 'NEXT_PUBLIC_NAGAD_NUMBER',
   'NEXT_PUBLIC_ROCKET_NUMBER', 'NEXT_PUBLIC_BANK_ACCOUNT',
   'NEXT_PUBLIC_BINANCE_PAY_ID'].forEach((envVar) => {
    assert.ok(src.includes(envVar), `.env.example must document ${envVar}`);
  });
});

// ─── H. Security: No Secrets in Frontend ────────────────────────────────────

console.log('\n── H. Security: No Secrets in Frontend ──');

function collectWebsiteSrcFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectWebsiteSrcFiles(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

test('H1. No service-role keys anywhere in website/src', () => {
  const files = collectWebsiteSrcFiles(path.join(ROOT, 'website', 'src'));
  const banned = [
    /SUPABASE_SERVICE_ROLE/i,
    /service_role/i,
    /serviceRoleKey/,
    /SERVICE_ROLE_KEY/,
  ];
  files.forEach((f) => {
    const src = read(f);
    banned.forEach((re) => {
      assert.ok(!re.test(src),
        `${path.relative(ROOT, f)} matches banned pattern ${re}`);
    });
  });
});

test('H2. New STEP 20A files contain no admin or storage credentials', () => {
  const banned = [
    /ADMIN_PASSWORD/i, /ADMIN_SESSION/i, /admin.*password/i,
    /STORAGE_SECRET/i, /STORAGE_KEY/i, /sk_live_/i, /whsec_/i,
    /STRIPE_SECRET/,
  ];
  [CONFIG_TS, CONFIG_JS, MANUAL_PAGE, MANUAL_FORM,
   STATUS_PAGE, STATUS_CLIENT].forEach((f) => {
    const src = read(f);
    banned.forEach((re) => {
      assert.ok(!re.test(src),
        `${path.relative(ROOT, f)} matches banned pattern ${re}`);
    });
  });
});

test('H3. Payment destinations come only from NEXT_PUBLIC_ env vars', () => {
  [CONFIG_TS, CONFIG_JS].forEach((f) => {
    const src = read(f);
    assert.ok(!/account:\s*["'][0-9]/.test(src),
      `${path.basename(f)} must not hardcode numeric destinations`);
    assert.ok(!/account:\s*["'][A-Za-z ]{5,}\d/.test(src),
      `${path.basename(f)} must not hardcode account strings`);
  });
});

test('H4. Form never constructs admin or Stripe API URLs', () => {
  [MANUAL_FORM, STATUS_CLIENT].forEach((f) => {
    const src = read(f);
    assert.ok(!/\/api\/admin/.test(src), 'must not call admin APIs');
    assert.ok(!/stripe/i.test(src), 'must not touch Stripe from manual flow');
    assert.ok(!/\/api\/payment\/create-checkout-session/.test(src),
      'must not call Stripe checkout');
  });
});

// ─── I. No Admin/Stripe/HWID Touches ────────────────────────────────────────

console.log('\n── I. No Admin/Stripe/HWID Touches ──');

test('I1. STEP 17 backend routes untouched (hash of endpoints still present)', () => {
  const src = read(path.join(ROOT, 'server', 'routes', 'manualPayment.js'));
  assert.ok(src.includes("VALID_PAYMENT_METHODS = ['bkash', 'nagad', 'rocket', 'bank', 'binance']"),
    'backend methods unchanged');
  assert.ok(src.includes("router.post('/submit'"), 'submit route unchanged');
  assert.ok(src.includes("router.get('/status/:id'"), 'status route unchanged');
});

test('I2. STEP 18 upload backend untouched', () => {
  const src = read(path.join(ROOT, 'server', 'routes', 'upload.js'));
  assert.ok(src.includes("BUCKET_NAME = 'payment-proofs'"), 'bucket unchanged');
  assert.ok(src.includes('MAX_FILE_SIZE = 5 * 1024 * 1024'), 'size limit unchanged');
});

test('I3. No changes to Stripe checkout flow files (still exist and intact)', () => {
  const checkoutPage = read(path.join(ROOT, 'website', 'src', 'app', 'checkout', 'page.tsx'));
  assert.ok(checkoutPage.includes('CheckoutForm'), 'Stripe checkout intact');
  const checkoutForm = read(path.join(ROOT, 'website', 'src', 'app', 'checkout', 'CheckoutForm.tsx'));
  assert.ok(checkoutForm.includes('checkoutEndpoint'),
    'Stripe form intact');
  const paymentConfig = read(path.join(ROOT, 'website', 'src', 'config', 'payment.ts'));
  assert.ok(paymentConfig.includes('create-checkout-session'),
    'Stripe checkout endpoint intact');
});

test('I4. STEP 20A payment pages are independent of admin dashboard (STEP 20B owns /admin)', () => {
  const appDir = path.join(ROOT, 'website', 'src', 'app');
  const adminDir = path.join(appDir, 'admin');
  // /admin now exists (STEP 20B) but STEP 20A files must not depend on it.
  [MANUAL_PAGE, MANUAL_FORM, STATUS_CLIENT].forEach((f) => {
    const src = read(f);
    assert.ok(!/\/admin/.test(src),
      `${path.basename(f)} must not reference admin routes`);
  });
  assert.ok(fs.existsSync(path.join(adminDir, 'login', 'page.tsx')),
    'STEP 20B admin login exists under website/src/app/admin');
});

test('I5. No HWID/license activation logic in STEP 20A files', () => {
  [CONFIG_TS, MANUAL_FORM, STATUS_CLIENT].forEach((f) => {
    const src = read(f);
    assert.ok(!/hwid/i.test(src), `${path.basename(f)} must not reference HWID`);
    assert.ok(!/activateLicense|license\/activate|activation_key/i.test(src),
      `${path.basename(f)} must not contain activation logic`);
  });
});

test('I6. New files are the only additions under website/src/app/payment', () => {
  const paymentDir = path.join(ROOT, 'website', 'src', 'app', 'payment');
  assert.ok(fs.existsSync(paymentDir), 'payment route dir must exist');
  const entries = fs.readdirSync(paymentDir).sort();
  assert.deepStrictEqual(entries, ['manual', 'status'],
    `payment dir should only contain manual and status, got: ${entries.join(', ')}`);
});

// ─── Results ───────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`STEP 20A Test Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
