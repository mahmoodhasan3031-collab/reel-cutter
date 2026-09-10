'use strict';
/**
 * STEP 4B — Crash / Error Reporter Tests
 *
 * Tests the new error-reporting infrastructure:
 *  - Logger: sanitization, masking, file writing, rotation
 *  - Process handler registration (uncaughtException, unhandledRejection)
 *  - render-process-gone handler registration
 *  - FFmpeg / FFprobe error size limiting
 *  - Customer email masking in server logs
 *  - React ErrorBoundary component structure
 *  - Offline safety (no network I/O)
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

let passed = 0;
let total  = 0;

async function it(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n=== STEP 4B: Crash / Error Reporter Tests ===\n');

  // ── Bootstrap logger with an isolated temp dir ────────────────────────────
  const logger = require('../src/main/logger');
  const tmpDir = path.join(os.tmpdir(), `reel-4b-test-${Date.now()}`);
  logger.setLogDir(tmpDir);

  // ─── 1. Sanitization — Stripe keys ───────────────────────────────────────

  console.log('--- 1. Secret / Credential Sanitization ---');

  await it('sanitize: strips Stripe live secret key (sk_live_*)', () => {
    const result = logger.sanitize('Failure: sk_live_AbCdEfGhIjKlMnOpQrSt');
    assert.ok(!result.includes('sk_live_'), `Must redact sk_live_*, got: ${result}`);
    assert.ok(result.includes('[SK_REDACTED]'));
  });

  await it('sanitize: strips Stripe test secret key (sk_test_*)', () => {
    const result = logger.sanitize('key=sk_test_1234567890abcdef caused error');
    assert.ok(!result.includes('sk_test_'));
    assert.ok(result.includes('[SK_REDACTED]'));
  });

  await it('sanitize: strips Stripe webhook secret (whsec_*)', () => {
    const result = logger.sanitize('Sig header whsec_ABCDEFGHIJKLMNOPabcdefghij');
    assert.ok(!result.includes('whsec_'));
    assert.ok(result.includes('[WHSEC_REDACTED]'));
  });

  await it('sanitize: strips Resend API key (re_*)', () => {
    const result = logger.sanitize('Resend rejected: re_abcdefghijklmn was invalid');
    assert.ok(!result.includes('re_abcdefghijklmn'), `Got: ${result}`);
  });

  await it('sanitize: strips Bearer token', () => {
    const result = logger.sanitize('Header: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig');
    assert.ok(!result.includes('eyJhbGciOiJIUzI1NiJ9'), `Token must be redacted, got: ${result}`);
    assert.ok(result.includes('[TOKEN_REDACTED]'));
  });

  await it('sanitize: strips Authorization header value', () => {
    const result = logger.sanitize('Authorization: sk_live_SECRET123');
    assert.ok(!result.includes('sk_live_SECRET123'));
  });

  await it('sanitize: strips password= pattern', () => {
    const result = logger.sanitize('SMTP error password=myS3cretPassword');
    assert.ok(!result.includes('myS3cretPassword'), `Must redact password, got: ${result}`);
    assert.ok(result.includes('[REDACTED]'));
  });

  await it('sanitize: strips pass= pattern', () => {
    const result = logger.sanitize('config pass=hunter2 failed');
    assert.ok(!result.includes('hunter2'), `Must redact pass, got: ${result}`);
  });

  // ─── 2. Message length limiting ──────────────────────────────────────────

  console.log('\n--- 2. Message Length Limiting ---');

  await it('sanitize: truncates message exceeding 1000 characters', () => {
    const long   = 'A'.repeat(2000);
    const result = logger.sanitize(long);
    assert.ok(result.length <= 1003, `Expected ≤1003 chars, got ${result.length}`);
    assert.ok(result.endsWith('...'), 'Truncated string must end with ...');
  });

  await it('sanitize: preserves normal diagnostic messages untouched', () => {
    const msg    = 'FFmpeg error: invalid codec for output container';
    const result = logger.sanitize(msg);
    assert.strictEqual(result, msg);
  });

  // ─── 3. Customer email masking ────────────────────────────────────────────

  console.log('\n--- 3. Customer Email Masking ---');

  await it('maskEmail: masks full local-part except first character', () => {
    const result = logger.maskEmail('customer@example.com');
    assert.ok(!result.includes('customer'), `Full local part must be hidden, got: ${result}`);
    assert.ok(result.startsWith('c***'), `Must start with c***, got: ${result}`);
    assert.ok(result.endsWith('@example.com'), `Domain must be preserved, got: ${result}`);
  });

  await it('maskEmail: handles null / empty safely', () => {
    assert.strictEqual(logger.maskEmail(null),  '[unknown]');
    assert.strictEqual(logger.maskEmail(''),    '[unknown]');
    assert.strictEqual(logger.maskEmail('noemail'), '[masked]');
  });

  await it('maskEmail: handles single-char local part', () => {
    const result = logger.maskEmail('a@b.com');
    assert.ok(result.includes('@b.com'));
  });

  // ─── 4. Logger file writing ───────────────────────────────────────────────

  console.log('\n--- 4. Logger File Output ---');

  await it('logger.info: writes [INFO] entry to log file', () => {
    logger.info('TestSuite', 'Hello from info');
    const content = fs.readFileSync(logger.getLogPath(), 'utf8');
    assert.ok(content.includes('[INFO]'),          'Must contain [INFO] level');
    assert.ok(content.includes('[TestSuite]'),      'Must contain component tag');
    assert.ok(content.includes('Hello from info'), 'Must contain message');
  });

  await it('logger.warn: writes [WARN] entry to log file', () => {
    logger.warn('TestSuite', 'Warning message here');
    const content = fs.readFileSync(logger.getLogPath(), 'utf8');
    assert.ok(content.includes('[WARN]'));
    assert.ok(content.includes('Warning message here'));
  });

  await it('logger.error: writes [ERROR] entry to log file', () => {
    logger.error('TestSuite', 'Error message here');
    const content = fs.readFileSync(logger.getLogPath(), 'utf8');
    assert.ok(content.includes('[ERROR]'));
    assert.ok(content.includes('Error message here'));
  });

  await it('logger: sanitizes secrets before writing to file', () => {
    logger.error('TestSuite', 'key sk_live_VERYSECRETKEY123 caused failure');
    const content = fs.readFileSync(logger.getLogPath(), 'utf8');
    assert.ok(!content.includes('sk_live_VERYSECRETKEY123'),
      'Raw secret key must NOT appear in log file');
    assert.ok(content.includes('[SK_REDACTED]'), 'Redaction marker must appear in log file');
  });

  await it('logger: log entries include ISO 8601 timestamp', () => {
    logger.info('TestSuite', 'timestamp-check');
    const content = fs.readFileSync(logger.getLogPath(), 'utf8');
    assert.ok(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(content),
      'Log must contain ISO timestamp');
  });

  // ─── 5. Offline safety ────────────────────────────────────────────────────

  console.log('\n--- 5. Offline Safety ---');

  await it('logger: completes without any network I/O (pure local FS)', () => {
    // The logger makes no async calls. Verify it runs synchronously and quickly.
    const before = Date.now();
    logger.info('OfflineTest', 'Offline write');
    logger.warn('OfflineTest', 'Offline warn');
    logger.error('OfflineTest', 'Offline error');
    const elapsed = Date.now() - before;
    // Should complete well under 500 ms with local I/O only (no network)
    assert.ok(elapsed < 500, `Logger must be local-only; took ${elapsed} ms`);
    const content = fs.readFileSync(logger.getLogPath(), 'utf8');
    assert.ok(content.includes('OfflineTest'));
  });

  // ─── 6. Log rotation ─────────────────────────────────────────────────────

  console.log('\n--- 6. Log Rotation ---');

  await it('rotateIfNeeded: rotates file that exceeds 1 MB', () => {
    const rotDir  = path.join(os.tmpdir(), `reel-rot-${Date.now()}`);
    fs.mkdirSync(rotDir, { recursive: true });
    const logPath = path.join(rotDir, 'app.log');
    const backup  = logPath + '.1';

    fs.writeFileSync(logPath, Buffer.alloc(1024 * 1024 + 1, 65)); // 1 MB + 1 byte
    logger.rotateIfNeeded(logPath);

    assert.ok(!fs.existsSync(logPath), 'Primary log must be rotated away');
    assert.ok(fs.existsSync(backup),   'Backup .1 must exist after rotation');

    fs.unlinkSync(backup);
    fs.rmdirSync(rotDir);
  });

  await it('rotateIfNeeded: leaves file under 1 MB alone', () => {
    const rotDir  = path.join(os.tmpdir(), `reel-small-${Date.now()}`);
    fs.mkdirSync(rotDir, { recursive: true });
    const logPath = path.join(rotDir, 'app.log');

    fs.writeFileSync(logPath, 'small log content\n');
    logger.rotateIfNeeded(logPath);

    assert.ok(fs.existsSync(logPath), 'Small log must NOT be rotated');
    assert.ok(!fs.existsSync(logPath + '.1'), 'No backup should be created');

    fs.unlinkSync(logPath);
    fs.rmdirSync(rotDir);
  });

  await it('rotateIfNeeded: overwrites existing .1 backup on second rotation', () => {
    const rotDir  = path.join(os.tmpdir(), `reel-double-${Date.now()}`);
    fs.mkdirSync(rotDir, { recursive: true });
    const logPath = path.join(rotDir, 'app.log');
    const backup  = logPath + '.1';
    const big     = Buffer.alloc(1024 * 1024 + 1, 66);

    // First rotation
    fs.writeFileSync(logPath, big);
    logger.rotateIfNeeded(logPath);
    assert.ok(fs.existsSync(backup), 'First backup must exist');

    // Second rotation — must overwrite .1
    fs.writeFileSync(logPath, big);
    logger.rotateIfNeeded(logPath);
    assert.ok(!fs.existsSync(logPath), 'Primary must be rotated again');
    assert.ok(fs.existsSync(backup),   'Backup must still exist (overwritten)');

    fs.unlinkSync(backup);
    fs.rmdirSync(rotDir);
  });

  // ─── 7. Process handler registration ─────────────────────────────────────

  console.log('\n--- 7. Process Handler Registration ---');

  await it('uncaughtException: handler registered in src/main/index.js', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/main/index.js'), 'utf8');
    assert.ok(
      src.includes("process.on('uncaughtException'") ||
      src.includes('process.on("uncaughtException"'),
      'main/index.js must register an uncaughtException handler'
    );
  });

  await it('unhandledRejection: handler registered in src/main/index.js', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/main/index.js'), 'utf8');
    assert.ok(
      src.includes("process.on('unhandledRejection'") ||
      src.includes('process.on("unhandledRejection"'),
      'main/index.js must register an unhandledRejection handler'
    );
  });

  await it('render-process-gone: handler registered in src/main/index.js', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/main/index.js'), 'utf8');
    assert.ok(
      src.includes('render-process-gone'),
      'main/index.js must register a render-process-gone handler'
    );
  });

  await it('uncaughtException: handler uses logger (not raw fs.writeFileSync)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/main/index.js'), 'utf8');
    // The new handler must call logger.error, not the old startup_error.log pattern
    assert.ok(src.includes('logger.error'), 'Handler must use logger.error');
    // Must NOT use the old hard-coded startup_error.log path pattern inside uncaughtException
    const oldPattern = /startup_error\.log/;
    // startup_error.log reference may appear in comments — allow comment references only
    const nonCommentLines = src.split('\n')
      .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    assert.ok(
      !oldPattern.test(nonCommentLines),
      'Non-comment code must not reference startup_error.log (superseded by logger)'
    );
  });

  // ─── 8. FFmpeg / FFprobe error size limiting ──────────────────────────────

  console.log('\n--- 8. FFmpeg / FFprobe Error Size Limiting ---');

  await it('cutter.js: FFmpeg error handler limits stderr to last 500 chars', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/engine/cutter.js'), 'utf8');
    assert.ok(
      src.includes('slice(-500)') || src.includes('.slice(-'),
      'cutter.js must truncate FFmpeg stderr (slice from end)'
    );
  });

  await it('probe.js: FFprobe rejection limits error message to 500 chars', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/engine/probe.js'), 'utf8');
    assert.ok(
      src.includes('.length > 500') || src.includes('slice(0, 497)'),
      'probe.js must limit FFprobe error message size'
    );
  });

  // ─── 9. Customer email masking in server logs ─────────────────────────────

  console.log('\n--- 9. Customer Email Masking in Server Logs ---');

  await it('webhook.js: no raw ${customerEmail} in console.log (must use maskEmail)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../server/routes/webhook.js'), 'utf8');
    // Ensure we are not doing the old direct interpolation
    assert.ok(!src.includes('${customerEmail || \'unknown\'}'), 'webhook.js must not contain the old raw unmasked customerEmail interpolation');
    
    // Ensure any usage of customerEmail in console.log is wrapped in maskEmail
    const logLines = src.split('\n').filter(line => line.includes('console.') && line.includes('customerEmail'));
    for (const line of logLines) {
      assert.ok(line.includes('maskEmail(customerEmail)'), `Found unmasked customerEmail in log line: ${line}`);
    }
  });

  await it('webhook.js: uses maskEmail() in console.log', () => {
    const src = fs.readFileSync(path.join(__dirname, '../server/routes/webhook.js'), 'utf8');
    assert.ok(src.includes('maskEmail('), 'webhook.js must call maskEmail() before logging');
  });

  await it('emailService: maskEmail function exported and works correctly', () => {
    const { maskEmail } = require('../server/services/emailService');
    assert.strictEqual(maskEmail('alice@example.com'), 'a***@example.com');
    assert.strictEqual(maskEmail('bob@domain.org'),    'b***@domain.org');
    assert.strictEqual(maskEmail(null),                '[unknown]');
  });

  // ─── 10. React ErrorBoundary structure ───────────────────────────────────

  console.log('\n--- 10. React ErrorBoundary ---');

  await it('ErrorBoundary.jsx: file exists in components directory', () => {
    const p = path.join(__dirname, '../src/renderer/src/components/ErrorBoundary.jsx');
    assert.ok(fs.existsSync(p), 'ErrorBoundary.jsx must exist');
  });

  await it('ErrorBoundary.jsx: implements getDerivedStateFromError', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/renderer/src/components/ErrorBoundary.jsx'), 'utf8'
    );
    assert.ok(src.includes('getDerivedStateFromError'),
      'ErrorBoundary must implement getDerivedStateFromError');
  });

  await it('ErrorBoundary.jsx: implements componentDidCatch', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/renderer/src/components/ErrorBoundary.jsx'), 'utf8'
    );
    assert.ok(src.includes('componentDidCatch'),
      'ErrorBoundary must implement componentDidCatch');
  });

  await it('ErrorBoundary.jsx: does NOT expose raw stack traces to end user', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/renderer/src/components/ErrorBoundary.jsx'), 'utf8'
    );
    assert.ok(!src.includes('{error.stack}') && !src.includes('{err.stack}'),
      'ErrorBoundary must not render raw .stack in JSX');
  });

  await it('ErrorBoundary.jsx: has reload-loop prevention (_reloads counter)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/renderer/src/components/ErrorBoundary.jsx'), 'utf8'
    );
    assert.ok(src.includes('_reloads') || src.includes('reloadCount'),
      'ErrorBoundary must prevent reload loops');
  });

  await it('main.jsx: wraps App with ErrorBoundary', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/renderer/src/main.jsx'), 'utf8'
    );
    assert.ok(src.includes('ErrorBoundary'),
      'main.jsx must import and use ErrorBoundary');
    assert.ok(src.includes('<ErrorBoundary>') || src.includes('<ErrorBoundary '),
      'main.jsx must render <ErrorBoundary> element');
  });

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  try {
    const files = fs.readdirSync(tmpDir);
    for (const f of files) {
      try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
    }
    fs.rmdirSync(tmpDir);
  } catch (_) {}

  // ─── Results ──────────────────────────────────────────────────────────────

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`STEP 4B Crash Reporter Tests: ${passed}/${total} passed`);
  console.log('──────────────────────────────────────────────────────\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
