#!/usr/bin/env node
/**
 * Test BBAPI logging with real commands that can be replayed with bb msgpack run
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Encoder } = require('msgpackr');
const { logBbapiCall, flushBbapiLogs } = require('./dest/node/cbind/bbapi_log_shared.js');

async function runTest() {
  console.log('\n=== BBAPI Replay Test ===\n');

  const encoder = new Encoder({ useRecords: false });

  // Create valid BBAPI commands that bb msgpack run can handle

  // 1. Blake2s - Hash some data
  const blake2sCall = encoder.pack([["Blake2s", {
    data: new Uint8Array([1, 2, 3, 4, 5])
  }]]);

  // 2. GrumpkinGetRandomFr - Get random field element
  const randomFrCall = encoder.pack([["GrumpkinGetRandomFr", {
    dummy: 0
  }]]);

  console.log('Logging 2 real BBAPI commands...');
  logBbapiCall(blake2sCall);
  logBbapiCall(randomFrCall);
  console.log('✓ Calls logged\n');

  console.log('Flushing logs to file...');
  flushBbapiLogs();
  console.log('✓ Logs flushed\n');

  console.log('To replay these calls with bb:');
  console.log(`  ${process.env.BB_BINARY_PATH || './barretenberg/cpp/build/bin/bb'} msgpack run -i ${process.env.BBAPI_DEBUG_LOG}/bbapi-logs-*.msgpack`);
  console.log('\n=== Test Complete ===\n');
}

runTest().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
