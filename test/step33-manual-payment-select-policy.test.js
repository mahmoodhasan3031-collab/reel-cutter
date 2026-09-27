const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');

// ─── Test runner ─────────────────────────────────────────────────────────────
let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  \u2713 PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \u2717 FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// ─── Source files ────────────────────────────────────────────────────────────
const NEW_MIGRATION = '20260930000000_fix_manual_payment_authenticated_select_policy.sql';
const INSERT_MIGRATION = '20260929000000_harden_manual_payment_insert_policy.sql';
const BASE_MIGRATION = '20260926000000_create_manual_payments_and_audit_log.sql';

const newSrc = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', NEW_MIGRATION), 'utf8');
const insertSrc = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', INSERT_MIGRATION), 'utf8');
const baseSrc = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', BASE_MIGRATION), 'utf8');

function stripComments(sql) {
  return sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
}

const migration = stripComments(newSrc);
const insertMigration = stripComments(insertSrc);
const base = stripComments(baseSrc);

// ═════════════════════════════════════════════════════════════════════════════
// SECTION A — static analysis of the new migration
// ═════════════════════════════════════════════════════════════════════════════
function extractUsing(sql) {
  const m = sql.match(/CREATE\s+POLICY[\s\S]*?FOR\s+SELECT[\s\S]*?USING\s*\(([\s\S]*?)\)\s*;/);
  if (!m) throw new Error('USING block not found in migration');
  return m[1]
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION B — live local Supabase RLS matrix (local docker container only)
// ═════════════════════════════════════════════════════════════════════════════
const CONTAINER = process.env.SUPABASE_LOCAL_DB_CONTAINER || 'supabase_db_reel-cutter';
const ALICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ALICE_CLAIMS = JSON.stringify({
  sub: ALICE_ID, role: 'authenticated', email: 'alice@test.local',
});
const BOB_CLAIMS = JSON.stringify({
  sub: BOB_ID, role: 'authenticated', email: 'bob@test.local',
});
const NO_EMAIL_CLAIMS = JSON.stringify({ sub: ALICE_ID, role: 'authenticated' });

function psql(script) {
  // Merge stderr into stdout (`2>&1`) so RLS denials are captured in order and
  // stay inside their case block. Only ever exec'd against the LOCAL container.
  const cmd = `docker exec -i ${CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=0 2>&1`;
  const res = spawnSync(cmd, {
    shell: true,
    input: script,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(`psql exited with status ${res.status}: ${(res.stderr || '').slice(0, 400)}`);
  }
  return `${res.stdout || ''}${res.stderr || ''}`;
}

function dockerRunning(name) {
  try {
    return execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', name], { encoding: 'utf8' }).trim() === 'true';
  } catch (e) {
    return false;
  }
}

function claimsStmt(json) {
  return `SELECT set_config('request.jwt.claims', '${json.replace(/'/g, "''")}', true);`;
}

function insertRow(txn) {
  return `INSERT INTO public.manual_payments (customer_name, customer_email, plan_id, payment_method, amount, transaction_id)
VALUES ('Alice', 'alice@test.local', 'basic', 'bkash', 500.00, '${txn}');`;
}

function buildMatrix() {
  const rows = (txn) => `
SET LOCAL ROLE postgres;
${insertRow(txn)}`;
  const selectCount = (txn) =>
    `SELECT 'CASE_COUNT=' || count(*) FROM public.manual_payments WHERE transaction_id = '${txn}';`;

  return [
    '\\set ON_ERROR_STOP off',
    '\\pset format unaligned',
    '\\pset tuples_only on',
    "SELECT '###MATRIX_START';",

    // setup: synthetic principals
    'BEGIN;',
    `INSERT INTO auth.users (id, email) VALUES ('${ALICE_ID}', 'alice@test.local'), ('${BOB_ID}', 'bob@test.local');`,
    "SELECT '###SETUP_OK';",
    'COMMIT;',

    // CASE 1 — ALLOWED: authenticated inserts own pending payment
    "SELECT '###CASE1';",
    'BEGIN;',
    'SET LOCAL ROLE authenticated;',
    claimsStmt(ALICE_CLAIMS),
    insertRow('TXN-STEP33-01'),
    "SELECT 'CASE1_INSERTED=' || count(*) FROM public.manual_payments WHERE transaction_id = 'TXN-STEP33-01';",
    'ROLLBACK;',

    // CASE 2 — ALLOWED: same user can SELECT that payment
    "SELECT '###CASE2';",
    'BEGIN;',
    rows('TXN-STEP33-02'),
    'SET LOCAL ROLE authenticated;',
    claimsStmt(ALICE_CLAIMS),
    selectCount('TXN-STEP33-02'),
    'ROLLBACK;',

    // CASE 3 — ALLOWED: service_role can SELECT the payment
    "SELECT '###CASE3';",
    'BEGIN;',
    rows('TXN-STEP33-03'),
    'SET LOCAL ROLE service_role;',
    claimsStmt(JSON.stringify({ sub: ALICE_ID, role: 'service_role' })),
    selectCount('TXN-STEP33-03'),
    'ROLLBACK;',

    // CASE 4 — DENIED: another user cannot SELECT alice's payment
    "SELECT '###CASE4';",
    'BEGIN;',
    rows('TXN-STEP33-04'),
    'SET LOCAL ROLE authenticated;',
    claimsStmt(BOB_CLAIMS),
    selectCount('TXN-STEP33-04'),
    'ROLLBACK;',

    // CASE 5 — DENIED: no email claim => fail-closed, no visibility
    "SELECT '###CASE5';",
    'BEGIN;',
    rows('TXN-STEP33-05'),
    'SET LOCAL ROLE authenticated;',
    claimsStmt(NO_EMAIL_CLAIMS),
    selectCount('TXN-STEP33-05'),
    'ROLLBACK;',

    // CASE 6 — DENIED: anon SELECT
    "SELECT '###CASE6';",
    'BEGIN;',
    rows('TXN-STEP33-06'),
    'SET LOCAL ROLE anon;',
    claimsStmt(JSON.stringify({ role: 'anon' })),
    "SELECT 'CASE6_VISIBLE=' || count(*) FROM public.manual_payments WHERE transaction_id = 'TXN-STEP33-06';",
    'ROLLBACK;',

    // CASE 7 — DENIED: authenticated UPDATE
    "SELECT '###CASE7';",
    'BEGIN;',
    rows('TXN-STEP33-07'),
    'SET LOCAL ROLE authenticated;',
    claimsStmt(ALICE_CLAIMS),
    'SAVEPOINT sp7;',
    "UPDATE public.manual_payments SET status = 'approved', reviewed_by = 'admin' WHERE transaction_id = 'TXN-STEP33-07';",
    "SELECT 'CASE7_APPROVED=' || count(*) FROM public.manual_payments WHERE transaction_id = 'TXN-STEP33-07' AND status = 'approved';",
    'ROLLBACK;',

    // CASE 8 — DENIED: authenticated DELETE
    "SELECT '###CASE8';",
    'BEGIN;',
    rows('TXN-STEP33-08'),
    'SET LOCAL ROLE authenticated;',
    claimsStmt(ALICE_CLAIMS),
    'SAVEPOINT sp8;',
    "DELETE FROM public.manual_payments WHERE transaction_id = 'TXN-STEP33-08';",
    "SELECT 'CASE8_REMAINING=' || count(*) FROM public.manual_payments WHERE transaction_id = 'TXN-STEP33-08';",
    'ROLLBACK;',

    // CASE 9 — INSERT hardening: status=approved denied
    "SELECT '###CASE9';",
    'BEGIN;',
    'SET LOCAL ROLE authenticated;',
    claimsStmt(ALICE_CLAIMS),
    `INSERT INTO public.manual_payments (customer_name, customer_email, plan_id, payment_method, amount, transaction_id, status)
VALUES ('Alice', 'alice@test.local', 'basic', 'bkash', 500.00, 'TXN-STEP33-09', 'approved');`,
    "SELECT 'CASE9_INSERTED=unexpected';",
    'ROLLBACK;',

    // CASE 10 — INSERT hardening: license_id denied
    "SELECT '###CASE10';",
    'BEGIN;',
    'SET LOCAL ROLE authenticated;',
    claimsStmt(ALICE_CLAIMS),
    `INSERT INTO public.manual_payments (customer_name, customer_email, plan_id, payment_method, amount, transaction_id, license_id)
VALUES ('Alice', 'alice@test.local', 'basic', 'bkash', 500.00, 'TXN-STEP33-10', '11111111-1111-4111-8111-111111111111');`,
    "SELECT 'CASE10_INSERTED=unexpected';",
    'ROLLBACK;',

    // CASE 11 — INSERT hardening: reviewed_by denied
    "SELECT '###CASE11';",
    'BEGIN;',
    'SET LOCAL ROLE authenticated;',
    claimsStmt(ALICE_CLAIMS),
    `INSERT INTO public.manual_payments (customer_name, customer_email, plan_id, payment_method, amount, transaction_id, reviewed_by)
VALUES ('Alice', 'alice@test.local', 'basic', 'bkash', 500.00, 'TXN-STEP33-11', 'admin');`,
    "SELECT 'CASE11_INSERTED=unexpected';",
    'ROLLBACK;',

    // CASE 12 — INSERT hardening: reviewed_at denied
    "SELECT '###CASE12';",
    'BEGIN;',
    'SET LOCAL ROLE authenticated;',
    claimsStmt(ALICE_CLAIMS),
    `INSERT INTO public.manual_payments (customer_name, customer_email, plan_id, payment_method, amount, transaction_id, reviewed_at)
VALUES ('Alice', 'alice@test.local', 'basic', 'bkash', 500.00, 'TXN-STEP33-12', now());`,
    "SELECT 'CASE12_INSERTED=unexpected';",
    'ROLLBACK;',

    // cleanup + expected final counts
    'BEGIN;',
    "DELETE FROM auth.users WHERE email IN ('alice@test.local', 'bob@test.local');",
    'COMMIT;',
    "SELECT '###CLEANUP';",
    "SELECT 'USERS=' || count(*) FROM auth.users;",
    "SELECT 'LICENSES=' || count(*) FROM public.licenses;",
    "SELECT 'PAYMENTS=' || count(*) FROM public.manual_payments;",
    "SELECT 'AUDIT=' || count(*) FROM public.audit_log;",
    "SELECT '###MATRIX_END';",
    '',
  ].join('\n');
}

function splitBlocks(output) {
  const blocks = {};
  let current = 'preamble';
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const m = /^###(CASE\d+|SETUP_OK|CLEANUP|MATRIX_START|MATRIX_END)$/.exec(trimmed);
    if (m) {
      current = m[1];
      blocks[current] = [];
      continue;
    }
    if (!blocks[current]) blocks[current] = [];
    blocks[current].push(trimmed);
  }
  for (const k of Object.keys(blocks)) blocks[k] = blocks[k].filter(Boolean);
  return blocks;
}

function hasError(block) {
  return block.some((l) => /^ERROR:/.test(l));
}

function errorText(block) {
  return block.filter((l) => /^ERROR:/.test(l)).join(' | ');
}

let blocks = null;
let matrixRaw = '';

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(62));
console.log('\uD83D\uDD10 STEP 33 — Authenticated Manual-Payment SELECT Policy');
console.log('='.repeat(62));

(async () => {
  // ─── SECTION A: static ─────────────────────────────────────────────────────
  console.log('\n\u2500\u2500\u2500 A. Migration definition (static) \u2500\u2500\u2500');

  await test('A1. new migration exists and does not edit 20260926 / 20260929', () => {
    assert.ok(newSrc.length > 0, 'migration file empty');
    assert.ok(/^-- =/m.test(newSrc), 'migration must carry a header');
    // 0926 still records the original auth.users SELECT policy
    assert.ok(
      /CREATE POLICY "Authenticated users can read own payments"[\s\S]*?USING\s*\(\s*customer_email\s*=\s*\(\s*SELECT email FROM auth\.users WHERE id = auth\.uid\(\)\s*\)\s*\)/.test(base),
      '0926 original SELECT policy must remain untouched'
    );
    // 0929000000 still records the JWT INSERT hardening
    assert.ok(
      /lower\(customer_email\)\s*=\s*lower\(auth\.jwt\(\)\s*->>\s*'email'\)/.test(insertMigration),
      '20260929 INSERT hardening must remain untouched'
    );
  });

  await test('A2. guarded DROP POLICY IF EXISTS + CREATE POLICY (no IF NOT EXISTS)', () => {
    assert.ok(
      /DROP POLICY IF EXISTS "Authenticated users can read own payments"\s+ON public\.manual_payments/.test(migration),
      'guarded DROP missing'
    );
    assert.ok(!/CREATE POLICY IF NOT EXISTS/i.test(migration), 'must not assume CREATE POLICY IF NOT EXISTS');
  });

  await test('A3. exactly one DROP POLICY and one CREATE POLICY', () => {
    assert.strictEqual((migration.match(/DROP POLICY/g) || []).length, 1, 'expected 1 DROP POLICY');
    assert.strictEqual((migration.match(/CREATE POLICY/g) || []).length, 1, 'expected 1 CREATE POLICY');
  });

  await test('A4. new SELECT policy is JWT-claim ownership for authenticated', () => {
    const using = extractUsing(migration);
    assert.strictEqual(
      using,
      "lower(customer_email) = lower(auth.jwt() ->> 'email')",
      `unexpected USING: ${using}`
    );
    const policyBlock = migration.match(/CREATE POLICY[\s\S]*?;/)[0];
    assert.ok(/FOR SELECT/i.test(policyBlock), 'must be FOR SELECT');
    assert.ok(/TO authenticated/.test(policyBlock), 'must target authenticated only');
    assert.ok(!/TO (anon|service_role)/.test(policyBlock), 'must not target other roles');
  });

  await test('A5. USING does not read auth.users and has no auth.uid dependency', () => {
    const using = extractUsing(migration).toLowerCase();
    assert.ok(!using.includes('auth.users'), 'must not read auth.users');
    assert.ok(!using.includes('auth.uid'), 'must not call auth.uid()');
    assert.ok(!/\bfrom\s+[a-z_]+/.test(using), 'must not contain a subquery FROM clause');
  });

  await test('A6. verification is fail-closed and covers the required assertions', () => {
    const checks = [
      ['RAISE EXCEPTION', 'verification must raise'],
      ['unexpected policy count on manual_payments', 'policy count check'],
      ['authenticated gained UPDATE/DELETE policy', 'UPDATE/DELETE denial check'],
      ['anon gained a policy on manual_payments', 'anon check'],
      ['RLS not enabled on manual_payments', 'RLS check'],
      ['authenticated SELECT policy missing or not JWT-based', 'SELECT policy check'],
    ];
    for (const [needle, label] of checks) {
      assert.ok(migration.includes(needle), `verification missing: ${label}`);
    }
    assert.ok(/NOT EXISTS \(\s*SELECT 1 FROM pg_policies[\s\S]*?cmd IN \('UPDATE', 'DELETE'\)/.test(migration.replace(/\s+/g, ' ')), 'UPDATE/DELETE absence must be asserted');
  });

  await test('A7. verification also protects audit_log, licenses, RPCs and STEP 32 hardening', () => {
    for (const needle of [
      'STEP 32 INSERT hardening missing — regression detected',
      'audit_log policies changed',
      'licenses policies missing — regression detected',
      'bind_license_hwid missing — regression detected',
      'fetch_license_by_key missing — regression detected',
    ]) {
      assert.ok(migration.includes(needle), `verification missing: ${needle}`);
    }
  });

  await test('A8. migration is additive only: no tables, grants, RLS changes or SECURITY DEFINER', () => {
    for (const forbidden of [
      'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'CREATE INDEX', 'DROP INDEX',
      'GRANT ', 'REVOKE ', 'SECURITY DEFINER', 'DISABLE ROW LEVEL SECURITY',
      'ENABLE ROW LEVEL SECURITY', 'TRUNCATE', 'CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION',
    ]) {
      assert.ok(!migration.includes(forbidden), `forbidden statement present: ${forbidden}`);
    }
    const policyDdl = migration.match(/CREATE POLICY[\s\S]*?;/)[0];
    assert.ok(
      !/audit_log|licenses|bind_license_hwid|fetch_license_by_key|payment-proofs/.test(policyDdl),
      'policy DDL must not target other objects'
    );
    assert.ok(policyDdl.includes('manual_payments'), 'policy must target manual_payments only');
  });

  await test('A9. migration ordering: 20260930 runs after 20260929 and 20260926', () => {
    assert.ok(NEW_MIGRATION > INSERT_MIGRATION, 'must sort after 20260929');
    assert.ok(NEW_MIGRATION > BASE_MIGRATION, 'must sort after 20260926');
  });

  await test('A10. static SQL sanity: balanced dollar-quotes, DO/END pairs, parentheses', () => {
    assert.strictEqual((migration.match(/\$\$/g) || []).length % 2, 0, 'unbalanced $$');
    assert.strictEqual((migration.match(/\bDO\b/g) || []).length, (migration.match(/\bEND \$\$\;/g) || []).length, 'DO/END mismatch');
    const open = (migration.match(/\(/g) || []).length;
    const close = (migration.match(/\)/g) || []).length;
    assert.strictEqual(open, close, 'unbalanced parentheses');
  });

  // ─── SECTION B: live local RLS matrix ──────────────────────────────────────
  console.log('\n\u2500\u2500\u2500 B. Live local Supabase RLS matrix \u2500\u2500\u2500');

  await test('B0. local docker database container is running (never production)', () => {
    assert.ok(/^supabase_db_/.test(CONTAINER), `container "${CONTAINER}" does not look like a local supabase database`);
    assert.ok(dockerRunning(CONTAINER), `local container not running: ${CONTAINER}`);
    matrixRaw = psql(buildMatrix());
    blocks = splitBlocks(matrixRaw);
    assert.ok(blocks.MATRIX_START, 'matrix did not run');
    assert.ok(blocks.SETUP_OK, 'setup did not run');
    assert.ok(blocks.MATRIX_END, 'matrix did not finish');
  });

  const run = (name, fn) => test(name, async () => {
    assert.ok(blocks, 'matrix not executed (B0 must run first)');
    return fn();
  });

  await run('B1. ALLOWED: authenticated user inserts own pending payment', () => {
    assert.ok(!hasError(blocks.CASE1), errorText(blocks.CASE1));
    assert.ok(blocks.CASE1.includes('CASE1_INSERTED=1'), `insert failed: ${blocks.CASE1.join(' / ')}`);
  });

  await run('B2. ALLOWED: same authenticated user can SELECT that payment', () => {
    assert.ok(!hasError(blocks.CASE2), errorText(blocks.CASE2));
    assert.ok(blocks.CASE2.includes('CASE_COUNT=1'), `expected 1 visible row: ${blocks.CASE2.join(' / ')}`);
  });

  await run('B3. ALLOWED: service_role can SELECT the payment', () => {
    assert.ok(!hasError(blocks.CASE3), errorText(blocks.CASE3));
    assert.ok(blocks.CASE3.includes('CASE_COUNT=1'), `service_role must see the row: ${blocks.CASE3.join(' / ')}`);
  });

  await run('B4. DENIED: authenticated user cannot SELECT another user\'s payment', () => {
    assert.ok(!hasError(blocks.CASE4), `predicate must deny by invisibility, not error: ${errorText(blocks.CASE4)}`);
    assert.ok(blocks.CASE4.includes('CASE_COUNT=0'), `must be invisible to bob: ${blocks.CASE4.join(' / ')}`);
  });

  await run('B5. DENIED: authenticated user without email claim cannot access payments', () => {
    assert.ok(!hasError(blocks.CASE5), errorText(blocks.CASE5));
    assert.ok(blocks.CASE5.includes('CASE_COUNT=0'), `must be fail-closed: ${blocks.CASE5.join(' / ')}`);
  });

  await run('B6. DENIED: anon SELECT', () => {
    assert.ok(
      errorText(blocks.CASE6).includes('permission denied for table manual_payments'),
      `anon must be denied: ${errorText(blocks.CASE6)}`
    );
    assert.ok(!blocks.CASE6.some((l) => /^CASE6_VISIBLE=1$/.test(l)), 'anon must not see rows');
  });

  await run('B7. DENIED: authenticated UPDATE', () => {
    const approved = blocks.CASE7.find((l) => /^CASE7_APPROVED=/.test(l));
    const deniedByError = hasError(blocks.CASE7);
    assert.ok(deniedByError || (approved && approved === 'CASE7_APPROVED=0'), `UPDATE must not succeed: ${blocks.CASE7.join(' / ')}`);
    assert.ok(!approved || approved === 'CASE7_APPROVED=0', 'row must not have been updated');
  });

  await run('B8. DENIED: authenticated DELETE', () => {
    const remaining = blocks.CASE8.find((l) => /^CASE8_REMAINING=/.test(l));
    const deniedByError = hasError(blocks.CASE8);
    assert.ok(deniedByError || (remaining && remaining === 'CASE8_REMAINING=1'), `DELETE must not succeed: ${blocks.CASE8.join(' / ')}`);
    assert.ok(!remaining || remaining === 'CASE8_REMAINING=1', 'row must not have been deleted');
  });

  await run('B9. STEP 32 still holds: INSERT with status=approved denied', () => {
    assert.ok(
      errorText(blocks.CASE9).includes('new row violates row-level security policy'),
      `must be denied by RLS: ${errorText(blocks.CASE9)}`
    );
    assert.ok(!blocks.CASE9.some((l) => l.includes('CASE9_INSERTED=unexpected')), 'insert must not succeed');
  });

  await run('B10. STEP 32 still holds: INSERT with license_id denied', () => {
    assert.ok(
      errorText(blocks.CASE10).includes('new row violates row-level security policy'),
      `must be denied by RLS: ${errorText(blocks.CASE10)}`
    );
    assert.ok(!blocks.CASE10.some((l) => l.includes('CASE10_INSERTED=unexpected')), 'insert must not succeed');
  });

  await run('B11. STEP 32 still holds: INSERT with reviewed_by denied', () => {
    assert.ok(
      errorText(blocks.CASE11).includes('new row violates row-level security policy'),
      `must be denied by RLS: ${errorText(blocks.CASE11)}`
    );
    assert.ok(!blocks.CASE11.some((l) => l.includes('CASE11_INSERTED=unexpected')), 'insert must not succeed');
  });

  await run('B12. STEP 32 still holds: INSERT with reviewed_at denied', () => {
    assert.ok(
      errorText(blocks.CASE12).includes('new row violates row-level security policy'),
      `must be denied by RLS: ${errorText(blocks.CASE12)}`
    );
    assert.ok(!blocks.CASE12.some((l) => l.includes('CASE12_INSERTED=unexpected')), 'insert must not succeed');
  });

  await run('B13. cleanup: users, licenses, manual_payments and audit_log all back to 0', () => {
    assert.ok(blocks.CLEANUP, 'cleanup block missing');
    const find = (k) => blocks.CLEANUP.find((l) => l.startsWith(`${k}=`));
    assert.strictEqual(find('USERS'), 'USERS=0', `users: ${find('USERS')}`);
    assert.strictEqual(find('LICENSES'), 'LICENSES=0', `licenses: ${find('LICENSES')}`);
    assert.strictEqual(find('PAYMENTS'), 'PAYMENTS=0', `manual_payments: ${find('PAYMENTS')}`);
    assert.strictEqual(find('AUDIT'), 'AUDIT=0', `audit_log: ${find('AUDIT')}`);
  });

  // ─── summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(62));
  console.log(`STEP 33 SELECT Policy Test Results: ${passed} passed, ${total - passed} failed, ${total} total`);
  console.log('='.repeat(62) + '\n');
  process.exit(total - passed > 0 ? 1 : 0);
})();
