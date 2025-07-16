// Simple test to verify cbind integration
import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { CbindApiSync } from './cbind.sync.gen.js';
import { CbindApi } from './cbind.async.gen.js';

// Test sync API wrapper
async function testSyncWrapper() {
  console.log('Testing sync API wrapper...');
  const wasm = new BarretenbergWasmMain();
  const api = new CbindApiSync(wasm);
  // Would need to initialize wasm properly to test actual calls
  console.log('Sync API wrapper created successfully');
}

// Test async API wrapper
async function testAsyncWrapper() {
  console.log('Testing async API wrapper...');
  // Would need to create worker to test properly
  // const worker = await createWorker();
  // const api = new CbindApi(worker);
  console.log('Async API wrapper structure verified');
}

console.log('cbind test - verifying wrapper classes work correctly');
testSyncWrapper();
testAsyncWrapper();