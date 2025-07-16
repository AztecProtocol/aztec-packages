#!/usr/bin/env node
import { NativeApi } from './native.gen.js';
import { AsyncApi } from './cbind.async.gen.js';
import { SyncApi } from './cbind.sync.gen.js';
import { IvcRunner, IvcInputs, IvcInputStep } from './ivc-inputs.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function testWithNativeApi() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const bbPath = join(__dirname, '..', '..', '..', 'cpp', 'build-no-avm', 'bin', 'bb');

  console.log('=== Testing IvcRunner with NativeApi ===');
  console.log('Using bb binary at:', bbPath);

  // Create NativeApi instance
  const api = new NativeApi(bbPath);
  await api.init();

  // Create IvcRunner with the native API
  const runner = new IvcRunner(api);

  try {
    // Test 1: Create a simple IVC inputs file
    console.log('\n1. Creating test IVC inputs...');
    const testInputs = new IvcInputs();
    
    // Add some dummy steps (in a real scenario, these would be actual circuit data)
    for (let i = 0; i < 2; i++) {
      testInputs.addStep({
        bytecode: Buffer.from(`dummy_bytecode_${i}`),
        witness: Buffer.from(`dummy_witness_${i}`),
        vk: Buffer.from(`dummy_vk_${i}`),
        functionName: `test_function_${i}`,
      });
    }

    // Save to file
    const testDir = join(__dirname, 'test-output');
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    
    const testInputsPath = join(testDir, 'test-ivc-inputs.msgpack');
    testInputs.toFile(testInputsPath);
    console.log('✓ Created test IVC inputs file at:', testInputsPath);

    // Test 2: Read the file back
    console.log('\n2. Reading IVC inputs from file...');
    const loadedInputs = IvcInputs.fromFile(testInputsPath);
    console.log('✓ Loaded', loadedInputs.getStepCount(), 'steps from file');
    
    for (let i = 0; i < loadedInputs.getStepCount(); i++) {
      const step = loadedInputs.getStep(i);
      console.log(`  Step ${i}: ${step?.functionName}`);
    }

    // Test 3: Test individual IVC operations
    console.log('\n3. Testing individual IVC operations...');
    
    // Start IVC
    console.log('  Starting IVC with 2 circuits...');
    await runner.start(2);
    console.log('  ✓ IVC started');

    // Note: The following operations would fail with dummy data
    // In a real test, you would use actual circuit bytecode and witness data
    console.log('\n  Note: Skipping accumulate/prove with dummy data (would fail)');
    console.log('  In production, use real circuit data from the build process');

    // Test 4: Check the polymorphic API works with different implementations
    console.log('\n4. Verifying polymorphic API compatibility...');
    
    // The IvcRunner type works with any API that implements the IvcApi interface
    async function testPolymorphism<T extends { clientIvcStart(command: { numCircuits: number }): Promise<{}> }>(apiName: string, api: T) {
      const runner = new IvcRunner(api);
      console.log(`  ✓ IvcRunner<${apiName}> created successfully`);
      // We can't actually run start() on non-initialized APIs, but the type checking proves it works
    }

    // These would work if we had WASM loaded
    testPolymorphism('AsyncApi', {} as AsyncApi);
    testPolymorphism('SyncApi', {} as SyncApi);
    testPolymorphism('NativeApi', api);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('\nClosing bb process...');
    await api.close();
    console.log('✓ Test complete');
  }
}

// Test reading an actual ivc-inputs.msgpack file if it exists
async function testWithRealFile() {
  const realInputsPath = './ivc-inputs.msgpack';
  
  if (!existsSync(realInputsPath)) {
    console.log('\n=== No real ivc-inputs.msgpack file found ===');
    console.log('To test with real data, place an ivc-inputs.msgpack file in the current directory');
    return;
  }

  console.log('\n=== Testing with real ivc-inputs.msgpack file ===');
  
  try {
    const inputs = IvcInputs.fromFile(realInputsPath);
    console.log('✓ Successfully loaded', inputs.getStepCount(), 'steps');
    
    for (let i = 0; i < inputs.getStepCount(); i++) {
      const step = inputs.getStep(i);
      if (step) {
        console.log(`  Step ${i}: ${step.functionName}`);
        console.log(`    - Bytecode: ${step.bytecode.length} bytes`);
        console.log(`    - Witness: ${step.witness.length} bytes`);
        console.log(`    - VK: ${step.vk.length} bytes`);
      }
    }

    // If we have real data, we could test the actual IVC flow
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const bbPath = join(__dirname, '..', '..', '..', 'cpp', 'build-no-avm', 'bin', 'bb');
    
    if (existsSync(bbPath)) {
      console.log('\nTesting check precomputed VKs with native API...');
      const api = new NativeApi(bbPath);
      await api.init();
      
      const runner = new IvcRunner(api);
      const allValid = await runner.checkPrecomputedVks(realInputsPath);
      console.log(allValid ? '✓ All VKs are valid' : '✗ Some VKs are invalid');
      
      await api.close();
    }
    
  } catch (error) {
    console.error('Error reading real file:', error);
  }
}

async function main() {
  await testWithNativeApi();
  await testWithRealFile();
}

main().catch(console.error);