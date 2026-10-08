'use strict';

/**
 * STEP 53 Tests — Production Configuration Contract (P1-1 … P1-5)
 *
 * Covers the five P1 release blockers:
 *   P1-1 website production environment contract (fail closed, no localhost/mock in production)
 *   P1-2 download page version / installer size / release URL
 *   P1-3 Stripe mode is environment-driven and self-consistent
 *   P1-4 Postify extension declares its minimum required permission
 *   P1-5 release provenance (migrations tracked, version + artifact naming)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'website');
const PUBLIC_ENV_TS = path.join(WEB, 'src', 'config', 'publicEnv.ts');
const PUBLIC_ENV_JS = path.join(WEB, 'src', 'config', 'publicEnv.js');
const VERIFY_SCRIPT = path.join(WEB, 'scripts', 'verify-public-env.mjs');
const DOWNLOAD_PAGE = path.join(WEB, 'src', 'app', '(brand)', 'download', 'page.tsx');
const ENV_EXAMPLE = path.join(WEB, '.env.example');

const POSTIFY_ROOT = path.resolve(ROOT, '..', '..', 'clinedt', 'postify');
const EXT_ROOT = path.join(POSTIFY_ROOT, 'extension');

const PUBLIC_VARS = [
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_SERVER_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_STRIPE_MODE',
];

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2705 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u274c ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function skip(name, why) {
  console.log(`  \u23ed ${name} (skipped: ${why})`);
  skipped++;
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function cleanEnv(extra) {
  const env = Object.assign({}, process.env);
  for (const key of PUBLIC_VARS) delete env[key];
  delete env.NODE_ENV;
  return Object.assign(env, extra || {});
}

function runNode(code, env) {
  return spawnSync(process.execPath, ['-e', code], { env, encoding: 'utf8' });
}

function runScript(script, env) {
  return spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
}

const ALL_PUBLIC_ENV_SET = {
  NEXT_PUBLIC_API_BASE_URL: 'https://api.build-check.invalid',
  NEXT_PUBLIC_SUPABASE_URL: 'https://build-check.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-build-check-anon-key',
  NEXT_PUBLIC_STRIPE_MODE: 'test',
};

const LOAD_PUBLIC_ENV = `try {
  const m = require(${JSON.stringify(PUBLIC_ENV_JS)});
  console.log('OK:' + m.PUBLIC_ENV.apiBaseUrl);
} catch (e) {
  console.error(e.message);
  process.exit(3);
}`;

console.log('\n' + '='.repeat(70));
console.log('STEP 53 — Production Configuration Contract Tests');
console.log('='.repeat(70) + '\n');

// ── A. publicEnv contract (P1-1) ────────────────────────────────────────────

console.log('A. publicEnv contract');

test('publicEnv.ts exists and is the single env entry point', () => {
  assert.ok(fs.existsSync(PUBLIC_ENV_TS), 'publicEnv.ts must exist');
  const src = read(PUBLIC_ENV_TS);
  assert.ok(src.includes('function devDefault'), 'must use the devDefault pattern');
  assert.ok(src.includes('NEXT_PUBLIC_API_BASE_URL'), 'must read the API origin');
  assert.ok(src.includes('NEXT_PUBLIC_SUPABASE_URL'), 'must read the Supabase URL');
  assert.ok(src.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'must read the Supabase anon key');
});

test('publicEnv.ts fails closed in production', () => {
  const src = read(PUBLIC_ENV_TS);
  assert.ok(
    src.includes('process.env.NODE_ENV === "production"'),
    'devDefault must gate on NODE_ENV === "production"',
  );
  assert.ok(/localhost and mock fallbacks are disabled in production/.test(src));
});

test('publicEnv.js CJS twin exists and is kept in sync', () => {
  assert.ok(fs.existsSync(PUBLIC_ENV_JS), 'publicEnv.js must exist');
  const ts = read(PUBLIC_ENV_TS);
  const js = read(PUBLIC_ENV_JS);
  for (const name of ['NEXT_PUBLIC_API_BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    assert.ok(js.includes(name), `publicEnv.js must also read ${name}`);
    assert.ok(ts.includes(name), `publicEnv.ts must read ${name}`);
  }
  assert.ok(js.includes('process.env.NODE_ENV === \'production\''), 'twin must fail closed too');
});

test('localhost:3001 lives only in publicEnv.{ts,js}', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && read(full).includes('localhost:3001')) {
        offenders.push(path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(WEB, 'src'));
  const allowed = [
    path.relative(ROOT, PUBLIC_ENV_TS),
    path.relative(ROOT, PUBLIC_ENV_JS),
  ].sort();
  assert.deepStrictEqual(offenders.sort(), allowed, 'unexpected localhost:3001 usages');
});

test('no raw NEXT_PUBLIC reads outside publicEnv and known display config', () => {
  const allowedFiles = new Set([
    'src/config/publicEnv.ts',
    'src/config/publicEnv.js',
    'src/config/payment.ts',
    'src/config/payment.js',
    'src/config/manualPayment.ts',
    'src/config/manualPayment.js',
  ]);
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /process\.env\.NEXT_PUBLIC_/.test(read(full))) {
        const rel = path.relative(WEB, full).split(path.sep).join('/');
        if (!allowedFiles.has(rel)) offenders.push(rel);
      }
    }
  };
  walk(path.join(WEB, 'src'));
  assert.deepStrictEqual(offenders, [], 'unexpected NEXT_PUBLIC reads');
});

test('publicEnv.js holds no secrets', () => {
  const src = read(PUBLIC_ENV_TS) + read(PUBLIC_ENV_JS);
  for (const token of ['sk_live', 'sk_test', 'whsec_', 'service_role', 'SUPABASE_SERVICE_ROLE', 'eyJ']) {
    assert.ok(!src.includes(token), `publicEnv must not contain ${token}`);
  }
});

// ── B. Runtime fail-closed behaviour (P1-1) ─────────────────────────────────

console.log('\nB. Runtime fail-closed behaviour');

test('production load without public env throws a named-variable error', () => {
  const res = runNode(LOAD_PUBLIC_ENV, cleanEnv({ NODE_ENV: 'production' }));
  assert.strictEqual(res.status, 3, `expected failure, got ${res.status}: ${res.stdout}${res.stderr}`);
  assert.ok(
    res.stderr.includes('NEXT_PUBLIC_API_BASE_URL'),
    `error must name the variable, got: ${res.stderr}`,
  );
  assert.ok(res.stderr.includes('production build'), 'error must explain the production build rule');
});

test('production load with public env resolves the configured origin', () => {
  const res = runNode(LOAD_PUBLIC_ENV, cleanEnv(Object.assign({ NODE_ENV: 'production' }, ALL_PUBLIC_ENV_SET)));
  assert.strictEqual(res.status, 0, `expected success, got ${res.status}: ${res.stderr}`);
  assert.strictEqual(res.stdout.trim(), 'OK:https://api.build-check.invalid');
});

test('development load keeps the zero-config localhost fallback', () => {
  const res = runNode(LOAD_PUBLIC_ENV, cleanEnv());
  assert.strictEqual(res.status, 0, `expected success, got ${res.status}: ${res.stderr}`);
  assert.strictEqual(res.stdout.trim(), 'OK:http://localhost:3001');
});

test('NEXT_PUBLIC_SERVER_URL is accepted as an API origin alias', () => {
  const res = runNode(LOAD_PUBLIC_ENV, cleanEnv({ NEXT_PUBLIC_SERVER_URL: 'https://alias.build-check.invalid' }));
  assert.strictEqual(res.status, 0, `expected success, got ${res.status}: ${res.stderr}`);
  assert.strictEqual(res.stdout.trim(), 'OK:https://alias.build-check.invalid');
});

// ── C. build-time gate: scripts/verify-public-env.mjs (P1-1) ───────────────

console.log('\nC. build-time gate (prebuild)');

const strayEnvFiles = fs
  .readdirSync(WEB)
  .filter((name) => /^\.env(\.|$)/.test(name) && name !== '.env.example');

test('prebuild script is wired into website/package.json', () => {
  const pkg = JSON.parse(read(path.join(WEB, 'package.json')));
  assert.strictEqual(
    pkg.scripts.prebuild,
    'node scripts/verify-public-env.mjs',
    'prebuild must run the environment gate',
  );
  assert.strictEqual(pkg.scripts.build, 'next build');
});

test('verify-public-env.mjs exists', () => {
  assert.ok(fs.existsSync(VERIFY_SCRIPT), 'verify-public-env.mjs must exist');
});

if (strayEnvFiles.length > 0) {
  skip('missing-env build must fail', `local env files present: ${strayEnvFiles.join(', ')}`);
  skip('localhost origin must be rejected', `local env files present: ${strayEnvFiles.join(', ')}`);
} else {
  test('missing-env build must fail with a clear, actionable message', () => {
    const res = runScript(VERIFY_SCRIPT, cleanEnv());
    assert.notStrictEqual(res.status, 0, 'verification must fail when the contract is unmet');
    const out = `${res.stdout}${res.stderr}`;
    assert.ok(out.includes('NEXT_PUBLIC_API_BASE_URL'), 'must name the API origin variable');
    assert.ok(out.includes('NEXT_PUBLIC_SUPABASE_URL'), 'must name the Supabase URL variable');
    assert.ok(out.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'must name the Supabase anon key variable');
    assert.ok(out.includes('NEXT_PUBLIC_STRIPE_MODE'), 'must name the Stripe mode variable');
    assert.ok(out.includes('.env.example'), 'must point the operator at .env.example');
  });

  test('localhost API origin is rejected for a production build', () => {
    const res = runScript(
      VERIFY_SCRIPT,
      cleanEnv(Object.assign({}, ALL_PUBLIC_ENV_SET, {
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001',
      })),
    );
    assert.notStrictEqual(res.status, 0, 'localhost origin must fail the build gate');
    assert.ok(`${res.stdout}${res.stderr}`.includes('local development server'));
  });
}

test('invalid Stripe mode fails the build gate', () => {
  const res = runScript(
    VERIFY_SCRIPT,
    cleanEnv(Object.assign({}, ALL_PUBLIC_ENV_SET, { NEXT_PUBLIC_STRIPE_MODE: 'sandbox' })),
  );
  assert.notStrictEqual(res.status, 0, 'an invalid Stripe mode must fail the build gate');
  assert.ok(`${res.stdout}${res.stderr}`.includes('must be "test" or "live"'));
});

test('complete public env passes the build gate', () => {
  const res = runScript(VERIFY_SCRIPT, cleanEnv(Object.assign({}, ALL_PUBLIC_ENV_SET, {
    // Strip the localhost rejection by using a non-local origin.
    NEXT_PUBLIC_API_BASE_URL: 'https://api.build-check.invalid',
  })));
  assert.strictEqual(res.status, 0, `expected success, got ${res.status}: ${res.stdout}${res.stderr}`);
  assert.ok(res.stdout.includes('Public environment OK'));
});

test('build gate never prints secret material', () => {
  const res = runScript(VERIFY_SCRIPT, cleanEnv(Object.assign({}, ALL_PUBLIC_ENV_SET, {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-build-check-anon-key-value',
  })));
  const out = `${res.stdout}${res.stderr}`;
  assert.ok(!out.includes('public-build-check-anon-key-value'), 'gate must not echo key values');
});

// ── D. mock Supabase cannot reach production (P1-1) ─────────────────────────

console.log('\nD. mock Supabase isolation');

for (const rel of ['src/lib/supabase/client.ts', 'src/lib/supabase/server.ts']) {
  test(`${rel} mock is behind a production guard and is marked`, () => {
    const src = read(path.join(WEB, rel));
    assert.ok(
      src.includes('process.env.NODE_ENV !== "production" &&'),
      'mock branch must be gated on NODE_ENV !== "production"',
    );
    assert.ok(src.includes('__mockClient: true'), 'mock must carry the __mockClient marker');
    assert.ok(src.includes('PUBLIC_ENV.supabaseUrl'), 'must read Supabase config from publicEnv');
    assert.ok(!src.includes('localhost:3001'), 'must not embed a localhost fallback');
  });
}

test('middleware reads Supabase config from publicEnv', () => {
  const src = read(path.join(WEB, 'src/lib/supabase/middleware.ts'));
  assert.ok(src.includes('PUBLIC_ENV.supabaseUrl'), 'middleware must use publicEnv');
  assert.ok(src.includes('PUBLIC_ENV.supabaseAnonKey'), 'middleware must use publicEnv');
  assert.ok(!src.includes('NEXT_PUBLIC_SUPABASE_URL!'), 'no non-null-asserted raw env reads');
});

test('account page uses publicEnv instead of a raw localhost fallback', () => {
  const src = read(path.join(WEB, 'src/app/(reelcutter)/account/page.tsx'));
  assert.ok(src.includes('PUBLIC_ENV.apiBaseUrl'), 'must use publicEnv.apiBaseUrl');
  assert.ok(!src.includes('localhost:3001'), 'must not embed a localhost fallback');
});

// ── E. Stripe mode contract (P1-3) ──────────────────────────────────────────

console.log('\nE. Stripe mode contract');

test('payment.ts derives STRIPE_MODE from NEXT_PUBLIC_STRIPE_MODE', () => {
  const src = read(path.join(WEB, 'src/config/payment.ts'));
  assert.ok(src.includes('process.env.NEXT_PUBLIC_STRIPE_MODE'), 'mode must come from env');
  assert.ok(/isLive:\s*STRIPE_MODE === "live"/.test(src), 'isLive must be derived from STRIPE_MODE');
  assert.ok(!/export const STRIPE_MODE = "test" as const/.test(src), 'mode must not be hardcoded');
  assert.ok(src.includes('create-checkout-session'), 'checkout endpoint must stay intact');
});

test('payment.ts fails closed on a missing/invalid mode in production', () => {
  const src = read(path.join(WEB, 'src/config/payment.ts'));
  assert.ok(
    src.includes('NEXT_PUBLIC_STRIPE_MODE must be explicitly set to "test" or "'),
    'production build must require an explicit mode',
  );
});

const LOAD_PAYMENT = `try {
  const m = require(${JSON.stringify(path.join(WEB, 'src', 'config', 'payment.js'))});
  console.log('OK:' + JSON.stringify({ mode: m.PAYMENT_CONFIG.mode, isLive: m.PAYMENT_CONFIG.isLive, currency: m.PAYMENT_CONFIG.currency }));
} catch (e) {
  console.error(e.message);
  process.exit(3);
}`;

test('payment.js defaults to test mode with isLive false', () => {
  const res = runNode(LOAD_PAYMENT, cleanEnv());
  assert.strictEqual(res.status, 0, `expected success, got ${res.status}: ${res.stderr}`);
  const value = JSON.parse(res.stdout.replace(/^OK:/, ''));
  assert.strictEqual(value.mode, 'test');
  assert.strictEqual(value.isLive, false);
  assert.strictEqual(value.currency, 'usd');
});

test('payment.js live mode flips isLive consistently', () => {
  const res = runNode(LOAD_PAYMENT, cleanEnv({ NEXT_PUBLIC_STRIPE_MODE: 'live' }));
  assert.strictEqual(res.status, 0, `expected success, got ${res.status}: ${res.stderr}`);
  const value = JSON.parse(res.stdout.replace(/^OK:/, ''));
  assert.strictEqual(value.mode, 'live');
  assert.strictEqual(value.isLive, true);
});

test('payment.js fails closed in production without an explicit mode', () => {
  const res = runNode(LOAD_PAYMENT, cleanEnv({ NODE_ENV: 'production' }));
  assert.strictEqual(res.status, 3, `expected failure, got ${res.status}: ${res.stdout}${res.stderr}`);
  assert.ok(res.stderr.includes('NEXT_PUBLIC_STRIPE_MODE'));
});

test('payment config exposes no secret material', () => {
  const src = read(path.join(WEB, 'src/config/payment.ts')) + read(path.join(WEB, 'src/config/payment.js'));
  for (const token of ['sk_live_', 'sk_test_', 'whsec_', 'service_role', 'SUPABASE_SERVICE_ROLE', 'LICENSE_SECRET', 'HMAC_SECRET']) {
    assert.ok(!src.includes(token), `payment config must not contain ${token}`);
  }
});

// ── F. download page (P1-2) ─────────────────────────────────────────────────

console.log('\nF. download page');

test('download page advertises v1.0.5', () => {
  const src = read(DOWNLOAD_PAGE);
  assert.ok(src.includes('Reel Cutter v1.0.5'), 'must advertise v1.0.5');
  assert.ok(!src.includes('v1.0.4'), 'must not reference the old v1.0.4 release');
  assert.ok(!src.includes('1.0.4'), 'no 1.0.4 references remain');
});

test('download page links the 1.0.5 installer asset', () => {
  const src = read(DOWNLOAD_PAGE);
  assert.ok(
    src.includes('releases/download/v1.0.5/Reel-Cutter-Setup-1.0.5.exe'),
    'must link Reel-Cutter-Setup-1.0.5.exe',
  );
});

test('download page reports the verified installer size', () => {
  const src = read(DOWNLOAD_PAGE);
  assert.ok(src.includes('274 MB'), 'must state ~274 MB');
  assert.ok(!src.includes('150 MB'), 'stale 150 MB figure must be gone');
});

// ── G. environment contract documentation (P1-1) ────────────────────────────

console.log('\nG. environment contract documentation');

test('.env.example documents the full public contract', () => {
  const src = read(ENV_EXAMPLE);
  for (const name of [
    'NEXT_PUBLIC_SUPABASE_URL=',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=',
    'NEXT_PUBLIC_API_BASE_URL=',
    'NEXT_PUBLIC_SERVER_URL=',
    'NEXT_PUBLIC_STRIPE_MODE=',
  ]) {
    assert.ok(src.includes(name), `.env.example must document ${name}`);
  }
  assert.ok(!src.includes('eyJ'), '.env.example must not contain a JWT');
  assert.ok(!src.includes('sk_'), '.env.example must not contain a Stripe key');
});

test('.gitignore keeps .env* ignored but tracks .env.example', () => {
  const src = read(path.join(WEB, '.gitignore'));
  assert.ok(src.includes('.env*'), '.env* must stay ignored');
  assert.ok(src.includes('!.env.example'), '.env.example must be un-ignored');
});

test('.env.example is tracked by git', () => {
  if (!fs.existsSync(path.join(ROOT, '.git'))) return skipGit();
  const res = spawnSync('git', ['ls-files', '--error-unmatch', 'website/.env.example'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.strictEqual(res.status, 0, `website/.env.example must be tracked: ${res.stderr}`);
  function skipGit() {
    skipped++;
    console.log('  \u23ed website/.env.example is tracked by git (skipped: no .git directory)');
  }
});

test('config consumers use publicEnv for the API origin', () => {
  const consumers = [
    ['src/config/adminApi.ts', 'PUBLIC_ENV.apiBaseUrl'],
    ['src/config/adminApi.js', 'PUBLIC_ENV.apiBaseUrl'],
    ['src/config/manualPayment.ts', 'PUBLIC_ENV.apiBaseUrl'],
    ['src/config/manualPayment.js', 'PUBLIC_ENV.apiBaseUrl'],
    ['src/config/payment.ts', 'PUBLIC_ENV.apiBaseUrl'],
  ];
  for (const [rel, needle] of consumers) {
    const src = read(path.join(WEB, rel));
    assert.ok(src.includes(needle), `${rel} must resolve the API origin via ${needle}`);
    assert.ok(!src.includes('localhost:3001'), `${rel} must not embed a localhost fallback`);
  }
});

// ── H. Postify extension permission (P1-4) ──────────────────────────────────

console.log('\nH. Postify extension permission (P1-4)');

if (!fs.existsSync(EXT_ROOT)) {
  skip('extension manifest declares only the storage permission', 'postify repo not found');
  skip('extension test suite no longer requires an empty permissions array', 'postify repo not found');
} else {
  test('extension manifest declares only the storage permission', () => {
    const manifest = JSON.parse(read(path.join(EXT_ROOT, 'manifest.json')));
    assert.deepStrictEqual(manifest.permissions, ['storage'], 'minimum required permission is storage');
    assert.deepStrictEqual(manifest.host_permissions, ['http://127.0.0.1:8000/*']);
    for (const banned of ['tabs', 'history', 'cookies', 'webRequest', 'debugger']) {
      assert.ok(!manifest.permissions.includes(banned), `${banned} must not be requested`);
    }
  });

  test('extension test suite no longer requires an empty permissions array', () => {
    const src = read(path.join(EXT_ROOT, 'test-extension.cjs'));
    assert.ok(!src.includes('manifest.permissions.length === 0'), 'stale empty-array assertion removed');
    assert.ok(
      src.includes('JSON.stringify(manifest.permissions) === JSON.stringify(["storage"])'),
      'assertion must pin the exact permission set',
    );
  });
}

// ── I. release provenance (P1-5) ────────────────────────────────────────────

console.log('\nI. release provenance (P1-5)');

test('package.json and package-lock.json agree on 1.0.5', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const lock = JSON.parse(read(path.join(ROOT, 'package-lock.json')));
  assert.strictEqual(pkg.version, '1.0.5');
  assert.strictEqual(lock.version, '1.0.5');
  assert.strictEqual(lock.packages[''].version, '1.0.5');
});

test('electron-builder keeps the literal artifactName fix (P0-1)', () => {
  const cfg = read(path.join(ROOT, 'electron-builder.json'));
  assert.ok(cfg.includes('Reel-Cutter-Setup-${version}.${ext}'), 'win/nsis artifactName must stay literal');
  assert.ok(cfg.includes('Reel-Cutter-${version}.${ext}'), 'mac artifactName must stay literal');
  assert.ok(!cfg.includes('${productName}'), 'must not fall back to productName');
});

test('all Supabase migrations are tracked by git', () => {
  if (!fs.existsSync(path.join(ROOT, '.git'))) return;
  const onDisk = fs
    .readdirSync(path.join(ROOT, 'supabase', 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const res = spawnSync('git', ['ls-files', '--', 'supabase/migrations'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.strictEqual(res.status, 0, res.stderr);
  const tracked = res.stdout.split(/\r?\n/).filter(Boolean).map((line) => path.basename(line)).sort();
  assert.deepStrictEqual(tracked, onDisk, 'every migration on disk must be tracked');
  assert.strictEqual(tracked.length, 8, `expected 8 tracked migrations, got ${tracked.length}`);
});

// ── summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log(`STEP 53 results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log('='.repeat(70));

if (failed > 0) process.exit(1);
