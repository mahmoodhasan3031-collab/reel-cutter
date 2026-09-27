const path = require('path');
const fs = require('fs');
const assert = require('assert');

// ─── Test runner ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
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
    failed++;
  }
}

// ─── Source files ────────────────────────────────────────────────────────────
const MIGRATION_FILE = '20261001000000_grant_service_role_manual_payment_access.sql';
const PREVIOUS_MIGRATION = '20260930000000_fix_manual_payment_authenticated_select_policy.sql';
const BASE_MIGRATION = '20260926000000_create_manual_payments_and_audit_log.sql';

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
const migrationPath = path.join(migrationsDir, MIGRATION_FILE);

let migrationSrc = '';
try {
  migrationSrc = fs.readFileSync(migrationPath, 'utf8');
} catch {
  migrationSrc = '';
}

// Strip comments (so prose cannot satisfy assertions).
function stripComments(sql) {
  return sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
}

const sql = stripComments(migrationSrc);

// Splits the comment-stripped body into non-empty SQL statements.
function statementsOf(s) {
  return s
    .split(';')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Parses "GRANT <privs> ON TABLE <table> TO <grantee>;" statements.
function parseGrants(s) {
  const out = [];
  const re = /GRANT\s+([A-Za-z,\s]+?)\s+ON\s+TABLE\s+([A-Za-z0-9_."]+)\s+TO\s+([A-Za-z0-9_]+)\s*;/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push({
      privileges: m[1]
        .split(',')
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean)
        .sort(),
      table: m[2].toLowerCase(),
      grantee: m[3].toLowerCase(),
    });
  }
  return out;
}

const EXPECTED_GRANTS = [
  {
    table: 'public.manual_payments',
    grantee: 'service_role',
    privileges: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  },
  {
    table: 'public.audit_log',
    grantee: 'service_role',
    privileges: ['INSERT', 'SELECT'],
  },
];

function sameGrantSet(actual, expected) {
  const key = (g) => `${g.table}|${g.grantee}|${g.privileges.join(',')}`;
  const a = actual.map(key).sort();
  const b = expected.map(key).sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─── Optional live idempotency check (LOCAL dev container only) ─────────────
// Runs the migration twice inside one transaction and ROLLS BACK, so nothing
// is persisted. Skipped when the local container is unavailable.
const LOCAL_CONTAINER = 'supabase_db_reel-cutter';

function runLocalOnce(transactionSql) {
  const { spawnSync } = require('child_process');
  return spawnSync(
    'docker',
    ['exec', '-i', LOCAL_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: transactionSql, encoding: 'utf8', timeout: 60000 }
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('\nSTEP 46C — service_role grant migration focused test\n');

  await test('G1. migration file exists', () => {
    assert.ok(migrationSrc.length > 0, `missing file supabase/migrations/${MIGRATION_FILE}`);
  });

  await test('G2. migration ordering: sorts immediately after 20260930000000 and is the newest migration', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    assert.ok(files.includes(MIGRATION_FILE), 'file not present in migrations directory');
    assert.ok(files.includes(PREVIOUS_MIGRATION), 'previous migration not found');
    assert.ok(MIGRATION_FILE > PREVIOUS_MIGRATION, 'new migration does not sort after 20260930000000');
    assert.strictEqual(files[files.length - 1], MIGRATION_FILE, 'new migration is not the last (newest) file');
    const idxPrev = files.indexOf(PREVIOUS_MIGRATION);
    assert.strictEqual(files[idxPrev + 1], MIGRATION_FILE, 'no migration should sit between 0930 and this one');
  });

  await test('G3. comment-stripped body contains exactly 2 statements, both GRANT', () => {
    const stmts = statementsOf(sql);
    assert.strictEqual(stmts.length, 2, `expected 2 statements, found ${stmts.length}: ${stmts.join(' | ')}`);
    for (const s of stmts) {
      assert.ok(/^GRANT\s/i.test(s), `statement is not a GRANT: ${s}`);
    }
  });

  await test('G4. grants match the exact intended service_role privileges', () => {
    const grants = parseGrants(sql);
    assert.strictEqual(grants.length, 2, `expected 2 parsed GRANTs, found ${grants.length}`);
    assert.ok(sameGrantSet(grants, EXPECTED_GRANTS),
      `grant mismatch:\n    actual:   ${JSON.stringify(grants)}\n    expected: ${JSON.stringify(EXPECTED_GRANTS)}`);
  });

  await test('G5. no table privileges granted to anon, authenticated or PUBLIC', () => {
    assert.ok(!/TO\s+(anon|authenticated|public)\b/i.test(sql),
      'found a GRANT targeting anon/authenticated/PUBLIC');
    const grantees = parseGrants(sql).map((g) => g.grantee);
    for (const g of grantees) {
      assert.ok(['service_role'].includes(g), `unexpected grantee: ${g}`);
    }
  });

  await test('G6. no WITH GRANT OPTION (service_role cannot re-grant)', () => {
    assert.ok(!/WITH\s+GRANT\s+OPTION/i.test(sql), 'WITH GRANT OPTION is not allowed');
  });

  await test('G7. no schema/structure/RLS/policy/function/trigger changes', () => {
    assert.ok(!/\b(CREATE|ALTER|DROP|TRUNCATE|REVOKE)\b/i.test(sql),
      'found a CREATE/ALTER/DROP/TRUNCATE/REVOKE statement');
    assert.ok(!/\bPOLICY\b/i.test(sql), 'must not touch policies');
    assert.ok(!/ROW\s+LEVEL\s+SECURITY/i.test(sql), 'must not touch RLS');
    assert.ok(!/\bFUNCTION\b/i.test(sql), 'must not touch RPCs/functions');
    assert.ok(!/\bTRIGGER\b/i.test(sql), 'must not touch triggers');
    assert.ok(!/\b(INDEX|CONSTRAINT|COMMENT ON)\b/i.test(sql), 'must not touch indexes/constraints/comments');
  });

  await test('G8. dependency on 20260926 documented (tables must exist first)', () => {
    assert.ok(migrationSrc.includes('20260926000000'), 'header must reference the base migration dependency');
    assert.ok(migrationSrc.includes(BASE_MIGRATION.slice(0, 13)) || migrationSrc.includes('20260926000000'),
      'base migration id missing');
  });

  await test('G9. base migration still issues no GRANT (revokes intact, no drift)', () => {
    const baseSrc = fs.readFileSync(path.join(migrationsDir, BASE_MIGRATION), 'utf8');
    const baseSql = stripComments(baseSrc);
    assert.ok(!/^\s*GRANT\b/im.test(baseSql), '20260926 must remain grant-free');
    assert.ok(/REVOKE\s+SELECT\s+ON\s+public\.manual_payments\s+FROM\s+anon/i.test(baseSql),
      '20260926 anon REVOKE missing');
  });

  await test('G10. GRANT is idempotent: file applied twice in one transaction succeeds (local, rolled back)', () => {
    if (!migrationSrc) {
      throw new Error('migration file missing — cannot test idempotency');
    }
    const txn = `BEGIN;\n${migrationSrc}\n${migrationSrc}\nROLLBACK;`;
    let res;
    try {
      res = runLocalOnce(txn);
    } catch (err) {
      console.log(`      (skipped — local container unavailable: ${err.message})`);
      return;
    }
    if (res.error && res.error.code === 'ENOENT') {
      console.log('      (skipped — docker CLI not available)');
      return;
    }
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    if (/No such container|error during connect/i.test(out) || res.status !== 0 && /docker/i.test(out)) {
      console.log('      (skipped — local dev container not running)');
      return;
    }
    assert.strictEqual(res.status, 0, `psql failed (not idempotent?): ${out.slice(0, 500)}`);
    assert.ok(!/ERROR/i.test(out), `psql reported an error: ${out.slice(0, 500)}`);
    assert.ok(/ROLLBACK/.test(out), 'transaction did not roll back as intended');
  });

  console.log(`\nSTEP 46C Service-Role Grant Results: ${passed} passed, ${failed} failed, ${total} total\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
