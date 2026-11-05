/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runAllRegressionTests } from './regressionTests';

console.log('Running EcO Smart Ledger automated regression suite...\n');

const results = runAllRegressionTests();
let passedCount = 0;
let failedCount = 0;

for (const res of results) {
  if (res.passed) {
    passedCount++;
    console.log(`  ✓ ${res.name}`);
  } else {
    failedCount++;
    console.error(`  ✗ ${res.name}`);
    if (res.error) {
      console.error(`    Error: ${res.error}`);
    }
    if (res.actual !== undefined || res.expected !== undefined) {
      console.error(`    Actual:   ${JSON.stringify(res.actual)}`);
      console.error(`    Expected: ${JSON.stringify(res.expected)}`);
    }
  }
}

console.log(`\nResults: ${passedCount} passed, ${failedCount} failed, ${results.length} total.`);

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('All tests passed successfully!\n');
  process.exit(0);
}
