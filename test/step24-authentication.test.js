'use strict';

/**
 * STEP 24 Tests — Customer Account & Authentication Foundation
 *
 * Tests auth configuration, page existence, security checks,
 * and code structure for the authentication system.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 24 — Customer Account & Authentication Foundation Tests');
console.log('═══════════════════════════════════════════════════════════════\n');

const websiteDir = path.join(__dirname, '..', 'website');

// ─── 1. Auth Configuration ─────────────────────────────────────────────────

console.log('── 1. Auth Configuration ──');

test('Supabase SSR package is installed', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(websiteDir, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@supabase/ssr'], '@supabase/ssr should be in dependencies');
  assert.ok(pkg.dependencies['@supabase/supabase-js'], '@supabase/supabase-js should be in dependencies');
});

test('Supabase client.ts exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/lib/supabase/client.ts')));
});

test('Supabase server.ts exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/lib/supabase/server.ts')));
});

test('Supabase middleware.ts exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/lib/supabase/middleware.ts')));
});

test('Middleware exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/middleware.ts')));
});

// ─── 2. Environment Variables ──────────────────────────────────────────────

console.log('\n── 2. Environment Variables ──');

test('.env.example exists with required variables', () => {
  const envExample = fs.readFileSync(path.join(websiteDir, '.env.example'), 'utf8');
  assert.ok(envExample.includes('NEXT_PUBLIC_SUPABASE_URL='), 'Should have NEXT_PUBLIC_SUPABASE_URL');
  assert.ok(envExample.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY='), 'Should have NEXT_PUBLIC_SUPABASE_ANON_KEY');
});

test('.env.example does not contain real secrets', () => {
  const envExample = fs.readFileSync(path.join(websiteDir, '.env.example'), 'utf8');
  assert.ok(!envExample.includes('eyJ'), 'Should not contain JWT tokens');
  assert.ok(!envExample.includes('sk_'), 'Should not contain Stripe secret keys');
});

test('.gitignore protects environment files', () => {
  const gitignore = fs.readFileSync(path.join(websiteDir, '.gitignore'), 'utf8');
  assert.ok(gitignore.includes('.env*'), 'Should ignore .env files');
});

// ─── 3. Auth Pages Exist ───────────────────────────────────────────────────

console.log('\n── 3. Auth Pages Exist ──');

test('Signup page exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/app/signup/page.tsx')));
});

test('Login page exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/app/login/page.tsx')));
});

test('Forgot password page exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/app/forgot-password/page.tsx')));
});

test('Reset password page exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/app/reset-password/page.tsx')));
});

test('Account page exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/app/account/page.tsx')));
});

test('Auth callback route exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/app/auth/callback/route.ts')));
});

// ─── 4. Auth Components ────────────────────────────────────────────────────

console.log('\n── 4. Auth Components ──');

test('LogoutButton component exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/components/LogoutButton.tsx')));
});

test('Header component exists', () => {
  assert.ok(fs.existsSync(path.join(websiteDir, 'src/components/Header.tsx')));
});

// ─── 5. Security Checks ────────────────────────────────────────────────────

console.log('\n── 5. Security Checks ──');

test('Supabase client uses anon key only', () => {
  const client = fs.readFileSync(path.join(websiteDir, 'src/lib/supabase/client.ts'), 'utf8');
  assert.ok(!client.includes('service_role'), 'Client should not use service-role key');
  assert.ok(!client.includes('SERVICE_ROLE'), 'Client should not reference SERVICE_ROLE');
});

test('Supabase server uses anon key only', () => {
  const server = fs.readFileSync(path.join(websiteDir, 'src/lib/supabase/server.ts'), 'utf8');
  assert.ok(!server.includes('service_role'), 'Server should not use service-role key');
  assert.ok(!server.includes('SERVICE_ROLE'), 'Server should not reference SERVICE_ROLE');
});

test('No Stripe secret keys in auth files', () => {
  const authFiles = [
    'src/lib/supabase/client.ts',
    'src/lib/supabase/server.ts',
    'src/app/signup/page.tsx',
    'src/app/login/page.tsx',
    'src/app/forgot-password/page.tsx',
    'src/app/account/page.tsx',
  ];
  authFiles.forEach((file) => {
    const content = fs.readFileSync(path.join(websiteDir, file), 'utf8');
    assert.ok(!content.includes('sk_test_'), `${file} should not contain Stripe test key`);
    assert.ok(!content.includes('sk_live_'), `${file} should not contain Stripe live key`);
  });
});

test('No password storage in plain text', () => {
  const authFiles = [
    'src/app/signup/page.tsx',
    'src/app/login/page.tsx',
    'src/app/forgot-password/page.tsx',
  ];
  authFiles.forEach((file) => {
    const content = fs.readFileSync(path.join(websiteDir, file), 'utf8');
    assert.ok(!content.includes('localStorage'), `${file} should not use localStorage for passwords`);
    assert.ok(!content.includes('sessionStorage'), `${file} should not use sessionStorage for passwords`);
  });
});

test('No arbitrary external redirects allowed', () => {
  const loginPage = fs.readFileSync(path.join(websiteDir, 'src/app/login/page.tsx'), 'utf8');
  // Should not redirect to external URLs based on user input
  assert.ok(!loginPage.includes('window.location.href ='), 'Should not use direct window.location redirect');
});

// ─── 6. Desktop App Protection ─────────────────────────────────────────────

console.log('\n── 6. Desktop App Protection ──');

test('No HWID modification in website auth', () => {
  const authFiles = [
    'src/lib/supabase/client.ts',
    'src/lib/supabase/server.ts',
    'src/app/signup/page.tsx',
    'src/app/login/page.tsx',
    'src/app/account/page.tsx',
  ];
  authFiles.forEach((file) => {
    const content = fs.readFileSync(path.join(websiteDir, file), 'utf8');
    assert.ok(!content.includes('hwid'), `${file} should not reference HWID`);
    assert.ok(!content.includes('machine-id'), `${file} should not reference machine-id`);
  });
});

test('No license crypto in website auth', () => {
  const authFiles = [
    'src/lib/supabase/client.ts',
    'src/lib/supabase/server.ts',
    'src/app/account/page.tsx',
  ];
  authFiles.forEach((file) => {
    const content = fs.readFileSync(path.join(websiteDir, file), 'utf8');
    assert.ok(!content.includes('AES'), `${file} should not reference AES encryption`);
    assert.ok(!content.includes('HMAC'), `${file} should not reference HMAC`);
    assert.ok(!content.includes('license.enc'), `${file} should not reference license.enc`);
  });
});

// ─── 7. Session Handling ───────────────────────────────────────────────────

console.log('\n── 7. Session Handling ──');

test('Server client uses cookies for session', () => {
  const server = fs.readFileSync(path.join(websiteDir, 'src/lib/supabase/server.ts'), 'utf8');
  assert.ok(server.includes('cookies'), 'Server client should use cookies');
});

test('Middleware handles session refresh', () => {
  const middleware = fs.readFileSync(path.join(websiteDir, 'src/lib/supabase/middleware.ts'), 'utf8');
  assert.ok(middleware.includes('getUser') || middleware.includes('auth'), 'Middleware should refresh session');
});

// ─── 8. Account Page Protection ────────────────────────────────────────────

console.log('\n── 8. Account Page Protection ──');

test('Account page uses server-side redirect for unauthenticated users', () => {
  const accountPage = fs.readFileSync(path.join(websiteDir, 'src/app/account/page.tsx'), 'utf8');
  assert.ok(accountPage.includes('redirect'), 'Account page should redirect unauthenticated users');
  assert.ok(accountPage.includes('getUser'), 'Account page should check user authentication');
});

// ─── 9. Metadata / SEO ────────────────────────────────────────────────────

console.log('\n── 9. Metadata / SEO ──');

test('Signup page has robots noindex', () => {
  const layout = fs.readFileSync(path.join(websiteDir, 'src/app/signup/layout.tsx'), 'utf8');
  assert.ok(layout.includes('noindex'), 'Signup should have noindex');
});

test('Login page has robots noindex', () => {
  const layout = fs.readFileSync(path.join(websiteDir, 'src/app/login/layout.tsx'), 'utf8');
  assert.ok(layout.includes('noindex'), 'Login should have noindex');
});

test('Account page has robots noindex', () => {
  const accountPage = fs.readFileSync(path.join(websiteDir, 'src/app/account/page.tsx'), 'utf8');
  assert.ok(accountPage.includes('noindex'), 'Account should have noindex');
});

// ─── 10. Auth Callback ─────────────────────────────────────────────────────

console.log('\n── 10. Auth Callback ──');

test('Auth callback route handles code exchange', () => {
  const callback = fs.readFileSync(path.join(websiteDir, 'src/app/auth/callback/route.ts'), 'utf8');
  assert.ok(callback.includes('exchangeCodeForSession'), 'Callback should exchange code for session');
});

test('Auth callback validates parameters', () => {
  const callback = fs.readFileSync(path.join(websiteDir, 'src/app/auth/callback/route.ts'), 'utf8');
  assert.ok(callback.includes('searchParams'), 'Callback should read search params');
});

// ─── 11. No Database Changes ───────────────────────────────────────────────

console.log('\n── 11. No Database Changes ──');

test('No custom customer tables created in website', () => {
  // Check that no SQL migration files were created in the website
  const websiteFiles = getAllFiles(path.join(websiteDir, 'src'));
  const sqlFiles = websiteFiles.filter((f) => f.endsWith('.sql'));
  assert.strictEqual(sqlFiles.length, 0, 'No SQL files should exist in website');
});

function getAllFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

// ─── Results ───────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`STEP 24 Test Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
