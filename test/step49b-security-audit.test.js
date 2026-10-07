const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { execSync } = require('child_process');

// ─── Test runner ─────────────────────────────────────────────────────────────
let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const serverFiles = walk(path.join(root, 'server'), ['.js']);
const clientFiles = walk(path.join(root, 'src'), ['.js', '.ts']);
const websiteFiles = walk(path.join(root, 'website', 'src'), ['.ts', '.tsx', '.js']);
const migrationFiles = walk(path.join(root, 'supabase', 'migrations'), ['.sql']);

const webhookSrc = read(path.join('server', 'routes', 'webhook.js'));
const supabaseClientSrc = read(path.join('src', 'main', 'license', 'supabaseClient.js'));
const preloadSrc = read(path.join('src', 'preload', 'index.js'));
const viteConfigSrc = read('electron.vite.config.mjs');

// ─── Run tests ───────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n======================================================');
  console.log('🔒 STEP 49B — Supabase License Security Re-Audit Tests');
  console.log('======================================================\n');

  // ─── A. LOGGING PRIVACY ────────────────────────────────────────────────────
  console.log('─── A. Logging Privacy ───');

  await test('A1. No server console call interpolates a raw license key', () => {
    const offenders = [];
    for (const file of serverFiles) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!/console\.(log|info|warn|error|debug)\s*\(/.test(line)) return;
        const rawKeyLog = /\$\{[^}]*(license_key|licenseKey)[^}]*\}/.test(line);
        if (rawKeyLog && !line.includes('maskLicenseKey(')) {
          offenders.push(`${path.relative(root, file)}:${i + 1}`);
        }
      });
    }
    assert.deepStrictEqual(offenders, [], `raw license key logged: ${offenders.join(', ')}`);
  });

  await test('A2. webhook duplicate log masks the license key', () => {
    assert.ok(webhookSrc.includes('function maskLicenseKey'), 'maskLicenseKey helper must exist');
    assert.ok(
      webhookSrc.includes('already has license ${maskLicenseKey(existing.license_key)}'),
      'duplicate-webhook log must mask the license key'
    );
  });

  await test('A3. Electron client never logs HWID or license key values', () => {
    const offenders = [];
    for (const file of clientFiles) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!/console\.(log|info|warn|error|debug)\s*\(/.test(line)) return;
        if (/\$\{[^}]*(hwid|Hwid|licenseKey|LicenseKey|rawKey)[^}]*\}/.test(line)) {
          offenders.push(`${path.relative(root, file)}:${i + 1}`);
        }
      });
    }
    assert.deepStrictEqual(offenders, [], `sensitive value logged by client: ${offenders.join(', ')}`);
  });

  // ─── B. CLIENT SUPABASE SURFACE ────────────────────────────────────────────
  console.log('─── B. Client License-Data Surface ───');

  await test('B1. supabaseClient.js is backend-API-only (no direct database access)', () => {
    // STEP 76: client no longer calls Supabase at all — HTTP only, via the
    // backend's /api/license/* endpoints.
    assert.ok(!supabaseClientSrc.includes('.rpc('), 'no RPC calls allowed');
    assert.ok(!/\.from\(['"]/.test(supabaseClientSrc), 'no .from() table access allowed');
    assert.ok(!supabaseClientSrc.includes('SUPABASE_SERVICE_ROLE_KEY'), 'no service-role key reference');
    assert.ok(!supabaseClientSrc.includes('SUPABASE_ANON_KEY'), 'no anon key reference');
    assert.ok(!supabaseClientSrc.includes('@supabase/supabase-js'), 'no Supabase SDK import');
    assert.ok(supabaseClientSrc.includes('/api/license/'), 'license traffic must go through the backend API');
  });

  await test('B2. Preload exposes IPC only — no Supabase client or service-role key', () => {
    assert.ok(!preloadSrc.includes('SERVICE_ROLE_KEY'), 'no service-role key in preload');
    assert.ok(!preloadSrc.includes('serviceRoleKey'), 'no serviceRoleKey in preload');
    assert.ok(!preloadSrc.includes('createClient'), 'no Supabase client created in preload');
  });

  await test('B3. No service-role reference anywhere in client or website source', () => {
    const offenders = [];
    for (const file of [...clientFiles, ...websiteFiles]) {
      const src = fs.readFileSync(file, 'utf8');
      if (/SUPABASE_SERVICE_ROLE|serviceRoleKey|sb_secret_/.test(src)) {
        offenders.push(path.relative(root, file));
      }
    }
    assert.deepStrictEqual(offenders, [], `service-role reference found: ${offenders.join(', ')}`);
  });

  // ─── C. MIGRATION CHAIN ────────────────────────────────────────────────────
  console.log('─── C. Migration Chain ───');

  await test('C1. Migrations only GRANT EXECUTE on functions or table privileges to service_role (never anon/authenticated)', () => {
    const bad = [];
    for (const file of migrationFiles) {
      fs.readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (!/^\s*GRANT/i.test(line)) return;
          const isExecuteOnFunction = /^\s*GRANT\s+EXECUTE\s+ON\s+FUNCTION/i.test(line);
          // STEP 46C: table privileges may be granted to service_role only.
          const isServiceRoleTableGrant =
            /^\s*GRANT\s+[A-Z_,\s]+\s+ON\s+TABLE\s+[\w."]+\s+TO\s+service_role\s*;/i.test(line);
          const targetsOpenRole =
            /^\s*GRANT\s+[A-Z_,\s]+\s+ON\s+TABLE\b[^;]*\bTO\s+(anon|authenticated|public)\b/i.test(line);
          if ((!isExecuteOnFunction && !isServiceRoleTableGrant) || targetsOpenRole) {
            bad.push(`${path.basename(file)}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    assert.deepStrictEqual(bad, [], `unexpected GRANT: ${bad.join(' | ')}`);
  });

  await test('C2. Step 16A revokes all four DML verbs on licenses from anon', () => {
    const step16a = read(path.join('supabase', 'migrations', '20260916000000_isolate_client_service_role.sql'));
    for (const verb of ['SELECT', 'UPDATE', 'INSERT', 'DELETE']) {
      assert.ok(
        new RegExp(`REVOKE\\s+${verb}\\s+ON\\s+public\\.licenses\\s+FROM\\s+anon`, 'i').test(step16a),
        `missing REVOKE ${verb} ... FROM anon`
      );
    }
  });

  await test('C3. Every real SECURITY DEFINER function in migrations pins search_path', () => {
    const bad = [];
    for (const file of migrationFiles) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      const createsDefiner = lines.some(
        (line) => !/^\s*--/.test(line) && /SECURITY DEFINER/i.test(line)
      );
      if (createsDefiner && !/SET\s+search_path/i.test(fs.readFileSync(file, 'utf8'))) {
        bad.push(path.basename(file));
      }
    }
    assert.deepStrictEqual(bad, [], `SECURITY DEFINER without search_path: ${bad.join(', ')}`);
  });

  await test('C4. fetch_license_by_key returns only the 7 safe columns', () => {
    const step16a = read(path.join('supabase', 'migrations', '20260916000000_isolate_client_service_role.sql'));
    const m = step16a.match(
      /CREATE OR REPLACE FUNCTION public\.fetch_license_by_key[\s\S]*?RETURNS TABLE[\s\S]*?\)\s*LANGUAGE/i
    );
    assert.ok(m, 'fetch_license_by_key definition not found');
    const def = m[0];
    const sensitive = [
      'customer_email',
      'transaction_id',
      'payment_provider',
      'email_status',
      'user_id',
      'stripe_',
      'hwid_hash',
    ];
    for (const col of sensitive) {
      assert.ok(!def.includes(col), `RPC output must not contain ${col}`);
    }
    for (const col of ['id', 'license_key', 'hwid', 'tier', 'status', 'created_at', 'updated_at']) {
      assert.ok(def.includes(col), `RPC output must contain ${col}`);
    }
  });

  await test('C5. RLS is enabled by migrations on licenses, manual_payments, audit_log', () => {
    const all = migrationFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    for (const table of ['licenses', 'manual_payments', 'audit_log']) {
      assert.ok(
        new RegExp(
          `ALTER TABLE\\s+public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`,
          'i'
        ).test(all),
        `RLS not enabled on ${table}`
      );
    }
  });

  await test('C6. No migration policy is ever granted to anon', () => {
    const bad = [];
    for (const file of migrationFiles) {
      const src = fs.readFileSync(file, 'utf8');
      const policies = src.match(/CREATE POLICY[\s\S]*?;/gi) || [];
      for (const p of policies) {
        if (/\bTO\s+anon\b/i.test(p)) bad.push(path.basename(file));
      }
    }
    assert.deepStrictEqual(bad, [], `anon policy found in: ${bad.join(', ')}`);
  });

  // ─── D. PACKAGING & SECRET MANAGEMENT ──────────────────────────────────────
  console.log('─── D. Packaging & Secret Management ───');

  await test('D1. Vite build injects backend API URL only — never any key', () => {
    // STEP 76: no Supabase credentials (not even the anon key) are bundled
    // into the client build.
    assert.ok(viteConfigSrc.includes('__API_BASE_URL__'), 'backend API base URL must be injected');
    assert.ok(!viteConfigSrc.includes('__SUPABASE_ANON_KEY__'), 'build must not inject any Supabase key');
    assert.ok(!viteConfigSrc.includes('__SUPABASE_URL__'), 'build must not inject a Supabase project URL');
    assert.ok(!/SERVICE_ROLE/i.test(viteConfigSrc), 'build must not inject service-role key');
  });

  await test('D2. server/.env is git-ignored and never tracked', () => {
    const ignored = execSync('git check-ignore -q server/.env && echo IGNORED || echo TRACKED', {
      cwd: root,
      shell: process.env.ComSpec || 'cmd.exe',
    })
      .toString()
      .trim();
    assert.strictEqual(ignored, 'IGNORED', 'server/.env must be git-ignored');
    const tracked = execSync('git ls-files server/.env', {
      cwd: root,
      shell: process.env.ComSpec || 'cmd.exe',
    })
      .toString()
      .trim();
    assert.strictEqual(tracked, '', 'server/.env must not be tracked');
  });

  await test('D3. No live secrets committed in source or server code', () => {
    const scanDirs = [
      path.join(root, 'src'),
      path.join(root, 'website', 'src'),
      path.join(root, 'server'),
      path.join(root, 'extension', 'src'),
    ];
    const offenders = [];
    for (const dir of scanDirs) {
      for (const file of walk(dir, ['.js', '.ts', '.tsx', '.mjs', '.cjs'])) {
        const src = fs.readFileSync(file, 'utf8');
        if (/sk_live_[A-Za-z0-9]{8,}/.test(src)) offenders.push(`${path.relative(root, file)}: sk_live_`);
        if (/eyJhbGciOi[A-Za-z0-9_-]{10,}/.test(src)) offenders.push(`${path.relative(root, file)}: jwt`);
        if (/whsec_[A-Za-z0-9]{16,}/.test(src)) offenders.push(`${path.relative(root, file)}: whsec_`);
      }
    }
    assert.deepStrictEqual(offenders, [], `committed secret found: ${offenders.join(', ')}`);
  });

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`📊 STEP 49B Security Audit Results: ${passed} passed, ${total - passed} failed, ${total} total`);
  console.log('======================================================\n');

  process.exit(total - passed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
