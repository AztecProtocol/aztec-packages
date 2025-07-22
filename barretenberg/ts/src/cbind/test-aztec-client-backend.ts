#!/usr/bin/env node
import { AztecClientBackend } from '../barretenberg/backend.js';
import { IvcInputs } from './ivc-inputs.js';
import { existsSync } from 'fs';

/**
 * Simple test specifically for AztecClientBackend
 */
async function testAztecClientBackend() {
  const inputsPath = './ivc-inputs.msgpack';
  
  console.log('=== AztecClientBackend Test ===');
  console.log('Input file:', inputsPath);
  
  if (!existsSync(inputsPath)) {
    console.error('Error: ivc-inputs.msgpack file not found');
    console.log('Please ensure the file exists in the current directory');
    return;
  }

  try {
    // Load IVC inputs
    const inputs = IvcInputs.fromFile(inputsPath);
    const steps = inputs.getSteps();
    console.log(`✓ Loaded ${steps.length} circuits from input file`);

    // Extract data for each circuit
    const bytecodes = steps.map(step => step.bytecode);
    const witnesses = steps.map(step => step.witness);
    const vks = steps.map(step => step.vk);

    // Log circuit details
    steps.forEach((step, i) => {
      console.log(`  Circuit ${i}: ${step.functionName}`);
      console.log(`    - Bytecode: ${step.bytecode.length} bytes`);
      console.log(`    - Witness: ${step.witness.length} bytes`);
      console.log(`    - VK: ${step.vk.length} bytes`);
    });

    // Create AztecClientBackend
    console.log('\nCreating AztecClientBackend...');
    const backend = new AztecClientBackend(bytecodes);
    
    // Generate proof
    console.log('Generating ClientIVC proof...');
    const startTime = Date.now();
    
    const [proof, vk] = await backend.prove(witnesses, vks);
    
    const elapsedTime = Date.now() - startTime;
    console.log(`✓ Proof generated in ${elapsedTime}ms`);
    console.log(`  - Proof size: ${proof.length} bytes`);
    console.log(`  - VK size: ${vk.length} bytes`);
    
    // Verify the proof (this is also done internally in prove())
    console.log('\nVerifying proof...');
    const isValid = await backend.verify(proof, vk);
    console.log(`✓ Proof verification: ${isValid ? 'VALID' : 'INVALID'}`);
    
    if (!isValid) {
      throw new Error('Proof verification failed');
    }

    // Clean up
    await backend.destroy();
    console.log('\n✅ AztecClientBackend test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testAztecClientBackend().catch(console.error);