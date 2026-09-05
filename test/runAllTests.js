const { spawnSync } = require('child_process');
const path = require('path');

const tests = ['license.test.js', 'features.test.js', 'payment.test.js', 'thumbnail.test.js', 'smartcrop.test.js'];

console.log('======================================================');
console.log('🚀 Running All Reel Cutter Test Suites (Phase 1-5.2)');
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
