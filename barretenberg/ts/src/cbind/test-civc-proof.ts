#!/usr/bin/env node
/**
 * Test script for CIVC proof generation using the TypeScript API
 *
 * This demonstrates using the IvcRunner with real IVC inputs to generate
 * a Client IVC proof through the native bb binary.
 *
 * Usage: npx tsx test-civc-proof.ts [path-to-ivc-inputs.msgpack]
 */

import { NativeApi } from './generated-bkup/nativebk.js';
import { IvcRunner, IvcInputs } from './ivc-inputs.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color: keyof typeof colors, ...args: any[]) {
  console.log(colors[color] + args.join(' ') + colors.reset);
}

async function main() {
  log('green', '=== CIVC Proof Test (TypeScript) ===');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Path to bb binary
  const bbPath = join(__dirname, '..', '..', '..', 'cpp', 'build-no-avm', 'bin', 'bb');

  if (!existsSync(bbPath)) {
    log('red', 'Error: bb binary not found at', bbPath);
    console.log('Please build barretenberg first');
    process.exit(1);
  }

  // Get IVC inputs path from command line or use default
  const defaultPath = join(
    __dirname, '..', '..', '..', '..', '..',
    'yarn-project', 'end-to-end', 'example-app-ivc-inputs-out',
    'ecdsar1+transfer_0_recursions+sponsored_fpc', 'ivc-inputs.msgpack'
  );

  const ivcInputsPath = process.argv[2] || defaultPath;

  if (!existsSync(ivcInputsPath)) {
    log('red', 'Error: IVC inputs file not found at:', ivcInputsPath);
    console.log('\nTo generate IVC inputs, run:');
    console.log('  cd yarn-project/end-to-end && ./bootstrap.sh build_bench');
    console.log('\nOr specify a different path:');
    console.log('  npx tsx test-civc-proof.ts <path-to-ivc-inputs.msgpack>');
    process.exit(1);
  }

  log('yellow', 'Using IVC inputs:', ivcInputsPath);

  try {
    // Step 1: Load and inspect the IVC inputs
    log('green', '\nStep 1: Loading IVC inputs...');
    const inputs = IvcInputs.fromFile(ivcInputsPath);
    const stepCount = inputs.getStepCount();

    log('green', `✓ Loaded ${stepCount} execution steps`);

    // Show details of each step
    for (let i = 0; i < stepCount; i++) {
      const step = inputs.getStep(i);
      if (step) {
        console.log(`  Step ${i}: ${step.functionName}`);
        console.log(`    - Bytecode: ${step.bytecode.length} bytes`);
        console.log(`    - Witness: ${step.witness.length} bytes`);
        console.log(`    - VK: ${step.vk.length} bytes`);
      }
    }

    // Step 2: Initialize the Native API
    log('green', '\nStep 2: Initializing Native API...');
    const api = await NativeApi.new(bbPath);
    log('green', '✓ Native API initialized');

    // Step 3: Create IvcRunner
    const runner = new IvcRunner(api);

    // Step 4: Check precomputed VKs
    log('green', '\nStep 3: Checking precomputed VKs...');
    const vksValid = await runner.checkPrecomputedVks(ivcInputsPath);

    if (vksValid) {
      log('green', '✓ All VKs are valid');
    } else {
      log('yellow', '⚠ Some VKs are invalid or missing');
      console.log('You can fix them using the bb CLI with --fix flag');
    }

    // Step 5: Generate the proof
    log('green', '\nStep 4: Generating CIVC proof...');
    console.log('This may take a few minutes...');

    const startTime = Date.now();

    // Start IVC with the number of circuits
    await runner.start(stepCount);
    log('green', '✓ IVC started');

    // Accumulate each step
    for (let i = 0; i < stepCount; i++) {
      const step = inputs.getStep(i);
      if (step) {
        console.log(`  Accumulating step ${i}: ${step.functionName}...`);
        await runner.accumulateStep(step);
      }
    }
    log('green', '✓ All steps accumulated');

    // Generate the proof
    console.log('  Generating final proof...');
    const proof = await runner.prove();

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log('green', `✓ Proof generated in ${elapsed} seconds`);

    // Step 6: Display proof details
    log('yellow', '\nProof details:');
    // Convert proof to buffer for display/saving
    const proofBuffer = Buffer.concat([
      ...proof.megaProof,
      ...proof.goblinProof.mergeProof,
      ...proof.goblinProof.eccvmProof.ipaProof,
      ...proof.goblinProof.translatorProof
    ]);
    console.log(`  - Size: ${proofBuffer.length} bytes`);
    console.log(`  - First 32 bytes (hex): ${proofBuffer.subarray(0, 32).toString('hex')}`);

    // Optional: Save proof to file
    const outputDir = join(__dirname, 'civc-proof-output');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const proofPath = join(outputDir, 'civc-proof.bin');
    const { writeFileSync } = await import('fs');
    writeFileSync(proofPath, proofBuffer);

    log('green', `\n✓ Proof saved to: ${proofPath}`);

    // Cleanup
    await api.close();
    log('green', '\n✓ Test completed successfully!');

  } catch (error) {
    log('red', '\nError:', error);
    process.exit(1);
  }
}

// Alternative approach using the complete flow
async function demonstrateCompleteFlow() {
  log('blue', '\n=== Alternative: Complete Flow ===');

  const code = `
    // Using the runComplete method for a simpler approach:
    const api = new NativeApi(bbPath);
    await api.init();

    const runner = new IvcRunner(api);
    const proof = await runner.runComplete(ivcInputsPath);

    console.log('Proof generated:', proof.length, 'bytes');
    await api.close();
  `;

  console.log('You can also use the simplified flow:');
  console.log(code);
}

main().then(() => {
  demonstrateCompleteFlow();
}).catch(console.error);
