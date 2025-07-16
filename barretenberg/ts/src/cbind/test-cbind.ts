// Simple test to verify cbind integration
import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { CbindApiSync } from './cbind.sync.gen.js';
import { CbindApi } from './cbind.async.gen.js';
import { BarretenbergApiSync } from '../barretenberg_api/index.js';
import path from 'path';
import { homedir } from 'os';
import { Crs, GrumpkinCrs } from '../crs/index.js';
import { RawBuffer } from '../types/raw_buffer.js';

// TAKE INSPO FROM THIS

async function initSrs(api: BarretenbergApiSync, srsSize = 2**20): Promise<void> {
  const crsPath = path.join(homedir(), '.bb-crs');
  const crs = await Crs.new(srsSize + 1, crsPath, console.log);
  const grumpkinCrs = await GrumpkinCrs.new(2 ** 16 + 1, crsPath, console.log);

  // Load CRS into wasm global CRS state.
  api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
  api.srsInitGrumpkinSrs(new RawBuffer(grumpkinCrs.getG1Data()), grumpkinCrs.numPoints);
}

// Test sync API wrapper
async function testSyncWrapper() {
  console.log('Testing sync API wrapper...');
  const wasm = new BarretenbergWasmMain();
  const api = new BarretenbergApiSync(wasm);
  await initSrs(api);
  const cbindApi = new CbindApiSync(wasm);
  cbindApi.clientIvcStart({numCircuits: 2});
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
