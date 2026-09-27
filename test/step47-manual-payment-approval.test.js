'use strict';

/**
 * STEP 47 — Manual Payment Approval: remote license persistence + consistency
 *
 * Production defect: POST /api/admin/payments/:id/approve answered 500
 * ("A server error occurred") and the payment stayed pending.
 *
 * Verified root cause (repo evidence):
 *   production public.licenses.plan_interval is NOT NULL (PostgREST OpenAPI
 *   `required` = attnotnull, proven against the local stack in this step;
 *   STEP_24_PRODUCTION_SCHEMA_AUDIT.md:67 records YES for production), while
 *   licenseGenerator.createLicense() inserts `plan_interval: null` for manual
 *   approvals. The remote INSERT fails with 23502, createLicense() silently
 *   falls back to its in-memory registry, and paymentReviewService then writes
 *   the never-persisted license id into manual_payments.license_id → FK
 *   violation (manual_payments_license_id_fkey, migration 20260926 line 47) →
 *   HTTP 500 INTERNAL_ERROR.
 *
 * Tests:
 *   A. Manual approval happy path (offline in-memory path)
 *   B. Remote license INSERT payload + 23502 reproduction
 *   C. Remote INSERT failure fails closed (no approval/audit/email/fake license)
 *   D. Payment UPDATE failure cleans up the newly created license
 *   E. Idempotency + rejected-payment protection
 *   F. Stripe license behavior unchanged
 *   G. Source invariants (sanitization + approval wiring)
 */

process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';

const path = require('path');
const assert = require('assert');

const serverDir = path.join(__dirname, '..', 'server');
const servicesDir = path.join(serverDir, 'services');

const emailService = require(path.join(servicesDir, 'emailService'));
const auditLogService = require(path.join(servicesDir, 'auditLog'));
const licenseGenerator = require(path.join(servicesDir, 'licenseGenerator'));

// Spies must be installed before paymentReviewService loads because it
// destructures these bindings at module load.
const originalDeliverLicenseEmail = emailService.deliverLicenseEmail;
const originalWriteAuditLog = auditLogService.writeAuditLog;
const spies = { emailCalls: 0, auditEntries: [] };

emailService.deliverLicenseEmail = async function spyDeliver(...args) {
  spies.emailCalls += 1;
  return originalDeliverLicenseEmail.apply(emailService, args);
};
auditLogService.writeAuditLog = async function spyAudit(params) {
  spies.auditEntries.push(params);
  return originalWriteAuditLog.call(auditLogService, params);
};

const paymentReviewService = require(path.join(servicesDir, 'paymentReviewService'));

const fs = require('fs');
const paymentReviewSrc = fs.readFileSync(path.join(servicesDir, 'paymentReviewService.js'), 'utf8');
const licenseGeneratorSrc = fs.readFileSync(path.join(servicesDir, 'licenseGenerator.js'), 'utf8');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ FAIL: ${name}`);
    console.log(`    ${err.message}`);
  }
}

function resetState() {
  paymentReviewService.clearInMemoryPayments();
  licenseGenerator.clearInMemoryLicenses();
  auditLogService.clearInMemoryAuditLog();
  emailService.clearSentEmails();
  paymentReviewService.resetSupabaseClientForTests();
  licenseGenerator.resetSupabaseClientForTests();
  spies.emailCalls = 0;
  spies.auditEntries.length = 0;
}

function makePendingPayment(overrides = {}) {
  return paymentReviewService.seedInMemoryPayment({
    customer_name: 'Step47 Customer',
    customer_email: 'buyer47@example.com',
    plan_id: 'basic',
    payment_method: 'bkash',
    amount: 1000,
    currency: 'BDT',
    transaction_id: 'TEST-STEP47-001',
    status: 'pending',
    ...overrides,
  });
}

function countAudit(action, targetId) {
  return auditLogService.getInMemoryAuditLog()
    .filter((e) => e.action === action && (!targetId || e.target_id === targetId)).length;
}

const PLAN_INTERVAL_NOT_NULL_ERROR = {
  code: '23502',
  message: 'null value in column "plan_interval" of relation "licenses" violates not-null constraint',
  details: 'Failing row contains (null).',
  hint: null,
};

const PERMISSION_DENIED_ERROR = {
  code: '42501',
  message: 'permission denied for table licenses',
  details: null,
  hint: null,
};

const FK_VIOLATION_ERROR = {
  code: '23503',
  message: 'insert or update on table "manual_payments" violates foreign key constraint "manual_payments_license_id_fkey"',
  details: null,
  hint: null,
};

/**
 * Minimal PostgREST-shaped fake for public.licenses.
 * insertError: object or (record) => object|null to simulate DB errors,
 * including production's plan_interval NOT NULL constraint.
 */
function createFakeLicenseClient({ insertError } = {}) {
  const state = { inserts: [], updates: [], deletes: [] };
  return {
    state,
    from(table) {
      assert.strictEqual(table, 'licenses', 'license client only exposes licenses');
      let op = null;
      let record = null;
      const filters = [];
      const builder = {
        insert(rows) {
          op = 'insert';
          record = Array.isArray(rows) ? rows[0] : rows;
          return builder;
        },
        update(values) {
          op = 'update';
          record = values;
          return builder;
        },
        delete() {
          op = 'delete';
          return builder;
        },
        select() {
          if (op === null) op = 'select';
          return builder;
        },
        or() {
          return builder;
        },
        eq(column, value) {
          filters.push({ column, value });
          return builder;
        },
        async single() {
          if (op === 'insert') {
            state.inserts.push(record);
            const error = typeof insertError === 'function' ? insertError(record) : insertError;
            if (error) return { data: null, error };
            return { data: { ...record }, error: null };
          }
          if (op === 'update') {
            state.updates.push({ values: record, filters: [...filters] });
            const last = state.inserts[state.inserts.length - 1];
            const merged = { ...(last || {}), ...record };
            if (last) Object.assign(last, record);
            return { data: merged, error: null };
          }
          const last = state.inserts[state.inserts.length - 1];
          if (last) return { data: { ...last }, error: null };
          return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, 0 rows returned' } };
        },
        then(onFulfilled, onRejected) {
          if (op === 'delete') {
            state.deletes.push([...filters]);
            return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
          }
          return Promise.reject(new Error(`Unsupported awaitable licenses op: ${op}`)).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

/**
 * Minimal PostgREST-shaped fake for public.manual_payments.
 */
function createFakePaymentsClient({ row, updateError = null, updateRows, rowAfterUpdate } = {}) {
  const state = { updates: [] };
  return {
    state,
    from(table) {
      assert.strictEqual(table, 'manual_payments', 'payments client only exposes manual_payments');
      let op = null;
      let payload = null;
      const filters = [];
      const builder = {
        update(values) {
          op = 'update';
          payload = values;
          return builder;
        },
        select() {
          if (op === null) op = 'select';
          return builder;
        },
        eq(column, value) {
          filters.push({ column, value });
          return builder;
        },
        async maybeSingle() {
          assert.strictEqual(op, 'select');
          return { data: row ? { ...row } : null, error: null };
        },
        then(onFulfilled, onRejected) {
          if (op !== 'update') {
            return Promise.reject(new Error(`Unsupported awaitable manual_payments op: ${op}`)).then(onFulfilled, onRejected);
          }
          state.updates.push({ values: payload, filters: [...filters] });
          if (updateError) {
            return Promise.resolve({ data: null, error: updateError }).then(onFulfilled, onRejected);
          }
          if (rowAfterUpdate && row) Object.assign(row, rowAfterUpdate);
          const rows = updateRows !== undefined ? updateRows : [{ ...(row || {}), ...payload }];
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

async function runSuite() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 47 — Manual Payment Approval: remote license persistence');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // A. Manual approval happy path (offline in-memory path)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('── A. Manual approval happy path ──');

  await test('A1. Manual basic approval creates a real license (req 1-4)', async () => {
    resetState();
    const paymentId = makePendingPayment();

    const result = await paymentReviewService.approvePayment(paymentId, {
      adminId: 'step47-admin',
      adminNote: 'STEP47 approval',
    });

    assert.ok(result.ok, `expected success, got ${result.code}: ${result.message}`);
    assert.strictEqual(result.code, 'APPROVED');
    assert.strictEqual(result.payment.status, 'approved');
    assert.ok(result.license && result.license.id, 'license must be linked');

    const licenses = licenseGenerator.getInMemoryLicenses();
    assert.strictEqual(licenses.length, 1, 'exactly one license created');
    const lic = licenses[0];
    assert.strictEqual(lic.tier, 'basic', 'tier preserved');
    assert.strictEqual(lic.payment_provider, 'manual', 'payment_provider = manual (req 3)');
    assert.strictEqual(lic.status, 'active', 'license active (req 4)');
    assert.strictEqual(lic.plan_interval, 'month', 'plan_interval non-null (req 2)');
    assert.strictEqual(lic.customer_email, 'buyer47@example.com', 'customer_email preserved');
    assert.strictEqual(lic.transaction_id, 'TEST-STEP47-001', 'transaction_id preserved');

    const stored = paymentReviewService.getInMemoryPayment(paymentId);
    assert.strictEqual(stored.status, 'approved');
    assert.strictEqual(stored.license_id, lic.id);

    assert.strictEqual(countAudit('payment_approved', paymentId), 1, 'one approval audit');
    assert.strictEqual(spies.emailCalls, 1, 'one delivery attempt');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // B. Remote license INSERT payload + 23502 reproduction
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── B. Remote INSERT payload + production 23502 reproduction ──');

  await test('B1. Approval INSERT payload satisfies production NOT NULL (req 1-4)', async () => {
    resetState();
    const paymentId = makePendingPayment();
    const licenseClient = createFakeLicenseClient();
    licenseGenerator.setSupabaseClientForTests(licenseClient);

    const result = await paymentReviewService.approvePayment(paymentId, {
      adminId: 'step47-admin',
    });

    assert.ok(result.ok, `expected success, got ${result.code}`);
    assert.strictEqual(licenseClient.state.inserts.length, 1, 'remote INSERT issued once');
    const record = licenseClient.state.inserts[0];
    assert.strictEqual(record.tier, 'basic');
    assert.strictEqual(record.payment_provider, 'manual');
    assert.strictEqual(record.status, 'active');
    assert.strictEqual(record.plan_interval, 'month', 'plan_interval non-null (req 2)');
    assert.strictEqual(record.customer_email, 'buyer47@example.com');
    assert.strictEqual(record.transaction_id, 'TEST-STEP47-001');
    assert.strictEqual(result.payment.status, 'approved');
  });

  await test('B2. Reproduces production 23502 when plan_interval is null (root cause)', async () => {
    resetState();
    const licenseClient = createFakeLicenseClient({
      insertError: (record) => (record.plan_interval == null ? PLAN_INTERVAL_NOT_NULL_ERROR : null),
    });
    licenseGenerator.setSupabaseClientForTests(licenseClient);

    let error = null;
    try {
      await licenseGenerator.createLicense({
        tier: 'basic',
        customerEmail: 'buyer47@example.com',
        transactionId: 'TEST-STEP47-001',
        paymentProvider: 'manual',
        requireRemote: true,
      });
    } catch (err) {
      error = err;
    }

    assert.ok(error, 'pre-fix payload (plan_interval null) must fail against production NOT NULL');
    assert.strictEqual(error.code, '23502');
    assert.ok(licenseGenerator.getInMemoryLicenses().length === 0, 'requireRemote must not fall back in-memory');
  });

  await test('B3. plan_interval: month passes the production NOT NULL constraint', async () => {
    resetState();
    const licenseClient = createFakeLicenseClient({
      insertError: (record) => (record.plan_interval == null ? PLAN_INTERVAL_NOT_NULL_ERROR : null),
    });
    licenseGenerator.setSupabaseClientForTests(licenseClient);

    const license = await licenseGenerator.createLicense({
      tier: 'basic',
      customerEmail: 'buyer47@example.com',
      transactionId: 'TEST-STEP47-001',
      paymentProvider: 'manual',
      planInterval: 'month',
      requireRemote: true,
    });

    assert.ok(license && license.id);
    assert.strictEqual(licenseClient.state.inserts.length, 1);
    assert.strictEqual(licenseClient.state.inserts[0].plan_interval, 'month');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // C. Remote INSERT failure fails closed
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── C. Remote INSERT failure fails closed ──');

  await test('C1. INSERT failure: no approval, no audit, no email, no fake license (req 5-7)', async () => {
    resetState();
    const paymentId = makePendingPayment();
    const licenseClient = createFakeLicenseClient({ insertError: PERMISSION_DENIED_ERROR });
    licenseGenerator.setSupabaseClientForTests(licenseClient);

    const result = await paymentReviewService.approvePayment(paymentId, {
      adminId: 'step47-admin',
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'LICENSE_CREATION_FAILED');
    assert.strictEqual(result.httpStatus, 500);

    const stored = paymentReviewService.getInMemoryPayment(paymentId);
    assert.strictEqual(stored.status, 'pending', 'payment must remain pending');
    assert.strictEqual(stored.license_id, null, 'no license linked');

    assert.strictEqual(countAudit('payment_approved', paymentId), 0, 'no payment_approved audit (req 6)');
    assert.strictEqual(spies.emailCalls, 0, 'no email sent (req 7)');
    assert.strictEqual(licenseGenerator.getInMemoryLicenses().length, 0, 'no fake in-memory license (req B)');
  });

  await test('C2. Failure response never leaks raw DB errors (req E)', async () => {
    resetState();
    const paymentId = makePendingPayment();
    licenseGenerator.setSupabaseClientForTests(createFakeLicenseClient({ insertError: PERMISSION_DENIED_ERROR }));

    const result = await paymentReviewService.approvePayment(paymentId, { adminId: 'step47-admin' });

    assert.strictEqual(result.ok, false);
    const blob = JSON.stringify(result);
    for (const needle of ['42501', 'permission denied', '23502', 'violates', 'service_role', 'supabase']) {
      assert.ok(!blob.includes(needle), `response must not contain "${needle}"`);
    }
    assert.strictEqual(result.message, 'Failed to create the license. Payment was not approved.');
  });

  await test('C3. Default (no requireRemote) keeps in-memory fallback for tests/Stripe (req B)', async () => {
    resetState();
    licenseGenerator.setSupabaseClientForTests(createFakeLicenseClient({ insertError: PERMISSION_DENIED_ERROR }));

    const license = await licenseGenerator.createLicense({
      tier: 'standard',
      customerEmail: 'fallback@example.com',
      paymentProvider: 'stripe',
    });

    assert.ok(license && license.id, 'fallback license returned when requireRemote is not set');
    assert.strictEqual(licenseGenerator.getInMemoryLicenses().length, 1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // D. Payment UPDATE failure cleans up the newly created license
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── D. Payment UPDATE failure cleanup ──');

  await test('D1. UPDATE failure deletes the new license, payment stays pending (req C)', async () => {
    resetState();
    const paymentId = makePendingPayment();
    const row = { id: paymentId, status: 'pending', plan_id: 'basic', customer_email: 'buyer47@example.com' };
    const paymentsClient = createFakePaymentsClient({ row, updateError: FK_VIOLATION_ERROR });
    const licenseClient = createFakeLicenseClient();
    paymentReviewService.setSupabaseClientForTests(paymentsClient);
    licenseGenerator.setSupabaseClientForTests(licenseClient);

    const result = await paymentReviewService.approvePayment(paymentId, { adminId: 'step47-admin' });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INTERNAL_ERROR');
    assert.strictEqual(row.status, 'pending', 'payment must not become approved');

    assert.strictEqual(licenseClient.state.inserts.length, 1, 'license was created before the failure');
    const createdId = licenseClient.state.inserts[0].id;
    assert.strictEqual(licenseClient.state.deletes.length, 1, 'new license cleaned up');
    assert.deepStrictEqual(licenseClient.state.deletes[0], [{ column: 'id', value: createdId }]);

    assert.strictEqual(countAudit('payment_approved', paymentId), 0, 'no approval audit');
    assert.strictEqual(spies.emailCalls, 0, 'no email');
  });

  await test('D2. Lost race: orphan license cleaned up, no duplicate side effects', async () => {
    resetState();
    const paymentId = makePendingPayment();
    const row = { id: paymentId, status: 'pending', plan_id: 'basic', customer_email: 'buyer47@example.com' };
    const paymentsClient = createFakePaymentsClient({
      row,
      updateRows: [],
      rowAfterUpdate: { status: 'approved', license_id: 'existing-license-id' },
    });
    const licenseClient = createFakeLicenseClient();
    paymentReviewService.setSupabaseClientForTests(paymentsClient);
    licenseGenerator.setSupabaseClientForTests(licenseClient);

    const result = await paymentReviewService.approvePayment(paymentId, { adminId: 'step47-admin' });

    assert.ok(result.ok, `expected idempotent success, got ${result.code}`);
    assert.strictEqual(result.code, 'ALREADY_APPROVED');
    assert.strictEqual(licenseClient.state.inserts.length, 1);
    assert.strictEqual(licenseClient.state.deletes.length, 1, 'lost racer orphan license removed');
    assert.strictEqual(countAudit('payment_approved', paymentId), 0, 'no duplicate audit');
    assert.strictEqual(spies.emailCalls, 0, 'no duplicate email');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // E. Idempotency + rejected-payment protection
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── E. Idempotency + rejected protection ──');

  await test('E1. Approved payment → no second license/audit/email (req 9)', async () => {
    resetState();
    const paymentId = makePendingPayment({ status: 'approved', license_id: '11111111-2222-4333-8444-555555555555' });
    const licenseClient = createFakeLicenseClient();
    licenseGenerator.setSupabaseClientForTests(licenseClient);

    const result = await paymentReviewService.approvePayment(paymentId, { adminId: 'step47-admin' });

    assert.ok(result.ok);
    assert.strictEqual(result.code, 'ALREADY_APPROVED');
    assert.strictEqual(licenseClient.state.inserts.length, 0, 'no license INSERT');
    assert.strictEqual(licenseGenerator.getInMemoryLicenses().length, 0);
    assert.strictEqual(countAudit('payment_approved', paymentId), 0);
    assert.strictEqual(spies.emailCalls, 0);
  });

  await test('E2. Rejected payment → 409, cannot approve (req 10)', async () => {
    resetState();
    const paymentId = makePendingPayment({ status: 'rejected' });
    const licenseClient = createFakeLicenseClient();
    licenseGenerator.setSupabaseClientForTests(licenseClient);

    const result = await paymentReviewService.approvePayment(paymentId, { adminId: 'step47-admin' });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_STATUS');
    assert.strictEqual(result.httpStatus, 409);
    assert.strictEqual(licenseClient.state.inserts.length, 0, 'no license INSERT');
    assert.strictEqual(countAudit('payment_approved', paymentId), 0);
    assert.strictEqual(spies.emailCalls, 0);
    assert.strictEqual(paymentReviewService.getInMemoryPayment(paymentId).status, 'rejected');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // F. Stripe license behavior unchanged
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── F. Stripe behavior unchanged ──');

  await test('F1. Stripe license INSERT unchanged (req 11)', async () => {
    resetState();
    const licenseClient = createFakeLicenseClient();
    licenseGenerator.setSupabaseClientForTests(licenseClient);

    const license = await licenseGenerator.createLicense({
      tier: 'standard',
      customerEmail: 'stripe@example.com',
      transactionId: 'txn_stripe_1',
      paymentProvider: 'stripe',
      stripeSubscriptionId: 'sub_test_1',
      stripeCustomerId: 'cus_test_1',
      subscriptionStatus: 'active',
      planInterval: 'month',
      requireRemote: true,
    });

    assert.ok(license && license.id);
    const record = licenseClient.state.inserts[0];
    assert.strictEqual(record.payment_provider, 'stripe');
    assert.strictEqual(record.plan_interval, 'month');
    assert.strictEqual(record.stripe_subscription_id, 'sub_test_1');
    assert.strictEqual(record.subscription_status, 'active');
    assert.strictEqual(license.planInterval, 'month');
  });

  await test('F2. Stripe default path still uses fallback instead of throwing (req 11)', async () => {
    resetState();
    licenseGenerator.setSupabaseClientForTests(createFakeLicenseClient({ insertError: PERMISSION_DENIED_ERROR }));

    const license = await licenseGenerator.createLicense({
      tier: 'pro',
      customerEmail: 'stripe2@example.com',
      paymentProvider: 'stripe',
      stripeSubscriptionId: 'sub_test_2',
      planInterval: 'month',
    });

    assert.ok(license && license.id, 'webhook path must not start throwing');
    assert.strictEqual(license.paymentProvider, 'stripe');
    assert.strictEqual(licenseGenerator.getInMemoryLicenses().length, 1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // G. Source invariants
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── G. Source invariants ──');

  await test('G1. Approval passes plan_interval + requireRemote', () => {
    assert.ok(paymentReviewSrc.includes("planInterval: 'month'"), 'manual approval sets plan_interval');
    assert.ok(paymentReviewSrc.includes('requireRemote: true'), 'manual approval cannot use in-memory fallback');
    assert.ok(licenseGeneratorSrc.includes('if (requireRemote)'), 'requireRemote guard exists');
    assert.ok(paymentReviewSrc.includes('sanitizeErrorMessage(err)'), 'errors still sanitized');
  });

  await test('G2. No service-role material in this suite output', () => {
    const blob = JSON.stringify(spies.auditEntries);
    for (const needle of ['service_role', 'SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_', 'Bearer ']) {
      assert.ok(!blob.includes(needle), `audit metadata must not contain "${needle}"`);
    }
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`STEP 47 results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('');
    for (const f of failures) {
      console.log(`  ✗ ${f.name}`);
      console.log(`    ${f.error}`);
    }
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('STEP 47 suite crashed:', err);
  process.exit(1);
});
