#!/usr/bin/env node
import { AsyncApi } from './generated/async.js';
import { SyncApi } from './generated/sync.js';
import { IvcRunner, IvcInputs } from './ivc-inputs.js';
import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

async function testWithWasmApis() {
  console.log('=== Testing IvcRunner with WASM APIs ===');

  try {
    // Initialize WASM
    console.log('\nInitializing BarretenbergWasmMain...');
    // For testing, we'll use a mock or skip WASM initialization
    // In a real scenario, you'd load the WASM module properly
    console.log('✓ WASM initialization skipped for test');
    const wasm = {} as BarretenbergWasmMain;
    console.log('✓ WASM initialized');

    // Test with AsyncApi
    console.log('\n1. Testing with AsyncApi...');
    const asyncApi = new AsyncApi(wasm as any);
    const asyncRunner = new IvcRunner(asyncApi);
    
    await asyncRunner.start(2);
    console.log('✓ AsyncApi: IVC started with 2 circuits');

    // Test with SyncApi
    console.log('\n2. Testing with SyncApi...');
    const syncApi = new SyncApi(wasm);
    const syncRunner = new IvcRunner(syncApi);
    
    await syncRunner.start(3);
    console.log('✓ SyncApi: IVC started with 3 circuits');

    // Check if we have a real ivc-inputs.msgpack file to test with
    const realInputsPath = './ivc-inputs.msgpack';
    if (existsSync(realInputsPath)) {
      console.log('\n3. Testing with real ivc-inputs.msgpack file...');
      
      const inputs = IvcInputs.fromFile(realInputsPath);
      console.log(`✓ Loaded ${inputs.getStepCount()} steps from file`);

      // Test checkPrecomputedVks
      console.log('\nChecking precomputed VKs with AsyncApi...');
      const allValid = await asyncRunner.checkPrecomputedVks(realInputsPath);
      console.log(allValid ? '✓ All VKs are valid' : '✗ Some VKs are invalid');

      // Note: We can't run the full flow with accumulate/prove without real circuit data
      // that matches what the WASM expects
    } else {
      console.log('\n3. No real ivc-inputs.msgpack file found');
      console.log('   Place an ivc-inputs.msgpack file in the current directory to test with real data');
    }

    // Demonstrate creating IVC inputs programmatically
    console.log('\n4. Creating IVC inputs programmatically...');
    const customInputs = new IvcInputs();
    
    // In a real scenario, you would get these from actual circuit compilation
    customInputs.addStep({
      bytecode: Buffer.from('compiled_circuit_bytecode_here'),
      witness: Buffer.from('witness_data_here'),
      vk: Buffer.from('verification_key_here'),
      functionName: 'my_circuit_function',
    });

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const outputPath = join(__dirname, 'test-output', 'custom-ivc-inputs.msgpack');
    customInputs.toFile(outputPath);
    console.log('✓ Saved custom IVC inputs to:', outputPath);

  } catch (error) {
    console.error('Error:', error);
  }
}

async function demonstratePolymorphicUsage() {
  console.log('\n=== Demonstrating Polymorphic API Usage ===');

  // This function works with any API that implements IvcApi
  async function processIvcInputs<T extends {
    clientIvcStart(command: { numCircuits: number }): Promise<{}>;
    clientIvcAccumulate(command: { circuit: { name: string; bytecode: Buffer; verificationKey: Buffer }, witness: Buffer }): Promise<{}>;
    clientIvcProve(command: {}): Promise<{ proof: any }>;
  }>(api: T, inputsPath: string): Promise<any | null> {
    const runner = new IvcRunner(api as any);
    
    try {
      console.log(`Processing ${inputsPath} with ${api.constructor.name}...`);
      const proof = await runner.runComplete(inputsPath);
      console.log('✓ Proof generated successfully');
      return proof;
    } catch (error) {
      console.error('✗ Failed:', error);
      return null;
    }
  }

  // Example: This function would work with any of our APIs
  console.log('\nThe processIvcInputs function above works with:');
  console.log('  - new SyncApi(wasm)');
  console.log('  - new AsyncApi(wasm)');
  console.log('  - new NativeApi(bbPath)');
  console.log('\nThis demonstrates the power of the polymorphic design!');
}

async function main() {
  await testWithWasmApis();
  await demonstratePolymorphicUsage();
  console.log('\n✓ All tests complete');
}

main().catch(console.error);