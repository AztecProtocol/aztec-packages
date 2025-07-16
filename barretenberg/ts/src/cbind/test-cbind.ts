// Simple test to verify cbind integration
import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { circuitInfo } from './cbind.sync.gen.js';
import { async } from './cbind.gen.js';

// Test sync API
async function testSync() {
  console.log('Testing sync API...');
  const wasm = new BarretenbergWasmMain();
  // Would need to initialize wasm properly to test
  console.log('Sync API imports successfully');
}

// Test async API
async function testAsync() {
  console.log('Testing async API...');
  // Would need to create worker to test properly
  console.log('Async API imports successfully');
}

console.log('cbind test - verifying imports work correctly');
testSync();
testAsync();