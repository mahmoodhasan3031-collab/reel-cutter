'use strict';

/**
 * STEP 20B Tests — Admin Dashboard UI
 *
 * Tests:
 *   A. Admin Login UI
 *   B. Admin Login Success Flow
 *   C. Authentication Failure Handling
 *   D. Protected Route Redirects
 *   E. Payment List Rendering
 *   F. Status Filtering
 *   G. Pagination
 *   H. Payment Details Rendering
 *   I. Proof Preview
 *   J. Expired Proof URL Refresh
 *   K. Approve Confirmation
 *   L. Approve API Integration
 *   M. Reject Confirmation
 *   N. Rejection Reason Required
 *   O. Reject API Integration
 *   P. 401 Handling
 *   Q. 403 Handling
 *   R. 429 Handling
 *   S. 409 Handling
 *   T. Logout
 *   U. No Admin Secrets in Client Bundle
 *   V. No Service-Role Key in Client Bundle
 *   W. No Client-Side License Creation
 *   X. No Client-Controlled Reviewer/Status Fields
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'website', 'src');

const PATHS = {
  adminApiTs: path.join(WEB, 'config', 'adminApi.ts'),
  adminApiJs: path.join(WEB, 'config', 'adminApi.js'),
  adminSession: path.join(WEB, 'lib', 'adminSession.ts'),
  adminLib: path.join(WEB, 'lib', 'adminApi.ts'),
  loginPage: path.join(WEB, 'app', '(reelcutter)', 'admin', 'login', 'page.tsx'),
  loginForm: path.join(WEB, 'app', '(reelcutter)', 'admin', 'login', 'AdminLoginForm.tsx'),
  protectedLayout: path.join(WEB, 'app', '(reelcutter)', 'admin', '(protected)', 'layout.tsx'),
  adminGuard: path.join(WEB, 'app', '(reelcutter)', 'admin', '(protected)', 'AdminGuard.tsx'),
  dashboardPage: path.join(WEB, 'app', '(reelcutter)', 'admin', '(protected)', 'page.tsx'),
  dashboard: path.join(WEB, 'app', '(reelcutter)', 'admin', '(protected)', 'AdminDashboard.tsx'),
  paymentsPage: path.join(WEB, 'app', '(reelcutter)', 'admin', '(protected)', 'payments', 'page.tsx'),
  paymentsList: path.join(WEB, 'app', '(reelcutter)', 'admin', '(protected)', 'payments', 'PaymentsList.tsx'),
  detailPage: path.join(WEB, 'app', '(reelcutter)', 'admin', '(protected)', 'payments', '[id]', 'page.tsx'),
  detail: path.join(WEB, 'app', '(reelcutter)', 'admin', '(protected)', 'payments', '[id]', 'PaymentDetail.tsx'),
};

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

function readSafe(filePath) {
  try {
    return read(filePath);
  } catch {
    return '';
  }
}

/** Recursively collect source files under website/src (and website/.next for bundle scans). */
function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 20B — Admin Dashboard UI Tests');
console.log('═══════════════════════════════════════════════════════════════');

// ─── A. Admin Login UI ──────────────────────────────────────────────────────

section('A. Admin Login UI');

test('A1. /admin/login page exists', () => {
  assert.ok(fs.existsSync(PATHS.loginPage), 'admin login page must exist');
});

test('A2. Login page is noindex', () => {
  const src = read(PATHS.loginPage);
  assert.ok(
    /robots:\s*\{\s*index:\s*false|noindex/.test(src),
    'login page must set noindex'
  );
});

test('A3. Login form client component exists', () => {
  assert.ok(fs.existsSync(PATHS.loginForm), 'AdminLoginForm must exist');
});

test('A4. Login form posts username/password to STEP 19 login endpoint', () => {
  const src = read(PATHS.loginForm);
  assert.ok(src.includes('"use client"'), 'must be a client component');
  assert.ok(/ADMIN_API\.login/.test(src), 'must use ADMIN_API.login');
  assert.ok(/method:\s*["']POST["']/.test(src), 'must POST');
  assert.ok(/username/.test(src), 'must submit username');
  assert.ok(/password/.test(src), 'must submit password');
});

test('A5. Login form stores only token/session (never password)', () => {
  const src = read(PATHS.loginForm);
  assert.ok(/setAdminSession\(/.test(src), 'must persist session via setAdminSession');
  assert.ok(
    !/setAdminSession\([^)]*password/i.test(src),
    'password must never be passed into session storage'
  );
  assert.ok(
    !/localStorage/.test(src),
    'must not use localStorage for credentials'
  );
});

test('A6. Login form has loading and generic auth error states', () => {
  const src = read(PATHS.loginForm);
  assert.ok(/loading/.test(src), 'must track loading state');
  assert.ok(/Invalid username or password/.test(src), 'generic auth failure message');
});

test('A7. Login success redirects to /admin dashboard', () => {
  const src = read(PATHS.loginForm);
  assert.ok(/router\.replace\(["']\/admin["']\)/.test(src), 'must redirect to /admin');
});

test('A8. adminApi config (.ts + .js twin) exists', () => {
  assert.ok(fs.existsSync(PATHS.adminApiTs), 'adminApi.ts must exist');
  assert.ok(fs.existsSync(PATHS.adminApiJs), 'adminApi.js twin must exist');
});

test('A9. adminApi.js CJS twin exports endpoints and loads via require()', () => {
  const config = require('../website/src/config/adminApi');
  assert.ok(config.ADMIN_API, 'ADMIN_API must be exported');
  assert.ok(config.ADMIN_API.login.includes('/api/admin/login'), 'login endpoint');
  assert.ok(config.ADMIN_API.payments().includes('/api/admin/payments'), 'payments endpoint');
  assert.ok(
    config.ADMIN_API.payment('abc').includes('/api/admin/payments/abc'),
    'payment detail endpoint'
  );
  assert.ok(
    config.ADMIN_API.approve('abc').endsWith('/approve'),
    'approve endpoint'
  );
  assert.ok(
    config.ADMIN_API.reject('abc').endsWith('/reject'),
    'reject endpoint'
  );
});

test('A10. adminApi.js exposes list filters pending/approved/rejected', () => {
  const config = require('../website/src/config/adminApi');
  assert.deepStrictEqual(
    Array.from(config.ADMIN_LIST_FILTERS),
    ['pending', 'approved', 'rejected']
  );
});

// ─── B. Admin Login Success Flow ────────────────────────────────────────────

section('B. Admin Login Success Flow');

test('B1. Session is stored with token + expiry from expires_in', () => {
  const src = read(PATHS.loginForm);
  assert.ok(/setAdminSession\(/.test(src), 'must call setAdminSession');
  assert.ok(/expires_in/.test(src), 'must use server expires_in for expiry');
});

test('B2. adminSession.ts stores minimum session fields only', () => {
  const src = read(PATHS.adminSession);
  assert.ok(/token:\s*string/.test(src), 'session has token');
  assert.ok(/username:\s*string/.test(src), 'session has display username');
  assert.ok(/expiresAt:\s*number/.test(src), 'session has expiresAt');
  assert.ok(!/password\s*:/.test(src), 'session module must never define a password field');
  assert.ok(!/service_role/.test(src), 'no service role in session module');
});

test('B3. adminSession uses sessionStorage (not localStorage)', () => {
  const src = read(PATHS.adminSession);
  assert.ok(/sessionStorage/.test(src), 'must use sessionStorage');
  assert.ok(!/localStorage/.test(src), 'must not use localStorage');
});

test('B4. Expired sessions are rejected by getAdminSession', () => {
  const src = read(PATHS.adminSession);
  assert.ok(/Date\.now\(\)\s*>=\s*parsed\.expiresAt/.test(src), 'must compare expiry');
  assert.ok(/removeItem/.test(src), 'must clear expired session');
});

test('B5. Token is never parsed/decoded in the browser', () => {
  const session = read(PATHS.adminSession);
  const lib = read(PATHS.adminLib);
  assert.ok(!/atob|jwt|\.split\(["']\.["']\)/.test(session), 'adminSession must not decode tokens');
  assert.ok(!/atob|jwt|\.split\(["']\.["']\)/.test(lib), 'adminApi lib must not decode tokens');
});

// ─── C. Authentication Failure Handling ─────────────────────────────────────

section('C. Authentication Failure Handling');

test('C1. 401 on login shows generic auth failure (no account enumeration)', () => {
  const src = read(PATHS.loginForm);
  assert.ok(/res\.status === 401/.test(src), 'must handle 401');
  assert.ok(/Invalid username or password/.test(src), 'generic message required');
});

test('C2. 400 on login is treated as invalid credentials', () => {
  const src = read(PATHS.loginForm);
  assert.ok(/res\.status === 400/.test(src), 'must handle 400 as bad credentials');
});

test('C3. Login errors are never logged with credentials', () => {
  const src = read(PATHS.loginForm);
  assert.ok(!/console\.(log|error|warn)\([^)]*password/i.test(src), 'no password logging');
  assert.ok(!/console\.log\(/.test(src), 'no console.log at all in login form');
});

// ─── D. Protected Route Redirects ───────────────────────────────────────────

section('D. Protected Route Redirects');

test('D1. Protected layout wraps dashboard/list/detail in AdminGuard', () => {
  const src = read(PATHS.protectedLayout);
  assert.ok(/AdminGuard/.test(src), 'protected layout must render AdminGuard');
});

test('D2. AdminGuard redirects unauthenticated users to /admin/login', () => {
  const src = read(PATHS.adminGuard);
  assert.ok(/getAdminSession/.test(src), 'must check session');
  assert.ok(/router\.replace\(["']\/admin\/login["']\)/.test(src), 'must redirect to login');
});

test('D3. AdminGuard does not render children before session check', () => {
  const src = read(PATHS.adminGuard);
  assert.ok(/if \(!ready\)/.test(src), 'must gate rendering on ready');
  assert.ok(/Checking session/.test(src), 'must show intermediate state');
});

test('D4. Login page is outside the protected route group', () => {
  assert.ok(
    fs.existsSync(path.join(WEB, 'app', '(reelcutter)', 'admin', 'login', 'page.tsx')),
    'login must be at admin/login (outside (protected))'
  );
  assert.ok(
    !fs.existsSync(path.join(WEB, 'app', '(reelcutter)', 'admin', '(protected)', 'login')),
    'login must not be inside (protected)'
  );
});

// ─── E. Payment List Rendering ──────────────────────────────────────────────

section('E. Payment List Rendering');

test('E1. /admin/payments page exists and renders PaymentsList', () => {
  assert.ok(fs.existsSync(PATHS.paymentsPage), 'payments page must exist');
  const src = read(PATHS.paymentsPage);
  assert.ok(/PaymentsList/.test(src), 'must render PaymentsList');
});

test('E2. List fetches from STEP 19 GET /api/admin/payments with Bearer auth', () => {
  const src = read(PATHS.paymentsList);
  assert.ok(/adminFetch\(/.test(src), 'must use authenticated adminFetch');
  assert.ok(/ADMIN_API\.payments\(/.test(src), 'must use payments endpoint');
});

test('E3. List renders required columns', () => {
  const src = read(PATHS.paymentsList);
  for (const col of [
    'Customer',
    'Email',
    'Plan',
    'Method',
    'Amount',
    'Currency',
    'Transaction ID',
    'Status',
    'Submitted',
  ]) {
    assert.ok(src.includes(`>${col}<`), `missing column: ${col}`);
  }
});

test('E4. List has loading, empty, error, and refresh states', () => {
  const src = read(PATHS.paymentsList);
  assert.ok(/Loading payments/.test(src), 'loading state');
  assert.ok(/No \{filter\} payments found/.test(src), 'empty state');
  assert.ok(/role="alert"/.test(src), 'error state');
  assert.ok(/Refresh/.test(src), 'refresh control');
});

test('E5. Rows link to /admin/payments/[id]', () => {
  const src = read(PATHS.paymentsList);
  assert.ok(/\/admin\/payments\/\$\{p\.id\}/.test(src), 'rows must link to detail');
});

// ─── F. Status Filtering ────────────────────────────────────────────────────

section('F. Status Filtering');

test('F1. Filter tabs for pending/approved/rejected exist', () => {
  const src = read(PATHS.paymentsList);
  assert.ok(/ADMIN_LIST_FILTERS/.test(src), 'must use shared filter list');
  const config = require('../website/src/config/adminApi');
  assert.deepStrictEqual(
    Array.from(config.ADMIN_LIST_FILTERS),
    ['pending', 'approved', 'rejected']
  );
});

test('F2. Changing filter resets to page 1', () => {
  const src = read(PATHS.paymentsList);
  assert.ok(/setPage\(1\)/.test(src), 'filter change must reset pagination');
});

test('F3. Filter value is sent to the API via ?status=', () => {
  const config = require('../website/src/config/adminApi');
  const url = config.ADMIN_API.payments({ status: 'approved', page: 2, limit: 20 });
  assert.ok(url.includes('status=approved'), 'status must be in query');
  assert.ok(url.includes('page=2'), 'page must be in query');
  assert.ok(url.includes('limit=20'), 'limit must be in query');
});

// ─── G. Pagination ──────────────────────────────────────────────────────────

section('G. Pagination');

test('G1. Pagination uses server pagination.total_pages', () => {
  const src = read(PATHS.paymentsList);
  assert.ok(/total_pages/.test(src), 'must read total_pages from server');
  assert.ok(/Previous/.test(src) && /Next/.test(src), 'must have prev/next controls');
});

test('G2. Previous disabled on first page, Next disabled on last page', () => {
  const src = read(PATHS.paymentsList);
  assert.ok(/page <= 1/.test(src), 'disable Previous on first page');
  assert.ok(/page >= totalPages/.test(src), 'disable Next on last page');
});

// ─── H. Payment Details Rendering ───────────────────────────────────────────

section('H. Payment Details Rendering');

test('H1. Detail page exists and awaits Next.js params Promise', () => {
  const src = read(PATHS.detailPage);
  assert.ok(/params:\s*Promise<\{ id: string \}>/.test(src), 'must await params Promise');
  assert.ok(/await params/.test(src), 'must await params');
});

test('H2. Detail uses GET /api/admin/payments/:id via adminFetch', () => {
  const src = read(PATHS.detail);
  assert.ok(/adminFetch\(ADMIN_API\.payment\(paymentId\)\)/.test(src), 'must fetch detail endpoint');
});

test('H3. Detail renders all core fields', () => {
  const src = read(PATHS.detail);
  for (const field of [
    'Customer name',
    'Customer email',
    'WhatsApp',
    'Plan',
    'Payment method',
    'Amount',
    'Transaction ID',
    'Submitted',
    'Reviewed at',
    'License ID',
    'Rejection reason',
    'Admin note',
  ]) {
    assert.ok(src.includes(field), `missing field label: ${field}`);
  }
});

// ─── I. Proof Preview ───────────────────────────────────────────────────────

section('I. Proof Preview');

test('I1. Proof preview renders signed_url in an <img>', () => {
  const src = read(PATHS.detail);
  assert.ok(/signed_url/.test(src), 'must use signed_url from server');
  assert.ok(/<img[\s\S]*signedUrl/.test(src), 'must render img with signed url');
});

test('I2. Signed URL is never persisted to storage', () => {
  const detail = read(PATHS.detail);
  const session = read(PATHS.adminSession);
  assert.ok(!/localStorage/.test(detail), 'detail must not use localStorage');
  assert.ok(!/sessionStorage/.test(detail), 'detail must not persist signed URL');
  assert.ok(!/signed_url/.test(session), 'session module must not store signed URLs');
});

test('I3. Proof reference shown when image unavailable', () => {
  const src = read(PATHS.detail);
  assert.ok(/proofBroken/.test(src), 'must handle broken/expired image');
  assert.ok(/Reference:/.test(src), 'must show reference fallback');
});

// ─── J. Expired Proof URL Refresh ───────────────────────────────────────────

section('J. Expired Proof URL Refresh');

test('J1. Refresh proof button re-fetches detail for a new signed URL', () => {
  const src = read(PATHS.detail);
  assert.ok(/Refresh proof link/.test(src), 'must offer refresh button');
  assert.ok(/onClick=\{\(\) => \{[\s\S]*load\(false\)/.test(src), 'refresh must re-fetch detail');
});

test('J2. Image onError marks proof broken and offers refresh', () => {
  const src = read(PATHS.detail);
  assert.ok(/onError=\{\(\) => setProofBroken\(true\)\}/.test(src), 'must handle img onError');
  assert.ok(/expires in/.test(src), 'must surface expiry info');
});

// ─── K. Approve Confirmation ────────────────────────────────────────────────

section('K. Approve Confirmation');

test('K1. Approve requires an explicit confirmation step', () => {
  const src = read(PATHS.detail);
  assert.ok(/confirmAction/.test(src), 'must track confirmation state');
  assert.ok(/setConfirmAction\(["']approve["']\)/.test(src), 'opens approve confirmation');
  assert.ok(/Confirm approval/.test(src), 'must show confirm button');
  assert.ok(/Cancel/.test(src), 'must allow cancel');
});

test('K2. Confirmation warns that a license will be created/emailed', () => {
  const src = read(PATHS.detail);
  assert.ok(/license will be created/.test(src), 'must warn about license creation');
  assert.ok(/emailed/i.test(src), 'must warn about customer email');
});

test('K3. Approve actions disabled while payment is not pending', () => {
  const src = read(PATHS.detail);
  assert.ok(/isPending/.test(src), 'must gate actions on pending status');
  assert.ok(/review actions are disabled/.test(src), 'must show disabled state');
});

// ─── L. Approve API Integration ─────────────────────────────────────────────

section('L. Approve API Integration');

test('L1. Approve POSTs to STEP 19 approve endpoint with Bearer auth', () => {
  const src = read(PATHS.detail);
  assert.ok(/adminFetch\(ADMIN_API\.approve\(paymentId\)/.test(src), 'must call approve endpoint');
  assert.ok(/method:\s*["']POST["']/.test(src), 'must POST');
});

test('L2. Approve body contains only optional admin_note', () => {
  const src = read(PATHS.detail);
  assert.ok(/admin_note/.test(src), 'may include optional admin_note');
  const approveBlock = src.slice(
    src.indexOf('async function handleApprove'),
    src.indexOf('async function handleReject')
  );
  assert.ok(!/reviewed_by/.test(approveBlock), 'approve body must not include reviewed_by');
  assert.ok(!/license_id/.test(approveBlock), 'approve body must not include license_id');
  assert.ok(!/["']status["']/.test(approveBlock), 'approve body must not include status');
});

test('L3. Approve result surfaces license ID and email delivery status', () => {
  const src = read(PATHS.detail);
  assert.ok(/license/i.test(src), 'must surface license result');
  assert.ok(/Customer email:/.test(src), 'must show email delivery result');
  assert.ok(/already approved/i.test(src), 'must handle already_approved');
});

test('L4. Controls disabled during submit', () => {
  const src = read(PATHS.detail);
  assert.ok(/disabled=\{submitting\}/.test(src), 'must disable during submission');
});

// ─── M. Reject Confirmation ─────────────────────────────────────────────────

section('M. Reject Confirmation');

test('M1. Reject requires an explicit confirmation step', () => {
  const src = read(PATHS.detail);
  assert.ok(/setConfirmAction\(["']reject["']\)/.test(src), 'opens reject confirmation');
  assert.ok(/Confirm rejection/.test(src), 'must show confirm button');
});

test('M2. Reject form includes reason and optional admin note fields', () => {
  const src = read(PATHS.detail);
  assert.ok(/reject-reason/.test(src), 'reason field id');
  assert.ok(/reject-note/.test(src), 'admin note field id');
  assert.ok(/maxLength=\{1000\}/.test(src), 'client caps reason at 1000 chars');
});

// ─── N. Rejection Reason Required ───────────────────────────────────────────

section('N. Rejection Reason Required');

test('N1. Confirm rejection disabled until reason is non-empty', () => {
  const src = read(PATHS.detail);
  assert.ok(
    /disabled=\{submitting \|\| !rejectReason\.trim\(\)\}/.test(src),
    'confirm must be disabled without a reason'
  );
});

test('N2. handleReject validates reason before calling API', () => {
  const src = read(PATHS.detail);
  assert.ok(
    /rejection reason is required/.test(src),
    'must validate reason client-side'
  );
  const rejectBlock = src.slice(src.indexOf('async function handleReject'));
  assert.ok(
    /if \(!rejectReason\.trim\(\)\)/.test(rejectBlock),
    'must early-return without reason'
  );
});

// ─── O. Reject API Integration ──────────────────────────────────────────────

section('O. Reject API Integration');

test('O1. Reject POSTs to STEP 19 reject endpoint with reason', () => {
  const src = read(PATHS.detail);
  assert.ok(/adminFetch\(ADMIN_API\.reject\(paymentId\)/.test(src), 'must call reject endpoint');
  assert.ok(/reason:\s*rejectReason\.trim\(\)/.test(src), 'must send reason');
});

test('O2. Reject result shows rejection outcome and already_rejected handling', () => {
  const src = read(PATHS.detail);
  assert.ok(/already_rejected/.test(src), 'must handle already_rejected');
  assert.ok(/Payment rejected/.test(src), 'must show rejection success');
});

test('O3. Reject body does not include reviewed_by/license_id/status', () => {
  const src = read(PATHS.detail);
  // Extract every request-body construction (const body = {...};) and
  // assert none carry privileged fields. Rendered field labels (e.g.
  // "Reviewed by") outside the request bodies do not count.
  const bodyMatches = src.match(/const body[^;]+;/g) || [];
  assert.ok(bodyMatches.length >= 2, 'expected approve and reject body constructions');
  for (const block of bodyMatches) {
    assert.ok(!/reviewed_by/.test(block), 'request body must not include reviewed_by');
    assert.ok(!/license_id/.test(block), 'request body must not include license_id');
    assert.ok(!/["']status["']\s*:/.test(block), 'request body must not include status');
  }
  const rejectBody = bodyMatches.find((b) => /reason/.test(b));
  assert.ok(rejectBody, 'reject body must include reason');
});

// ─── P. 401 Handling ────────────────────────────────────────────────────────

section('P. 401 Handling');

test('P1. adminFetch clears session and redirects on 401', () => {
  const src = read(PATHS.adminLib);
  assert.ok(/res\.status === 401 \|\| res\.status === 403/.test(src), 'must catch 401/403');
  assert.ok(/redirectToAdminLogin\(\)/.test(src), 'must redirect to login');
  assert.ok(/clearAdminSession\(\)/.test(src), 'must clear session');
});

// ─── Q. 403 Handling ────────────────────────────────────────────────────────

section('Q. 403 Handling');

test('Q1. 403 is treated as unauthorized (clear + redirect)', () => {
  const src = read(PATHS.adminLib);
  assert.ok(/401 \|\| res\.status === 403/.test(src), '403 handled with 401');
  const describe = src.slice(src.indexOf('export function describeAdminError'));
  assert.ok(/err\.status === 401 \|\| err\.status === 403/.test(describe), 'error message maps 401/403');
});

// ─── R. 429 Handling ────────────────────────────────────────────────────────

section('R. 429 Handling');

test('R1. 429 maps to a rate-limit user message', () => {
  const src = read(PATHS.adminLib);
  assert.ok(/err\.status === 429/.test(src), 'must handle 429');
  assert.ok(/Too many requests/.test(src), 'rate-limit message');
});

test('R2. Login form handles 429 with a wait message', () => {
  const src = read(PATHS.loginForm);
  assert.ok(/res\.status === 429/.test(src), 'login must handle 429');
  assert.ok(/wait a moment/i.test(src), 'rate-limit message on login');
});

// ─── S. 409 Handling ────────────────────────────────────────────────────────

section('S. 409 Handling');

test('S1. 409 maps to state-conflict message via describeAdminError', () => {
  const src = read(PATHS.adminLib);
  assert.ok(/err\.status === 409/.test(src), 'must handle 409');
  assert.ok(/state changed/.test(src), 'conflict message');
});

test('S2. isConflictError helper exists and is used to refresh on conflict', () => {
  const lib = read(PATHS.adminLib);
  const detail = read(PATHS.detail);
  assert.ok(/export function isConflictError/.test(lib), 'helper must exist');
  assert.ok(/isConflictError\(err\)/.test(detail), 'detail must use it');
  assert.ok(/if \(isConflictError\(err\)\)/.test(detail), 'must branch on conflict');
});

// ─── T. Logout ──────────────────────────────────────────────────────────────

section('T. Logout');

test('T1. AdminGuard provides a Logout control', () => {
  const src = read(PATHS.adminGuard);
  assert.ok(/Logout/.test(src), 'must show logout button');
  assert.ok(/handleLogout/.test(src), 'must handle logout');
});

test('T2. Logout clears session and redirects to login', () => {
  const src = read(PATHS.adminGuard);
  assert.ok(/clearAdminSession\(\)/.test(src), 'must clear session');
  assert.ok(/router\.replace\(["']\/admin\/login["']\)/.test(src), 'must redirect to login');
});

test('T3. Nav includes Dashboard and Payments links', () => {
  const src = read(PATHS.adminGuard);
  assert.ok(/\/admin["']/.test(src), 'dashboard link');
  assert.ok(/\/admin\/payments["']/.test(src), 'payments link');
});

// ─── U. No Admin Secrets in Client Bundle ───────────────────────────────────

section('U. No Admin Secrets in Client Bundle');

test('U1. No admin credential hash / session HMAC material references in website/src', () => {
  const files = walk(path.join(WEB), ['.ts', '.tsx', '.js', '.jsx']);
  for (const file of files) {
    const src = read(file);
    assert.ok(
      !/ADMIN_PASSWORD_HASH|ADMIN_SESSION_SECRET/.test(src),
      `secret reference found in ${path.relative(ROOT, file)}`
    );
  }
});

test('U2. adminApi config contains no credentials or tokens', () => {
  const ts = read(PATHS.adminApiTs);
  const js = read(PATHS.adminApiJs);
  for (const [name, src] of [['adminApi.ts', ts], ['adminApi.js', js]]) {
    assert.ok(!/password\s*[:=]/i.test(src), `${name} must not embed a password`);
    assert.ok(!/sk_live|sk_test|whsec_|service_role/i.test(src), `${name} must not embed provider keys`);
    assert.ok(!/token\s*[:=]\s*["'][A-Za-z0-9]/.test(src), `${name} must not embed a literal token`);
  }
});

test('U3. Session module stores no credentials beyond opaque token + username', () => {
  const src = read(PATHS.adminSession);
  assert.ok(!/ADMIN_PASSWORD/.test(src), 'no password hash');
  assert.ok(!/service_role/.test(src), 'no service role');
});

// ─── V. No Service-Role Key in Client Bundle ────────────────────────────────

section('V. No Service-Role Key in Client Bundle');

test('V1. No service_role / SUPABASE_SERVICE references in website/src', () => {
  const files = walk(path.join(WEB), ['.ts', '.tsx', '.js', '.jsx']);
  for (const file of files) {
    const src = read(file);
    assert.ok(
      !/service_role|SUPABASE_SERVICE_ROLE|SUPABASE_SERVICE_KEY/.test(src),
      `service-role reference found in ${path.relative(ROOT, file)}`
    );
  }
});

// ─── W. No Client-Side License Creation ─────────────────────────────────────

section('W. No Client-Side License Creation');

test('W1. Admin UI never calls createLicense or license-creation APIs', () => {
  const adminFiles = walk(path.join(WEB, 'app', '(reelcutter)', 'admin'), ['.ts', '.tsx']);
  assert.ok(adminFiles.length > 0, 'admin app files must exist');
  for (const file of adminFiles) {
    const src = read(file);
    assert.ok(
      !/createLicense|\/api\/licenses|generateLicense/i.test(src),
      `client-side license creation found in ${path.relative(ROOT, file)}`
    );
  }
});

test('W2. Approve success message states the server created the license', () => {
  const src = read(PATHS.detail);
  assert.ok(/Payment approved successfully/.test(src), 'success message present');
  assert.ok(/No license was created/.test(src), 'handles null license result');
});

// ─── X. No Client-Controlled Reviewer/Status Fields ─────────────────────────

section('X. No Client-Controlled Reviewer/Status Fields');

test('X1. Approve/reject request bodies exclude reviewed_by, license_id, status', () => {
  const src = read(PATHS.detail);
  const bodyMatches = src.match(/const body[^;]+;/g) || [];
  assert.ok(bodyMatches.length >= 2, 'expected approve and reject body constructions');
  for (const block of bodyMatches) {
    assert.ok(!/reviewed_by/.test(block), 'request body must not send reviewed_by');
    assert.ok(!/license_id/.test(block), 'request body must not send license_id');
    assert.ok(!/["']status["']\s*:/.test(block), 'request body must not send status');
  }
});

test('X2. adminFetch does not inject privileged headers', () => {
  const src = read(PATHS.adminLib);
  assert.ok(/Authorization:\s*`Bearer \$\{session\.token\}`/.test(src), 'only Bearer auth header');
  assert.ok(!/api-key|x-admin|service/i.test(src), 'no privileged headers');
});

test('X3. No client-side status mutation endpoints called from UI', () => {
  const adminFiles = walk(path.join(WEB, 'app', '(reelcutter)', 'admin'), ['.ts', '.tsx']);
  for (const file of adminFiles) {
    const src = read(file);
    assert.ok(
      !/\/api\/payments\/[^"']*\/status|PUT.*payments/i.test(src),
      `status mutation found in ${path.relative(ROOT, file)}`
    );
  }
});

// ─── Summary ────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`STEP 20B — Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
