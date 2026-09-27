const path = require('path');
const fs = require('fs');
const assert = require('assert');

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
const NEW_MIGRATION = '20260929000000_harden_manual_payment_insert_policy.sql';
const BASE_MIGRATION = '20260926000000_create_manual_payments_and_audit_log.sql';

const hardeningSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', NEW_MIGRATION),
  'utf8'
);
const baseSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', BASE_MIGRATION),
  'utf8'
);
const manualPaymentRouteSrc = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'routes', 'manualPayment.js'),
  'utf8'
);

// Strip line comments (so prose cannot satisfy assertions).
function stripComments(sql) {
  return sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
}

const hardening = stripComments(hardeningSrc);
const base = stripComments(baseSrc);

// ─── WITH CHECK parser + evaluator ───────────────────────────────────────────
// Extracts the hardened predicate from the migration and evaluates it against
// fixtures, so the ALLOWED/DENIED matrix below is driven by the real SQL text.
function extractWithCheck(sql) {
  const m = sql.match(/WITH\s+CHECK\s*\(([\s\S]*?)\n\s*\);/);
  if (!m) throw new Error('WITH CHECK block not found in migration');
  const body = m[1].replace(/--[^\n]*/g, ' ');
  // split on top-level AND (paren-aware)
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && /^AND\b/i.test(body.slice(i))) {
      parts.push(cur);
      cur = '';
      i += 2; // skip 'AND'
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .map((p) => p.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')'))
    .filter(Boolean);
}

function makeEvaluator(clauses) {
  const fns = clauses.map((clause) => {
    if (/^lower\(customer_email\)\s*=\s*lower\(auth\.jwt\(\)\s*->>\s*'email'\)$/i.test(clause)) {
      return (row, auth) => {
        const claimed = auth && auth.email != null ? String(auth.email).toLowerCase() : null;
        return claimed != null && String(row.customer_email).toLowerCase() === claimed;
      };
    }
    let m = /^status\s*=\s*'([^']+)'$/i.exec(clause);
    if (m) {
      const expected = m[1];
      return (row) => row.status === expected;
    }
    m = /^([a-z_]+)\s+IS\s+NULL$/i.exec(clause);
    if (m) {
      const col = m[1];
      return (row) => row[col] === null || row[col] === undefined;
    }
    throw new Error(`Unrecognised WITH CHECK clause (fail-closed): ${clause}`);
  });
  return (row, auth) => fns.every((f) => f(row, auth));
}

function freshRow(overrides) {
  return Object.assign(
    {
      customer_email: 'alice@example.com',
      status: 'pending',
      license_id: null,
      reviewed_by: null,
      reviewed_at: null,
    },
    overrides || {}
  );
}

const ALICE = { email: 'alice@example.com' };
const BOB = { email: 'bob@example.com' };

// ─── Run tests ───────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n======================================================');
  console.log('\u{1F510} STEP 32 — Manual Payment INSERT Policy Hardening');
  console.log('======================================================\n');

  // ─── A. POLICY HARDENING LOGIC ────────────────────────────────────────────
  console.log('\u2500\u2500\u2500 A. Hardened policy definition \u2500\u2500\u2500');

  await test('A1. migration drops the existing policy with explicit guarded DROP (no CREATE POLICY IF NOT EXISTS assumed)', () => {
    assert.ok(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"Authenticated users can insert own payments"\s+ON\s+public\.manual_payments/i.test(hardening),
      'must DROP POLICY IF EXISTS the authenticated INSERT policy before recreating it'
    );
    assert.ok(
      !/CREATE\s+POLICY\s+IF\s+NOT\s+EXISTS/i.test(hardening),
      'PostgreSQL has no CREATE POLICY IF NOT EXISTS'
    );
  });

  await test('A2. policy recreated for authenticated INSERT only', () => {
    const m = hardening.match(/CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+public\.manual_payments\s+FOR\s+(\w+)\s+TO\s+(\w+)/i);
    assert.ok(m, 'CREATE POLICY statement not found');
    assert.strictEqual(m[1], 'Authenticated users can insert own payments', 'policy name must be reused');
    assert.strictEqual(m[2].toUpperCase(), 'INSERT', 'policy must be FOR INSERT');
    assert.strictEqual(m[3], 'authenticated', 'policy must target authenticated');
  });

  await test('A3. WITH CHECK keeps verified email ownership logic (JWT claim, not auth.users read)', () => {
    const clauses = extractWithCheck(hardening);
    assert.ok(
      clauses.some((c) => /^lower\(customer_email\)\s*=\s*lower\(auth\.jwt\(\)\s*->>\s*'email'\)$/i.test(c)),
      `ownership clause missing; got: ${JSON.stringify(clauses)}`
    );
    assert.ok(
      !/auth\.users/i.test(hardening.replace(/--[^\n]*/g, ' ')),
      'must not depend on reading auth.users (authenticated has no SELECT grant there)'
    );
  });

  await test('A4. WITH CHECK constrains status = pending', () => {
    const clauses = extractWithCheck(hardening);
    assert.ok(clauses.some((c) => /^status\s*=\s*'pending'$/i.test(c)), 'status = pending missing');
  });

  await test('A5. WITH CHECK constrains license_id IS NULL', () => {
    const clauses = extractWithCheck(hardening);
    assert.ok(clauses.some((c) => /^license_id\s+IS\s+NULL$/i.test(c)), 'license_id IS NULL missing');
  });

  await test('A6. WITH CHECK constrains reviewed_by IS NULL', () => {
    const clauses = extractWithCheck(hardening);
    assert.ok(clauses.some((c) => /^reviewed_by\s+IS\s+NULL$/i.test(c)), 'reviewed_by IS NULL missing');
  });

  await test('A7. WITH CHECK constrains reviewed_at IS NULL', () => {
    const clauses = extractWithCheck(hardening);
    assert.ok(clauses.some((c) => /^reviewed_at\s+IS\s+NULL$/i.test(c)), 'reviewed_at IS NULL missing');
  });

  await test('A8. policy definition is exactly the 5 expected clauses (no weakening extras)', () => {
    const clauses = extractWithCheck(hardening);
    assert.strictEqual(clauses.length, 5, `expected 5 clauses, got: ${JSON.stringify(clauses)}`);
  });

  // ─── B. ALLOWED / DENIED MATRIX (evaluated from the parsed SQL) ───────────
  console.log('\u2500\u2500\u2500 B. Policy evaluation matrix \u2500\u2500\u2500');

  let evaluate;
  try {
    evaluate = makeEvaluator(extractWithCheck(hardening));
  } catch (err) {
    evaluate = () => {
      throw err;
    };
  }

  await test('B1. ALLOWED: authenticated user inserts own pending payment with no license/admin fields', () => {
    assert.strictEqual(evaluate(freshRow(), ALICE), true, 'own pending row must be allowed');
  });

  await test('B2. DENIED: status = approved', () => {
    assert.strictEqual(evaluate(freshRow({ status: 'approved' }), ALICE), false, 'approved must be denied');
  });

  await test('B3. DENIED: status = rejected', () => {
    assert.strictEqual(evaluate(freshRow({ status: 'rejected' }), ALICE), false, 'rejected must be denied');
  });

  await test('B4. DENIED: status = cancelled', () => {
    assert.strictEqual(evaluate(freshRow({ status: 'cancelled' }), ALICE), false, 'cancelled must be denied');
  });

  await test('B5. DENIED: license_id supplied', () => {
    assert.strictEqual(
      evaluate(freshRow({ license_id: '11111111-1111-4111-8111-111111111111' }), ALICE),
      false,
      'license_id must be NULL'
    );
  });

  await test('B6. DENIED: reviewed_by supplied', () => {
    assert.strictEqual(evaluate(freshRow({ reviewed_by: 'admin' }), ALICE), false, 'reviewed_by must be NULL');
  });

  await test('B7. DENIED: reviewed_at supplied', () => {
    assert.strictEqual(
      evaluate(freshRow({ reviewed_at: '2026-09-29T00:00:00Z' }), ALICE),
      false,
      'reviewed_at must be NULL'
    );
  });

  await test('B8. DENIED: another user\'s email', () => {
    assert.strictEqual(evaluate(freshRow(), BOB), false, "inserting with someone else's email must be denied");
  });

  await test('B9. DENIED: unauthenticated caller (no email claim)', () => {
    assert.strictEqual(evaluate(freshRow(), {}), false, 'missing email claim must be denied');
  });

  await test('B10. ALLOWED only when every hardening clause holds (pending + all NULLs + own email)', () => {
    assert.strictEqual(evaluate(freshRow({ status: 'pending', license_id: null }), ALICE), true);
    assert.strictEqual(evaluate(freshRow({ status: 'pending', reviewed_by: 'admin' }), ALICE), false);
  });

  await test('B11. ownership comparison is case-insensitive on both sides', () => {
    assert.strictEqual(evaluate(freshRow(), { email: 'ALICE@Example.Com' }), true, 'case must not break ownership');
    assert.strictEqual(evaluate(freshRow({ customer_email: 'ALICE@example.com' }), ALICE), true, 'case must not break ownership');
  });

  // ─── C. WORKFLOW PRESERVATION ─────────────────────────────────────────────
  console.log('\u2500\u2500\u2500 C. Workflow preservation \u2500\u2500\u2500');

  await test('C1. service_role approval path untouched — no policy dropped for service_role', () => {
    assert.ok(
      !/DROP\s+POLICY\s+IF\s+EXISTS\s+"Service role/i.test(hardening),
      'must not drop the service_role policy'
    );
    assert.ok(
      base.includes('Service role full access on manual_payments'),
      '0926 service_role policy must still exist'
    );
  });

  await test('C2. no GRANT / no SECURITY DEFINER / no REVOKE added by the hardening migration', () => {
    assert.ok(!/\bGRANT\b/i.test(hardening), 'no GRANT allowed');
    assert.ok(!/SECURITY\s+DEFINER/i.test(hardening), 'no SECURITY DEFINER allowed');
    assert.ok(!/\bREVOKE\b/i.test(hardening), 'no REVOKE needed');
  });

  await test('C3. no UPDATE or DELETE policy created for anyone', () => {
    assert.ok(!/FOR\s+UPDATE/i.test(hardening), 'no FOR UPDATE policy');
    assert.ok(!/FOR\s+DELETE/i.test(hardening), 'no FOR DELETE policy');
    assert.ok(
      !/FOR\s+(UPDATE|DELETE)/i.test(base),
      '0926 must not create UPDATE/DELETE policies either'
    );
  });

  await test('C4. anon stays denied — no anon policy created, 0926 revokes intact', () => {
    assert.ok(!/TO\s+anon/i.test(hardening), 'must not create a policy TO anon');
    const revokes = (base.match(/REVOKE\s+(SELECT|UPDATE|INSERT|DELETE)\s+ON\s+public\.manual_payments\s+FROM\s+anon/gi) || []).length;
    assert.strictEqual(revokes, 4, `expected 4 anon REVOKEs in 0926, got ${revokes}`);
  });

  await test('C5. RLS is never disabled and stays a precondition', () => {
    assert.ok(!/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(hardening), 'must not disable RLS');
    assert.ok(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(base), '0926 enables RLS');
    assert.ok(/rowsecurity\s*=\s*true/i.test(hardening), 'hardening must assert RLS remains on');
  });

  await test('C6. server keeps forcing status = pending and stripping admin fields (service-role path)', () => {
    assert.ok(
      /status:\s*'pending'/.test(manualPaymentRouteSrc),
      'manualPayment.js must keep writing status pending'
    );
    assert.ok(
      /safeRecord/.test(manualPaymentRouteSrc),
      'manualPayment.js must keep stripping customer-controlled fields'
    );
  });

  // ─── D. SCOPE GUARDS ──────────────────────────────────────────────────────
  console.log('\u2500\u2500\u2500 D. Scope guards \u2500\u2500\u2500');

  await test('D1. migration creates/drops no tables and alters nothing else', () => {
    assert.ok(!/CREATE\s+TABLE/i.test(hardening), 'no CREATE TABLE');
    assert.ok(!/DROP\s+TABLE/i.test(hardening), 'no DROP TABLE');
    assert.ok(!/ALTER\s+TABLE/i.test(hardening), 'no ALTER TABLE');
    assert.ok(!/CREATE\s+INDEX/i.test(hardening), 'no CREATE INDEX');
    assert.ok(!/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(hardening), 'no function changes');
    assert.ok(!/INSERT\s+INTO/i.test(hardening), 'no data DML');
    assert.ok(!/UPDATE\s+\w+\s+SET/i.test(hardening), 'no data DML');
    assert.ok(!/DELETE\s+FROM/i.test(hardening), 'no data DML');
    assert.ok(!/storage\./i.test(hardening), 'no storage changes');
  });

  await test('D2. licenses and audit_log only appear in read-only verification, never as targets', () => {
    const targets = hardening.match(/ON\s+public\.(licenses|audit_log)/gi) || [];
    assert.strictEqual(targets.length, 0, `policy DDL must not target licenses/audit_log: ${targets}`);
    assert.ok(!/ALTER\s+TABLE\s+public\.(licenses|audit_log)/i.test(hardening), 'must not alter licenses/audit_log');
  });

  await test('D3. exactly one DROP POLICY and one CREATE POLICY in the migration', () => {
    assert.strictEqual((hardening.match(/DROP\s+POLICY\b/gi) || []).length, 1, 'exactly one DROP POLICY');
    assert.strictEqual((hardening.match(/CREATE\s+POLICY\b/gi) || []).length, 1, 'exactly one CREATE POLICY');
  });

  await test('D4. original 0926 migration is untouched (weak policy still recorded there)', () => {
    assert.ok(
      /WITH CHECK \(\s*customer_email = \(/i.test(base),
      '0926 must still contain its original ownership-only WITH CHECK'
    );
    assert.ok(!/license_id IS NULL/i.test(base), 'hardening must NOT be written into 0926');
    assert.ok(!/STEP 32/.test(base), '0926 must not reference STEP 32');
  });

  // ─── E. FAIL-CLOSED + ORDERING ────────────────────────────────────────────
  console.log('\u2500\u2500\u2500 E. Fail-closed verification & ordering \u2500\u2500\u2500');

  await test('E1. preconditions fail closed when manual_payments / original policy is missing', () => {
    assert.ok(/STEP 32 MIGRATION BLOCKED/.test(hardening), 'blocked-exception guards required');
    assert.ok(
      /original authenticated INSERT policy not found/i.test(hardening),
      'must fail closed if the original policy is absent'
    );
    assert.ok(/does not exist — apply 20260926000000 first/i.test(hardening), 'must fail closed if table absent');
  });

  await test('E2. verification raises on failure (fail-closed) rather than warning', () => {
    assert.ok(/STEP 32 MIGRATION VERIFICATION FAILED/.test(hardening), 'verification must RAISE EXCEPTION');
    assert.ok(/STEP 32 MIGRATION VERIFICATION PASSED/.test(hardening), 'success notice required');
  });

  await test('E3. verification asserts policy count, RLS, anon denial and no authenticated UPDATE/DELETE', () => {
    assert.ok(/unexpected policy count on manual_payments/i.test(hardening), 'policy count guard required');
    assert.ok(/authenticated gained UPDATE\/DELETE policy/i.test(hardening), 'UPDATE/DELETE guard required');
    assert.ok(/anon gained a policy on manual_payments/i.test(hardening), 'anon guard required');
    assert.ok(/audit_log policies changed/i.test(hardening), 'audit_log guard required');
    assert.ok(/licenses policies missing — regression detected/i.test(hardening), 'licenses guard required');
    assert.ok(/fetch_license_by_key missing — regression detected/i.test(hardening), 'RPC guard required');
    assert.ok(/bind_license_hwid missing — regression detected/i.test(hardening), 'RPC guard required');
  });

  await test('E4. migration ordering: 20260929 sorts after 20260928, 20260927 and 20260926', () => {
    const files = fs
      .readdirSync(path.join(__dirname, '..', 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const idx = files.findIndex((f) => f.includes('20260929000000'));
    assert.ok(idx >= 0, 'new migration must exist');
    for (const dep of ['20260926000000', '20260927000000', '20260928000000']) {
      const d = files.findIndex((f) => f.includes(dep));
      assert.ok(d >= 0, `${dep} must exist`);
      assert.ok(d < idx, `${dep} must sort before the new migration`);
    }
    // Later steps may add migrations after this one, so "is the last file" is
    // not a stable contract. The real guarantee is that nothing is inserted
    // between this migration and its required predecessors.
    const versions = files.map((f) => f.slice(0, 14));
    assert.ok(
      !versions.some((v) => v > '20260928000000' && v < '20260929000000'),
      'no migration may sort between 20260928000000 and 20260929000000'
    );
  });

  await test('E5. static SQL sanity: balanced dollar-quotes, DO/END pairs and parentheses', () => {
    const dollars = (hardeningSrc.match(/\$\$/g) || []).length;
    assert.strictEqual(dollars % 2, 0, `unbalanced $$ markers: ${dollars}`);
    const dos = (hardening.match(/\bDO\s+\$\$/gi) || []).length;
    const ends = (hardening.match(/\bEND\s+\$\$;/gi) || []).length;
    assert.strictEqual(dos, ends, `DO (${dos}) / END $$ (${ends}) mismatch`);
    assert.ok(dos >= 2, 'expected a guarded DROP/CREATE block and a verification block');
    let depth = 0;
    for (const ch of hardening) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      assert.ok(depth >= 0, 'parenthesis underflow');
    }
    assert.strictEqual(depth, 0, 'unbalanced parentheses');
  });

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`STEP 32 Policy Hardening Results: ${passed} passed, ${total - passed} failed, ${total} total`);
  console.log('======================================================');
  process.exit(passed === total ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
