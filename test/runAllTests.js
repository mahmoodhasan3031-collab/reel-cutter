const { spawnSync } = require('child_process');
const path = require('path');

const tests = [
  'license.test.js',
  'features.test.js',
  'payment.test.js',
  'thumbnail.test.js',
  'smartcrop.test.js',
  'batchqueue.test.js',
  'packaging.test.js',
  'qa_comprehensive.test.js',
  'e2e-payment-email.test.js',
  'crash-reporter.test.js',
  'variation.test.js',
  'variation-integration.test.js',
  'profiles.test.js',
  'profile-integration.test.js',
  'multi-profile-plan.test.js',
  'bulk-export-executor.test.js',
  'bulk-export-ux-integration.test.js',
  'bulk-variation-control.test.js',
  'scheduler.test.js',
  'schedule-management.test.js',
  'bulk-scheduling.test.js',
  'text-overlay.test.js',
  'caption-template.test.js',
  'caption-preset-editor.test.js',
  'profile-caption-template.test.js',
  'bulk-caption-integration.test.js',
  'ai-caption.test.js',
  'caption-quality.test.js',
  'caption-intelligence.test.js',
  'caption-workspace.test.js',
  'caption-experiment.test.js',
  'caption-production-polish.test.js',
  'variation-preset.test.js',
  'export-preset.test.js',
  'intelligent-profile.test.js',
  'bulk-export-intelligence.test.js',
  'export-history.test.js',
  'export-history-intelligence.test.js',
  'export-recovery.test.js',
  'export-analytics.test.js',
  'export-command-center.test.js',
  'export-workflow-automation.test.js',
  'bug-fix-export-persistence.test.js',
  'bug-fix-batch-queue-history.test.js',
  'ui-timestamp-improvement.test.js',
];

console.log('======================================================');
console.log('🚀 Running All Reel Cutter Test Suites (Phases 1-5C)');
console.log('======================================================\n');


let allPassed = true;

for (const testFile of tests) {
  const filePath = path.join(__dirname, testFile);
  const result = spawnSync(process.execPath, [filePath], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    allPassed = false;
    console.error(`\n❌ Test suite failed: ${testFile}\n`);
    break;
  }
}

if (!allPassed) {
  process.exit(1);
} else {
  console.log('\n✨ All test suites completed successfully!\n');
}
