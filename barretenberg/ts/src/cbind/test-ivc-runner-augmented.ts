#!/usr/bin/env node
import { NativeApi } from './generated/native.js';
import { AsyncApi } from './generated/async.js';
import { IvcRunner, IvcInputs } from './ivc-inputs.js';
import { AztecClientBackend } from '../barretenberg/backend.js';
import { Barretenberg } from '../barretenberg/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Test with NativeApi
async function testWithNativeApi(inputsPath: string) {
  console.log('\n=== Testing with NativeApi ===');

  const inputs = IvcInputs.fromFile(inputsPath);
  console.log('✓ Successfully loaded', inputs.getStepCount(), 'steps');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const bbPath = join(__dirname, '..', '..', '..', 'cpp', 'build', 'bin', 'bb');
  console.log('Using Barretenberg binary at:', bbPath);

  const api = await NativeApi.new(bbPath);
  const runner = new IvcRunner(api);

  console.log("Runner created");
  await runner.accumulateFromFile(inputsPath);
  console.log("Accumulation complete");

  const proof = await runner.prove();
  console.log("Proof generation complete");
  console.log("Proof structure:", {
    megaProofLength: proof.megaProof.length,
    goblinProof: {
      mergeProofLength: proof.goblinProof.mergeProof.length,
      eccvmProof: {
        preIpaProofLength: proof.goblinProof.eccvmProof.preIpaProof.length,
        ipaProofLength: proof.goblinProof.eccvmProof.ipaProof.length
      },
      translatorProofLength: proof.goblinProof.translatorProof.length
    }
  });

  await api.close();
  console.log('✓ NativeApi test completed successfully');
}

// Test with AztecClientBackend
async function testWithAztecClientBackend(inputsPath: string) {
  console.log('\n=== Testing with AztecClientBackend ===');

  const inputs = IvcInputs.fromFile(inputsPath);
  console.log('✓ Successfully loaded', inputs.getStepCount(), 'steps');

  // Extract bytecodes, witnesses, and VKs from the inputs
  const steps = inputs.getSteps();
  const bytecodes = steps.map(step => step.bytecode);
  const witnesses = steps.map(step => step.witness);
  const vks = steps.map(step => step.vk);

  // Create AztecClientBackend
  const backend = new AztecClientBackend(bytecodes);

  console.log("Backend created");

  try {
    const [proof, vk] = await backend.prove(witnesses, vks);
    console.log("Proof generation complete");
    console.log("Proof size:", proof.length, "bytes");
    console.log("VK size:", vk.length, "bytes");

    // Note: Verification is already done internally in prove()
    console.log("✓ AztecClientBackend test completed successfully");
  } catch (error) {
    console.error("Error during proof generation:", error);
    throw error;
  } finally {
    await backend.destroy();
  }
}

// Test with AsyncApi through IvcRunner
async function testWithAsyncApi(inputsPath: string) {
  console.log('\n=== Testing with AsyncApi through IvcRunner ===');

  const inputs = IvcInputs.fromFile(inputsPath);
  console.log('✓ Successfully loaded', inputs.getStepCount(), 'steps');

  // Create Barretenberg instance
  const bb = await Barretenberg.new({ threads: 1 });
  const api = new AsyncApi(bb.wasm);
  const runner = new IvcRunner(api);

  console.log("Runner created with AsyncApi");
  await runner.accumulateFromFile(inputsPath);
  console.log("Accumulation complete");

  const proof = await runner.prove();
  console.log("Proof generation complete");
  console.log("Proof structure:", {
    megaProofLength: proof.megaProof.length,
    goblinProof: {
      mergeProofLength: proof.goblinProof.mergeProof.length,
      eccvmProof: {
        preIpaProofLength: proof.goblinProof.eccvmProof.preIpaProof.length,
        ipaProofLength: proof.goblinProof.eccvmProof.ipaProof.length
      },
      translatorProofLength: proof.goblinProof.translatorProof.length
    }
  });

  await bb.destroy();
  console.log('✓ AsyncApi test completed successfully');
}

// Main test function
async function runAllTests() {
  const realInputsPath = './ivc-inputs.msgpack';

  console.log('=== IVC Runner Test Suite ===');
  console.log('Testing file:', realInputsPath);

  if (!existsSync(realInputsPath)) {
    console.error('Error: ivc-inputs.msgpack file not found');
    console.log('Please ensure the file exists in the current directory');
    return;
  }

  try {
    // Run tests sequentially to avoid conflicts
    await testWithNativeApi(realInputsPath);
    await testWithAztecClientBackend(realInputsPath);
    await testWithAsyncApi(realInputsPath);

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the tests
runAllTests().catch(console.error);
