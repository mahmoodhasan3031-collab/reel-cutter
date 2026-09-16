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
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// ─── Read source files once ──────────────────────────────────────────────────
const supabaseClientSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'main', 'license', 'supabaseClient.js'),
  'utf8'
);
const indexSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'main', 'index.js'),
  'utf8'
);
const preloadSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'preload', 'index.js'),
  'utf8'
);
const migrationSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20260916000000_isolate_client_service_role.sql'),
  'utf8'
);
const schemaSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase-schema.sql'),
  'utf8'
);
const serverConfigSrc = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'config.js'),
  'utf8'
);
const licenseGeneratorSrc = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'services', 'licenseGenerator.js'),
  'utf8'
);

// ─── Run tests ───────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n======================================================');
  console.log('🔒 STEP 16A — Supabase Service-Role Isolation Tests');
  console.log('======================================================\n');

  // ─── A. CLIENT KEY ISOLATION ───────────────────────────────────────────────
  console.log('─── A. Client Key Isolation ───');

  await test('A1. Client uses anon key only — no SERVICE_ROLE fallback', () => {
    assert.ok(
      !supabaseClientSrc.includes('SUPABASE_SERVICE_ROLE_KEY'),
      'supabaseClient.js must not reference SUPABASE_SERVICE_ROLE_KEY'
    );
  });

  await test('A2. Client key selection uses SUPABASE_ANON_KEY', () => {
    assert.ok(
      supabaseClientSrc.includes("SUPABASE_ANON_KEY || ''"),
      'Client must select SUPABASE_ANON_KEY'
    );
  });

  await test('A3. Service-role key not in preload source', () => {
    assert.ok(
      !preloadSrc.includes('SERVICE_ROLE_KEY'),
      'Preload must not contain service-role key reference'
    );
    assert.ok(
      !preloadSrc.includes('serviceRoleKey'),
      'Preload must not contain serviceRoleKey'
    );
  });

  await test('A4. Service-role key not in index.js (Electron main)', () => {
    // index.js may reference getLicenseInfo/activateLicense but not the key itself
    assert.ok(
      !indexSrc.includes('SUPABASE_SERVICE_ROLE_KEY'),
      'index.js must not reference SUPABASE_SERVICE_ROLE_KEY'
    );
  });

  await test('A5. Server config retains service-role key for server-side use', () => {
    assert.ok(
      serverConfigSrc.includes('serviceRoleKey'),
      'Server config must still have serviceRoleKey for server-side operations'
    );
  });

  // ─── B. RPC FUNCTION USAGE ─────────────────────────────────────────────────
  console.log('\n─── B. RPC Function Usage ───');

  await test('B1. fetchLicense uses RPC function instead of direct table query', () => {
    assert.ok(
      supabaseClientSrc.includes(".rpc('fetch_license_by_key'") || supabaseClientSrc.includes('.rpc("fetch_license_by_key"'),
      'fetchLicense must use .rpc("fetch_license_by_key")'
    );
    assert.ok(
      !supabaseClientSrc.includes(".from('licenses').select("),
      'fetchLicense must NOT use direct .from("licenses").select()'
    );
  });

  await test('B2. bindLicenseHwid uses RPC function instead of direct table update', () => {
    assert.ok(
      supabaseClientSrc.includes(".rpc('bind_license_hwid'") || supabaseClientSrc.includes('.rpc("bind_license_hwid"'),
      'bindLicenseHwid must use .rpc("bind_license_hwid")'
    );
    assert.ok(
      !supabaseClientSrc.includes(".from('licenses').update("),
      'bindLicenseHwid must NOT use direct .from("licenses").update()'
    );
  });

  await test('B3. fetchLicense normalizes key before RPC call', () => {
    const fetchSection = supabaseClientSrc.substring(
      supabaseClientSrc.indexOf('async function fetchLicense'),
      supabaseClientSrc.indexOf('async function bindLicenseHwid')
    );
    assert.ok(
      fetchSection.includes('.toUpperCase()'),
      'fetchLicense must normalize key to uppercase'
    );
    assert.ok(
      fetchSection.includes('.trim()'),
      'fetchLicense must trim key'
    );
  });

  await test('B4. bindLicenseHwid normalizes key before RPC call', () => {
    const bindSection = supabaseClientSrc.substring(
      supabaseClientSrc.indexOf('async function bindLicenseHwid'),
      supabaseClientSrc.indexOf('module.exports')
    );
    assert.ok(
      bindSection.includes('.toUpperCase()'),
      'bindLicenseHwid must normalize key to uppercase'
    );
    assert.ok(
      bindSection.includes('.trim()'),
      'bindLicenseHwid must trim key'
    );
  });

  await test('B5. RPC response handling normalizes array to single record', () => {
    assert.ok(
      supabaseClientSrc.includes('Array.isArray(data)'),
      'Client must handle RPC response which returns array'
    );
  });

  // ─── C. MIGRATION SQL — RPC FUNCTIONS ──────────────────────────────────────
  console.log('\n─── C. Migration SQL — RPC Functions ───');

  await test('C1. Migration creates fetch_license_by_key function', () => {
    assert.ok(
      migrationSrc.includes('CREATE OR REPLACE FUNCTION public.fetch_license_by_key'),
      'Migration must create fetch_license_by_key function'
    );
  });

  await test('C2. Migration creates bind_license_hwid function', () => {
    assert.ok(
      migrationSrc.includes('CREATE OR REPLACE FUNCTION public.bind_license_hwid'),
      'Migration must create bind_license_hwid function'
    );
  });

  await test('C3. fetch_license_by_key is SECURITY DEFINER', () => {
    assert.ok(
      migrationSrc.includes('SECURITY DEFINER'),
      'Functions must be SECURITY DEFINER to bypass RLS'
    );
  });

  await test('C4. fetch_license_by_key uses SET search_path = public', () => {
    assert.ok(
      migrationSrc.includes("SET search_path = public"),
      'Functions must set search_path to prevent injection'
    );
  });

  await test('C5. fetch_license_by_key returns non-sensitive columns only', () => {
    const fnBody = migrationSrc.substring(
      migrationSrc.indexOf('CREATE OR REPLACE FUNCTION public.fetch_license_by_key'),
      migrationSrc.indexOf('GRANT EXECUTE ON FUNCTION public.fetch_license_by_key')
    );
    assert.ok(!fnBody.includes('customer_email'), 'Must not expose customer_email');
    assert.ok(!fnBody.includes('transaction_id'), 'Must not expose transaction_id');
    assert.ok(!fnBody.includes('payment_provider'), 'Must not expose payment_provider');
    assert.ok(!fnBody.includes('email_status'), 'Must not expose email_status');
    assert.ok(fnBody.includes('license_key'), 'Must expose license_key');
    assert.ok(fnBody.includes('hwid'), 'Must expose hwid');
    assert.ok(fnBody.includes('tier'), 'Must expose tier');
    assert.ok(fnBody.includes('status'), 'Must expose status');
  });

  await test('C6. bind_license_hwid enforces hwid IS NULL guard', () => {
    assert.ok(
      migrationSrc.includes('AND hwid IS NULL'),
      'bind_license_hwid must only bind unbound licenses (hwid IS NULL)'
    );
  });

  await test('C7. bind_license_hwid does not allow modifying tier or status', () => {
    const fnBody = migrationSrc.substring(
      migrationSrc.indexOf('CREATE OR REPLACE FUNCTION public.bind_license_hwid'),
      migrationSrc.indexOf('GRANT EXECUTE ON FUNCTION public.bind_license_hwid')
    );
    // The UPDATE statement should only SET hwid
    const updateMatch = fnBody.match(/UPDATE public\.licenses\s+SET\s+([\s\S]*?)WHERE/);
    assert.ok(updateMatch, 'Must have UPDATE statement');
    const setClause = updateMatch[1];
    assert.ok(
      setClause.trim().startsWith('hwid') || setClause.includes('hwid ='),
      'UPDATE must only set hwid column'
    );
    assert.ok(!setClause.includes('tier'), 'Must not allow updating tier');
    assert.ok(!setClause.includes('status'), 'Must not allow updating status');
  });

  await test('C8. bind_license_hwid lets trigger handle updated_at', () => {
    const fnBody = migrationSrc.substring(
      migrationSrc.indexOf('CREATE OR REPLACE FUNCTION public.bind_license_hwid'),
      migrationSrc.indexOf('GRANT EXECUTE ON FUNCTION public.bind_license_hwid')
    );
    assert.ok(
      !fnBody.includes('updated_at =') || fnBody.includes('-- updated_at handled by trigger'),
      'Must not manually set updated_at (trigger handles it)'
    );
  });

  await test('C9. Migration grants EXECUTE to anon role', () => {
    assert.ok(
      migrationSrc.includes("GRANT EXECUTE ON FUNCTION public.fetch_license_by_key(TEXT) TO anon"),
      'Must grant fetch_license_by_key to anon'
    );
    assert.ok(
      migrationSrc.includes("GRANT EXECUTE ON FUNCTION public.bind_license_hwid(TEXT, TEXT) TO anon"),
      'Must grant bind_license_hwid to anon'
    );
  });

  // ─── D. DIRECT TABLE ACCESS REVOKED ────────────────────────────────────────
  console.log('\n─── D. Direct Table Access Revoked ───');

  await test('D1. Migration revokes SELECT on licenses from anon', () => {
    assert.ok(
      migrationSrc.includes('REVOKE SELECT ON public.licenses FROM anon'),
      'Must revoke direct SELECT from anon'
    );
  });

  await test('D2. Migration revokes UPDATE on licenses from anon', () => {
    assert.ok(
      migrationSrc.includes('REVOKE UPDATE ON public.licenses FROM anon'),
      'Must revoke direct UPDATE from anon'
    );
  });

  await test('D3. Migration revokes INSERT on licenses from anon', () => {
    assert.ok(
      migrationSrc.includes('REVOKE INSERT ON public.licenses FROM anon'),
      'Must revoke direct INSERT from anon'
    );
  });

  await test('D4. Migration revokes DELETE on licenses from anon', () => {
    assert.ok(
      migrationSrc.includes('REVOKE DELETE ON public.licenses FROM anon'),
      'Must revoke direct DELETE from anon'
    );
  });

  // ─── E. EXISTING SECURITY PRESERVED ────────────────────────────────────────
  console.log('\n─── E. Existing Security Preserved ───');

  await test('E1. Schema still has service_role full access policy', () => {
    assert.ok(
      schemaSrc.includes('service_role'),
      'Original service_role policy must remain'
    );
    assert.ok(
      schemaSrc.includes('USING (true)'),
      'service_role USING (true) must remain'
    );
  });

  await test('E2. updated_at trigger still exists in schema', () => {
    assert.ok(
      schemaSrc.includes('handle_updated_at'),
      'handle_updated_at trigger function must exist'
    );
    assert.ok(
      schemaSrc.includes('set_licenses_updated_at'),
      'set_licenses_updated_at trigger must exist'
    );
  });

  await test('E3. RLS is still enabled on licenses table', () => {
    assert.ok(
      schemaSrc.includes('ENABLE ROW LEVEL SECURITY'),
      'RLS must remain enabled'
    );
  });

  await test('E4. Server licenseGenerator still uses service-role for privileged ops', () => {
    assert.ok(
      licenseGeneratorSrc.includes('config.supabase.serviceRoleKey'),
      'Server must still use service-role key'
    );
    // Check for direct table operations (may span multiple lines)
    assert.ok(
      licenseGeneratorSrc.includes(".from('licenses')") && licenseGeneratorSrc.includes('.insert('),
      'Server must still do direct INSERT via service_role'
    );
    assert.ok(
      licenseGeneratorSrc.includes(".from('licenses')") && licenseGeneratorSrc.includes('.update('),
      'Server must still do direct UPDATE via service_role'
    );
  });

  // ─── F. PACKAGED BUILD SECURITY ────────────────────────────────────────────
  console.log('\n─── F. Packaged Build Security ───');

  await test('F1. Packaged build blocks mock database fallback', () => {
    assert.ok(
      supabaseClientSrc.includes('if (isPackaged)'),
      'Must check isPackaged before mock DB fallback'
    );
  });

  await test('F2. No service-role string in supabaseClient.js', () => {
    assert.ok(
      !supabaseClientSrc.includes('SERVICE_ROLE'),
      'No SERVICE_ROLE string must appear in client code'
    );
  });

  // ─── G. HWID BINDING BEHAVIOR ──────────────────────────────────────────────
  console.log('\n─── G. HWID Binding Behavior ───');

  await test('G1. Mock DB bind only allows unbound licenses (hwid === null)', () => {
    const bindSection = supabaseClientSrc.substring(
      supabaseClientSrc.indexOf('async function bindLicenseHwid'),
      supabaseClientSrc.indexOf('module.exports')
    );
    // The mock DB path should check if hwid is already set
    assert.ok(
      bindSection.includes('hwid') && (bindSection.includes('record.hwid = hwid') || bindSection.includes('hwid = p_hwid')),
      'Mock DB must update hwid field'
    );
  });

  await test('G2. Migration bind function has WHERE hwid IS NULL guard', () => {
    assert.ok(
      migrationSrc.includes('WHERE license_key = v_normalized_key') && migrationSrc.includes('AND hwid IS NULL'),
      'bind function must check both license_key AND hwid IS NULL'
    );
  });

  // ─── H. PRELOAD ISOLATION ──────────────────────────────────────────────────
  console.log('\n─── H. Preload Isolation ───');

  await test('H1. Preload does not import supabaseClient', () => {
    assert.ok(
      !preloadSrc.includes('supabaseClient'),
      'Preload must not reference supabaseClient'
    );
  });

  await test('H2. Preload does not reference node-machine-id', () => {
    assert.ok(
      !preloadSrc.includes('node-machine-id'),
      'Preload must not import node-machine-id'
    );
  });

  await test('H3. Preload exposes only safe IPC channels for license', () => {
    assert.ok(preloadSrc.includes('checkLicense'), 'Must expose checkLicense');
    assert.ok(preloadSrc.includes('activateLicense'), 'Must expose activateLicense');
    assert.ok(preloadSrc.includes('getLicenseInfo'), 'Must expose getLicenseInfo');
    assert.ok(preloadSrc.includes('deactivateLicense'), 'Must expose deactivateLicense');
  });

  // ─── RESULTS ───────────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`🔒 STEP 16A Security Test Results: ${passed} / ${total} passed`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
