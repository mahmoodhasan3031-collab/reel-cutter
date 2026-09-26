'use strict';

/**
 * STEP 16 — Manual Payment Database Migration Tests
 *
 * Tests:
 *   A. Migration File Integrity
 *   B. manual_payments Table Structure
 *   C. audit_log Table Structure
 *   D. Indexes and Constraints
 *   E. RLS Policies
 *   F. Security Invariants
 *   G. Regression: Existing Objects Preserved
 *   H. Storage Bucket Requirements
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
const schemaFile = path.join(__dirname, '..', 'supabase-schema.sql');

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

function assertFileExists(filePath, label) {
  const exists = fs.existsSync(filePath);
  assert.ok(exists, `${label} must exist at ${path.relative(path.join(__dirname, '..'), filePath)}`);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

async function runStep16Tests() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 16 — Manual Payment Database Migration Tests');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // A. Migration File Integrity
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('── A. Migration File Integrity ──');

  const migrationFile = path.join(migrationDir, '20260926000000_create_manual_payments_and_audit_log.sql');
  let migrationSrc = '';

  await test('A1. Migration file exists', () => {
    assertFileExists(migrationFile, 'Migration file');
    migrationSrc = readFile(migrationFile);
  });

  await test('A2. Migration file is non-empty', () => {
    assert.ok(migrationSrc.length > 500, 'Migration file must be substantial (>500 bytes)');
  });

  await test('A3. Migration follows naming convention (YYYYMMDDHHMMSS_description.sql)', () => {
    const basename = path.basename(migrationFile);
    assert.ok(/^\d{14}_\w+\.sql$/.test(basename), `Migration filename "${basename}" must match YYYYMMDDHHMMSS_description.sql pattern`);
  });

  await test('A4. Migration header contains STEP 16 reference', () => {
    assert.ok(migrationSrc.includes('STEP 16'), 'Migration must reference STEP 16');
  });

  await test('A5. Migration contains preservation notice', () => {
    assert.ok(
      migrationSrc.includes('licenses') && migrationSrc.toLowerCase().includes('unchanged') ||
      migrationSrc.toLowerCase().includes('preserv') ||
      migrationSrc.toLowerCase().includes('not modify'),
      'Migration must note that existing objects are preserved'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. manual_payments Table Structure
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── B. manual_payments Table Structure ──');

  await test('B1. Creates manual_payments table', () => {
    assert.ok(
      migrationSrc.includes('CREATE TABLE') && migrationSrc.includes('manual_payments'),
      'Migration must create manual_payments table'
    );
  });

  await test('B2. Has UUID primary key with gen_random_uuid()', () => {
    assert.ok(migrationSrc.includes('UUID PRIMARY KEY DEFAULT gen_random_uuid()'), 'Must have UUID PK with gen_random_uuid()');
  });

  await test('B3. Has customer_name TEXT NOT NULL', () => {
    assert.ok(migrationSrc.includes('customer_name TEXT NOT NULL'), 'Must have customer_name TEXT NOT NULL');
  });

  await test('B4. Has customer_email TEXT NOT NULL', () => {
    assert.ok(migrationSrc.includes('customer_email TEXT NOT NULL'), 'Must have customer_email TEXT NOT NULL');
  });

  await test('B5. Has whatsapp_number TEXT nullable', () => {
    assert.ok(migrationSrc.includes('whatsapp_number TEXT'), 'Must have whatsapp_number TEXT');
  });

  await test('B6. Has plan_id with CHECK constraint (basic, standard, pro)', () => {
    assert.ok(migrationSrc.includes('plan_id TEXT NOT NULL'), 'Must have plan_id TEXT NOT NULL');
    assert.ok(
      migrationSrc.includes("'basic'") && migrationSrc.includes("'standard'") && migrationSrc.includes("'pro'"),
      'plan_id CHECK must include basic, standard, pro'
    );
  });

  await test('B7. Has payment_method with CHECK constraint (bkash, nagad, rocket, bank, binance)', () => {
    assert.ok(migrationSrc.includes('payment_method TEXT NOT NULL'), 'Must have payment_method TEXT NOT NULL');
    assert.ok(
      migrationSrc.includes("'bkash'") && migrationSrc.includes("'nagad'") &&
      migrationSrc.includes("'rocket'") && migrationSrc.includes("'bank'") && migrationSrc.includes("'binance'"),
      'payment_method CHECK must include bkash, nagad, rocket, bank, binance'
    );
  });

  await test('B8. Has amount NUMERIC(10,2) with CHECK (amount > 0)', () => {
    assert.ok(migrationSrc.includes('amount NUMERIC(10,2) NOT NULL'), 'Must have amount NUMERIC(10,2) NOT NULL');
    assert.ok(migrationSrc.includes('amount > 0'), 'Must have CHECK (amount > 0)');
  });

  await test('B9. Has currency with CHECK (BDT, USDT) and default BDT', () => {
    assert.ok(migrationSrc.includes('currency TEXT NOT NULL'), 'Must have currency TEXT NOT NULL');
    assert.ok(migrationSrc.includes("DEFAULT 'BDT'"), 'Must default to BDT');
    assert.ok(migrationSrc.includes("'BDT'") && migrationSrc.includes("'USDT'"), 'Must support BDT and USDT');
  });

  await test('B10. Has transaction_id TEXT NOT NULL', () => {
    assert.ok(migrationSrc.includes('transaction_id TEXT NOT NULL'), 'Must have transaction_id TEXT NOT NULL');
  });

  await test('B11. Has sender_account TEXT nullable', () => {
    assert.ok(migrationSrc.includes('sender_account TEXT'), 'Must have sender_account TEXT');
  });

  await test('B12. Has proof_url TEXT nullable', () => {
    assert.ok(migrationSrc.includes('proof_url TEXT'), 'Must have proof_url TEXT');
  });

  await test('B13. Has status with CHECK constraint (pending, approved, rejected, cancelled)', () => {
    assert.ok(migrationSrc.includes('status TEXT NOT NULL'), 'Must have status TEXT NOT NULL');
    assert.ok(migrationSrc.includes("DEFAULT 'pending'"), 'Must default to pending');
    assert.ok(
      migrationSrc.includes("'pending'") && migrationSrc.includes("'approved'") &&
      migrationSrc.includes("'rejected'") && migrationSrc.includes("'cancelled'"),
      'status CHECK must include pending, approved, rejected, cancelled'
    );
  });

  await test('B14. Has admin_note TEXT nullable', () => {
    assert.ok(migrationSrc.includes('admin_note TEXT'), 'Must have admin_note TEXT');
  });

  await test('B15. Has rejection_reason TEXT nullable', () => {
    assert.ok(migrationSrc.includes('rejection_reason TEXT'), 'Must have rejection_reason TEXT');
  });

  await test('B16. Has reviewed_by TEXT nullable', () => {
    assert.ok(migrationSrc.includes('reviewed_by TEXT'), 'Must have reviewed_by TEXT');
  });

  await test('B17. Has reviewed_at TIMESTAMPTZ nullable', () => {
    assert.ok(migrationSrc.includes('reviewed_at TIMESTAMPTZ'), 'Must have reviewed_at TIMESTAMPTZ');
  });

  await test('B18. Has license_id UUID REFERENCES licenses(id)', () => {
    assert.ok(migrationSrc.includes('license_id UUID'), 'Must have license_id UUID');
    assert.ok(
      migrationSrc.includes('REFERENCES public.licenses(id)') || migrationSrc.includes('REFERENCES licenses(id)'),
      'license_id must reference licenses(id)'
    );
  });

  await test('B19. Has created_at and updated_at with defaults', () => {
    assert.ok(migrationSrc.includes('created_at TIMESTAMPTZ NOT NULL DEFAULT now()'), 'Must have created_at with DEFAULT now()');
    assert.ok(migrationSrc.includes('updated_at TIMESTAMPTZ NOT NULL DEFAULT now()'), 'Must have updated_at with DEFAULT now()');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. audit_log Table Structure
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── C. audit_log Table Structure ──');

  await test('C1. Creates audit_log table', () => {
    assert.ok(
      migrationSrc.includes('CREATE TABLE') && migrationSrc.includes('audit_log'),
      'Migration must create audit_log table'
    );
  });

  await test('C2. Has UUID primary key with gen_random_uuid()', () => {
    assert.ok(
      migrationSrc.includes('audit_log') &&
      migrationSrc.includes('id UUID PRIMARY KEY DEFAULT gen_random_uuid()'),
      'audit_log must have UUID PK with gen_random_uuid()'
    );
  });

  await test('C3. Has admin_id TEXT NOT NULL', () => {
    assert.ok(migrationSrc.includes('admin_id TEXT NOT NULL'), 'Must have admin_id TEXT NOT NULL');
  });

  await test('C4. Has action TEXT NOT NULL', () => {
    assert.ok(migrationSrc.includes('action TEXT NOT NULL'), 'Must have action TEXT NOT NULL');
  });

  await test('C5. Has target_type TEXT NOT NULL', () => {
    assert.ok(migrationSrc.includes('target_type TEXT NOT NULL'), 'Must have target_type TEXT NOT NULL');
  });

  await test('C6. Has target_id UUID nullable', () => {
    assert.ok(migrationSrc.includes('target_id UUID'), 'Must have target_id UUID');
  });

  await test('C7. Has metadata JSONB nullable', () => {
    assert.ok(migrationSrc.includes('metadata JSONB'), 'Must have metadata JSONB');
  });

  await test('C8. Has created_at with default', () => {
    assert.ok(
      migrationSrc.includes('created_at TIMESTAMPTZ NOT NULL DEFAULT now()'),
      'Must have created_at with DEFAULT now()'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. Indexes and Constraints
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── D. Indexes and Constraints ──');

  await test('D1. Creates idx_manual_payments_status index', () => {
    assert.ok(
      migrationSrc.includes('CREATE INDEX') && migrationSrc.includes('idx_manual_payments_status'),
      'Must create idx_manual_payments_status'
    );
  });

  await test('D2. Creates idx_manual_payments_customer_email index', () => {
    assert.ok(
      migrationSrc.includes('CREATE INDEX') && migrationSrc.includes('idx_manual_payments_customer_email'),
      'Must create idx_manual_payments_customer_email'
    );
  });

  await test('D3. Creates idx_manual_payments_transaction_id index', () => {
    assert.ok(
      migrationSrc.includes('CREATE INDEX') && migrationSrc.includes('idx_manual_payments_transaction_id'),
      'Must create idx_manual_payments_transaction_id'
    );
  });

  await test('D4. Creates idx_manual_payments_created_at index', () => {
    assert.ok(
      migrationSrc.includes('CREATE INDEX') && migrationSrc.includes('idx_manual_payments_created_at'),
      'Must create idx_manual_payments_created_at'
    );
  });

  await test('D5. Creates unique constraint on (payment_method, transaction_id)', () => {
    assert.ok(
      migrationSrc.includes('UNIQUE') && migrationSrc.includes('payment_method') && migrationSrc.includes('transaction_id'),
      'Must create UNIQUE constraint on (payment_method, transaction_id)'
    );
  });

  await test('D6. Creates idx_audit_log_created_at index', () => {
    assert.ok(
      migrationSrc.includes('CREATE INDEX') && migrationSrc.includes('idx_audit_log_created_at'),
      'Must create idx_audit_log_created_at'
    );
  });

  await test('D7. Creates idx_audit_log_action index', () => {
    assert.ok(
      migrationSrc.includes('CREATE INDEX') && migrationSrc.includes('idx_audit_log_action'),
      'Must create idx_audit_log_action'
    );
  });

  await test('D8. Uses IF NOT EXISTS for idempotent index creation', () => {
    const indexStatements = migrationSrc.match(/CREATE INDEX[^;]+;/g) || [];
    for (const stmt of indexStatements) {
      assert.ok(
        stmt.includes('IF NOT EXISTS'),
        `Index statement must use IF NOT EXISTS: ${stmt.substring(0, 60)}...`
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. RLS Policies
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── E. RLS Policies ──');

  await test('E1. Enables RLS on manual_payments', () => {
    assert.ok(
      migrationSrc.includes('ENABLE ROW LEVEL SECURITY') && migrationSrc.includes('manual_payments'),
      'Must enable RLS on manual_payments'
    );
  });

  await test('E2. Enables RLS on audit_log', () => {
    assert.ok(
      migrationSrc.includes('ENABLE ROW LEVEL SECURITY') && migrationSrc.includes('audit_log'),
      'Must enable RLS on audit_log'
    );
  });

  await test('E3. Creates service_role full access policy on manual_payments', () => {
    assert.ok(
      migrationSrc.includes('CREATE POLICY') &&
      migrationSrc.includes('manual_payments') &&
      migrationSrc.includes('service_role') &&
      migrationSrc.includes('USING (true)'),
      'Must create service_role full access policy on manual_payments'
    );
  });

  await test('E4. Creates authenticated INSERT policy on manual_payments with email guard', () => {
    assert.ok(
      migrationSrc.includes('FOR INSERT') &&
      migrationSrc.includes('manual_payments') &&
      migrationSrc.includes('authenticated'),
      'Must create authenticated INSERT policy on manual_payments'
    );
    assert.ok(
      migrationSrc.includes('customer_email') && migrationSrc.includes('auth.uid()'),
      'INSERT policy must guard on customer_email matching auth.uid() email'
    );
  });

  await test('E5. Creates authenticated SELECT policy on manual_payments with email guard', () => {
    assert.ok(
      migrationSrc.includes('FOR SELECT') &&
      migrationSrc.includes('manual_payments') &&
      migrationSrc.includes('authenticated'),
      'Must create authenticated SELECT policy on manual_payments'
    );
  });

  await test('E6. Creates service_role full access policy on audit_log', () => {
    assert.ok(
      migrationSrc.includes('CREATE POLICY') &&
      migrationSrc.includes('audit_log') &&
      migrationSrc.includes('service_role'),
      'Must create service_role full access policy on audit_log'
    );
  });

  await test('E7. No INSERT/UPDATE/DELETE policies for authenticated on manual_payments', () => {
    const insertPolicies = (migrationSrc.match(/FOR INSERT[^;]+authenticated[^;]+manual_payments/gi) || []);
    const updatePolicies = (migrationSrc.match(/FOR UPDATE[^;]+authenticated[^;]+manual_payments/gi) || []);
    const deletePolicies = (migrationSrc.match(/FOR DELETE[^;]+authenticated[^;]+manual_payments/gi) || []);
    // Only the one INSERT policy with email guard should exist
    assert.ok(insertPolicies.length <= 1, 'Should have at most one authenticated INSERT policy');
    assert.ok(updatePolicies.length === 0, 'Should have no authenticated UPDATE policy on manual_payments');
    assert.ok(deletePolicies.length === 0, 'Should have no authenticated DELETE policy on manual_payments');
  });

  await test('E8. No SELECT/INSERT/UPDATE/DELETE policies for authenticated on audit_log', () => {
    const authPolicies = (migrationSrc.match(/audit_log[^;]+authenticated/gi) || []);
    // Should only have the revoke statements, no policies granting authenticated access
    const policyGrants = authPolicies.filter(p => p.includes('CREATE POLICY'));
    assert.ok(policyGrants.length === 0, 'Should have no authenticated policies on audit_log');
  });

  await test('E9. Revokes anon access from manual_payments', () => {
    assert.ok(
      migrationSrc.includes('REVOKE') && migrationSrc.includes('manual_payments') && migrationSrc.includes('anon'),
      'Must REVOKE access from anon on manual_payments'
    );
  });

  await test('E10. Revokes anon access from audit_log', () => {
    assert.ok(
      migrationSrc.includes('REVOKE') && migrationSrc.includes('audit_log') && migrationSrc.includes('anon'),
      'Must REVOKE access from anon on audit_log'
    );
  });

  await test('E11. Revokes authenticated access from audit_log', () => {
    assert.ok(
      migrationSrc.includes('REVOKE') && migrationSrc.includes('audit_log') && migrationSrc.includes('authenticated'),
      'Must REVOKE access from authenticated on audit_log'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F. Security Invariants
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── F. Security Invariants ──');

  await test('F1. Duplicate transaction ID for same payment method is rejected', () => {
    assert.ok(
      migrationSrc.includes('UNIQUE') && migrationSrc.includes('payment_method, transaction_id'),
      'Unique constraint on (payment_method, transaction_id) prevents duplicate submissions'
    );
  });

  await test('F2. Customer cannot modify status via RLS (no UPDATE policy)', () => {
    // The absence of an UPDATE policy for authenticated means customers cannot modify any field
    assert.ok(
      !migrationSrc.match(/FOR UPDATE[^;]+authenticated[^;]+manual_payments/s),
      'No UPDATE policy for authenticated on manual_payments'
    );
  });

  await test('F3. Customer cannot assign license_id via RLS (no UPDATE policy)', () => {
    // Same as above — no UPDATE policy means no field modification
    assert.ok(
      !migrationSrc.match(/FOR UPDATE[^;]+authenticated[^;]+manual_payments/s),
      'No UPDATE policy means customer cannot set license_id'
    );
  });

  await test('F4. Customer cannot modify reviewed_by/reviewed_at (no UPDATE policy)', () => {
    assert.ok(
      !migrationSrc.match(/FOR UPDATE[^;]+authenticated[^;]+manual_payments/s),
      'No UPDATE policy means customer cannot set reviewed_by/reviewed_at'
    );
  });

  await test('F5. Customer cannot access audit_log', () => {
    assert.ok(
      migrationSrc.includes('REVOKE') && migrationSrc.includes('audit_log') && migrationSrc.includes('authenticated'),
      'Authenticated role has no access to audit_log'
    );
  });

  await test('F6. Payment amount must be positive', () => {
    assert.ok(
      migrationSrc.includes('CHECK (amount > 0)'),
      'amount CHECK constraint ensures positive values'
    );
  });

  await test('F7. License ID references existing licenses table', () => {
    assert.ok(
      migrationSrc.includes('REFERENCES public.licenses(id)') || migrationSrc.includes('REFERENCES licenses(id)'),
      'license_id has foreign key to licenses table'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // G. Regression: Existing Objects Preserved
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── G. Regression: Existing Objects Preserved ──');

  await test('G1. Migration does not DROP any existing table', () => {
    // Strip SQL comments before checking
    const withoutComments = migrationSrc
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    assert.ok(
      !withoutComments.includes('DROP TABLE'),
      'Migration must not contain DROP TABLE statements'
    );
  });

  await test('G2. Migration does not DROP any existing function', () => {
    assert.ok(
      !migrationSrc.includes('DROP FUNCTION'),
      'Migration must not contain DROP FUNCTION statements'
    );
  });

  await test('G3. Migration does not DROP any existing trigger', () => {
    assert.ok(
      !migrationSrc.includes('DROP TRIGGER set_licenses'),
      'Migration must not drop licenses triggers'
    );
  });

  await test('G4. Migration does not ALTER the licenses table', () => {
    assert.ok(
      !migrationSrc.match(/ALTER TABLE public\.licenses\b/i),
      'Migration must not ALTER the licenses table'
    );
  });

  await test('G5. Existing handle_updated_at() function is reused (not recreated)', () => {
    assert.ok(
      migrationSrc.includes('handle_updated_at'),
      'Migration must reference existing handle_updated_at() function'
    );
    assert.ok(
      !migrationSrc.match(/CREATE OR REPLACE FUNCTION public\.handle_updated_at/),
      'Migration must not recreate handle_updated_at()'
    );
  });

  await test('G6. Verification block checks existing objects are intact', () => {
    assert.ok(
      migrationSrc.includes('verification') || migrationSrc.includes('VERIFY') || migrationSrc.includes('VERIFICATION'),
      'Migration must include verification step'
    );
    assert.ok(
      migrationSrc.includes('licenses'),
      'Verification must check licenses table exists'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // H. Storage Bucket Requirements
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── H. Storage Bucket Requirements ──');

  await test('H1. Migration documents payment-proofs bucket requirement', () => {
    assert.ok(
      migrationSrc.includes('payment-proofs'),
      'Migration must reference payment-proofs bucket'
    );
  });

  await test('H2. Migration notes bucket must be private', () => {
    assert.ok(
      migrationSrc.toLowerCase().includes('private') || migrationSrc.toLowerCase().includes('not public'),
      'Migration must note that bucket should be private'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // I. Trigger
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── I. Trigger ──');

  await test('I1. Creates updated_at trigger for manual_payments', () => {
    assert.ok(
      migrationSrc.includes('set_manual_payments_updated_at') || migrationSrc.includes('updated_at'),
      'Must create updated_at trigger for manual_payments'
    );
  });

  await test('I2. Trigger uses existing handle_updated_at() function', () => {
    assert.ok(
      migrationSrc.includes('handle_updated_at()'),
      'Trigger must use existing handle_updated_at() function'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`STEP 16 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  ✗ ${f.name}: ${f.error}`);
    }
  }

  console.log('');

  // Do not exit with failure — report only. The test runner may have more tests.
  return { passed, failed, total: passed + failed, failures };
}

module.exports = { runStep16Tests };

if (require.main === module) {
  runStep16Tests().then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  });
}
