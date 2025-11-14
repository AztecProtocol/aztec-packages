#!/usr/bin/env node
/**
 * Simple test to demonstrate BBAPI call logging at the API level
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Encoder } = require('msgpackr');
const { logBbapiCall, isBbapiLoggingEnabled, getBbapiLogCount, flushBbapiLogs } = require('./dest/node/cbind/bbapi_log.js');

async function runTest() {
  console.log('\n=== Simple BBAPI Logging Test ===\n');

  // Check if logging is enabled
  console.log(`1. Checking logging status...`);
  const loggingEnabled = isBbapiLoggingEnabled();
  console.log(`   Logging enabled: ${loggingEnabled}`);

  if (loggingEnabled) {
    const logPath = process.env.BBAPI_DEBUG_LOG;
    console.log(`   Log directory: ${logPath || 'unknown'}`);
  } else {
    console.log(`   To enable logging, set: BBAPI_DEBUG_LOG=/tmp/bbapi-test`);
  }

  console.log(`\n2. Creating mock BBAPI calls...`);
  const encoder = new Encoder({ useRecords: false });

  // Simulate 3 BBAPI calls
  const call1 = encoder.pack([["Pedersen Hash", { data: new Uint8Array([1, 2, 3]) }]]);
  const call2 = encoder.pack([["Blake2s", { data: new Uint8Array([4, 5, 6]) }]]);
  const call3 = encoder.pack([["CircuitProve", { circuit: "test", witness: new Uint8Array(10) }]]);

  console.log('\n   Call 1: PedersenHash');
  logBbapiCall(call1);
  console.log('   ✓ Logged');

  console.log('\n   Call 2: Blake2s');
  logBbapiCall(call2);
  console.log('   ✓ Logged');

  console.log('\n   Call 3: CircuitProve');
  logBbapiCall(call3);
  console.log('   ✓ Logged');

  console.log(`\n3. Checking captured call count...`);
  const callCount = getBbapiLogCount();
  console.log(`   Captured calls: ${callCount}`);

  if (loggingEnabled && callCount > 0) {
    console.log(`   ${callCount} calls will be saved to log file`);

    console.log(`\n4. Flushing logs to file...`);
    await flushBbapiLogs();
    console.log('   ✓ Logs flushed');

    const remainingCalls = getBbapiLogCount();
    console.log(`   Remaining calls in buffer: ${remainingCalls}`);

    console.log(`\n✓ Test complete! Check the log directory for: bbapi-logs-*.msgpack`);
    console.log(`   Expected location: ${process.env.BBAPI_DEBUG_LOG}/bbapi-logs-*.msgpack`);
  } else if (!loggingEnabled) {
    console.log(`   (Logging disabled - no calls captured)`);
    console.log(`\n✓ Test complete!`);
  } else {
    console.log(`\n✗ Logging enabled but no calls captured`);
  }

  console.log('\n=== End of Test ===\n');
}

// Run the test
runTest().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
