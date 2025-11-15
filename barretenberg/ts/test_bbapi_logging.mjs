#!/usr/bin/env node
/**
 * Test script to demonstrate BBAPI call logging functionality
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import from built files
const { isBbapiLoggingEnabled, getBbapiLogCount } = require('./dest/node/cbind/bbapi_log.js');
const { AsyncApi } = require('./dest/node/cbind/generated/async.js');

// Mock backend for testing
class MockBackend {
  async call(inputBuffer) {
    console.log(`  [MockBackend] Received call: ${inputBuffer.length} bytes`);

    // Decode and log the command name
    const { Decoder } = require('msgpackr');
    const decoder = new Decoder({ useRecords: false });
    const [commandName] = decoder.unpack(inputBuffer)[0];
    console.log(`  [MockBackend] Command: ${commandName}`);

    // Return a mock success response
    const { Encoder } = require('msgpackr');
    const encoder = new Encoder({ useRecords: false });

    // Return different responses based on command
    if (commandName === 'GrumpkinGetRandomFr') {
      return encoder.pack(['GrumpkinGetRandomFrResponse', {
        value: new Uint8Array(32).fill(0x42)
      }]);
    } else if (commandName === 'Blake2s') {
      return encoder.pack(['Blake2sResponse', {
        hash: new Uint8Array(32).fill(0xaa)
      }]);
    }

    // Generic success response
    return encoder.pack(['SuccessResponse', {}]);
  }

  async destroy() {
    console.log('  [MockBackend] Destroy called');
  }
}

async function runTest() {
  console.log('\n=== BBAPI Logging Test ===\n');

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

  console.log(`\n2. Creating AsyncApi with mock backend...`);
  const mockBackend = new MockBackend();
  const api = new AsyncApi(mockBackend);
  console.log('   AsyncApi created');

  console.log(`\n3. Making BBAPI calls via backend.call()...`);

  const { Encoder } = require('msgpackr');
  const encoder = new Encoder({ useRecords: false });

  try {
    // Call 1: Simple command
    console.log('\n   Call 1: TestCommand1');
    const call1 = encoder.pack([["TestCommand1", { value: 42 }]]);
    await mockBackend.call(call1);
    console.log('   ✓ Call completed');

    // Call 2: Another command
    console.log('\n   Call 2: TestCommand2');
    const call2 = encoder.pack([["TestCommand2", { data: [1, 2, 3] }]]);
    await mockBackend.call(call2);
    console.log('   ✓ Call completed');

    // Call 3: Third command
    console.log('\n   Call 3: TestCommand3');
    const call3 = encoder.pack([["TestCommand3", { name: "test" }]]);
    await mockBackend.call(call3);
    console.log('   ✓ Call completed');

  } catch (error) {
    console.log(`   ✗ Call failed: ${error.message}`);
  }

  console.log(`\n4. Checking captured call count...`);
  const callCount = getBbapiLogCount();
  console.log(`   Captured calls: ${callCount}`);

  if (loggingEnabled && callCount > 0) {
    console.log(`   ${callCount} calls will be saved to log file on destroy`);
  } else if (!loggingEnabled) {
    console.log(`   (Logging disabled - no calls captured)`);
  }

  console.log(`\n5. Destroying API (this triggers log flush)...`);
  await api.destroy();
  console.log('   API destroyed');

  if (loggingEnabled && callCount > 0) {
    console.log(`\n✓ Test complete! Check the log directory for: bbapi-logs-*.msgpack`);
  } else {
    console.log(`\n✓ Test complete!`);
  }

  console.log('\n=== End of Test ===\n');
}

// Run the test
runTest().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
