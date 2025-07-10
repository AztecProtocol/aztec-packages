---
title: Barretenberg on the browser
description: Complete guide to using bb.js for zero-knowledge proof generation and verification on the browser or node.js
keywords: [bb.js, barretenberg, proving, verifying, zero-knowledge, TypeScript, JavaScript, browser, node, node.js]
---

bb.js is the TypeScript/JavaScript prover and verifier library for Barretenberg. It provides both a command-line interface and a programmatic API for generating and verifying zero-knowledge proofs in Node.js and browser environments.

## Overview

bb.js supports multiple proof systems:

- **UltraHonk**: The current recommended proof system with various hash function options
- **MegaHonk**: Alternative Honk implementation
- **ClientIVC**: For Aztec-specific client-side proving

## Installation

### As a Library

Install bb.js as a dependency in your project:

```bash
npm install @aztec/bb.js
```

or with yarn:

```bash
yarn add @aztec/bb.js
```

## Proving and Verifying with UltraHonk

### Using the UltraHonkBackend Class

The `UltraHonkBackend` class provides a high-level interface for proof generation and verification:

```typescript
import { UltraHonkBackend } from '@aztec/bb.js';

// Initialize with ACIR bytecode (base64 encoded)
const backend = new UltraHonkBackend(
  bytecode, // i.e. from `nargo compile`
  { threads: 4 }, // optional backend options
  { recursive: false } // optional circuit options
);

// i.e. using the witness data out of `nargo execute`
const witness = new Uint8Array(readFileSync("./target/program.gz"));
const proofData = await backend.generateProof(witness);

// Verify the proof
const isValid = await backend.verifyProof(proofData);
```

### Working with Different Hash Functions

UltraHonk supports different hash functions for different target verification environments:

```typescript
// Standard UltraHonk (uses Poseidon)
const proof = await backend.generateProof(witness);

// Keccak variant (for EVM verification)
const proofKeccak = await backend.generateProof(witness, { keccak: true });

// ZK variants for recursive proofs
const proofKeccakZK = await backend.generateProof(witness, { keccakZK: true });

```

### Getting Verification Keys (VK)

```typescript
// Get verification key
const vk = await backend.getVerificationKey();

// For a solidity verifier:
const vkKeccak = await backend.getVerificationKey({ keccak: true });
```

### Getting Solidity Verifier

```typescript
// Needs the keccak hash variant of the VK
const solidityContract = await backend.getSolidityVerifier(vkKeccak);
```

## Using the Low-Level API

For more control, you can use the Barretenberg API directly:

### Basic Cryptographic Operations

```typescript
const api = await Barretenberg.new({ threads: 1 });

// Blake2s hashing
const input = Buffer.from('hello world!');
const hash = await api.blake2s(input);

// Pedersen commitment
const left = Buffer.from('left input');
const right = Buffer.from('right input');
const commitment = await api.pedersenCommit(left, right);

await api.destroy();
```

## Browser Environment Considerations

### Multithreading Support

To enable multithreading in browsers using some frameworks (ex. Next.js), you may need to set COOP and COEP headers:

```javascript
// Next.js example configuration
{
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
}
```

## Performance Optimization

### Thread Configuration

```typescript
// Auto-detect optimal thread count (default)
const api = await Barretenberg.new();

// Manual thread configuration
const api = await Barretenberg.new({
  threads: Math.min(navigator.hardwareConcurrency || 1, 8)
});

// Single-threaded for compatibility
const api = await Barretenberg.new({ threads: 1 });
```

### Memory Management

```typescript
// Configure initial and maximum memory
const api = await Barretenberg.new({
  threads: 4,
  memory: {
    initial: 128 * 1024 * 1024,  // 128MB
    maximum: 512 * 1024 * 1024   // 512MB
  }
});
```

### Resource Cleanup

Always clean up resources to prevent memory leaks:

```typescript
const backend = new UltraHonkBackend(bytecode);

try {
  const proof = await backend.generateProof(witness);
  return proof;
} finally {
  // Essential for preventing memory leaks
  await backend.destroy();
}
```

## Error Handling

```typescript
import { UltraHonkBackend } from '@aztec/bb.js';

async function generateProofSafely(bytecode: string, witness: Uint8Array) {
  let backend: UltraHonkBackend | null = null;

  try {
    backend = new UltraHonkBackend(bytecode, { threads: 4 });
    const proof = await backend.generateProof(witness);
    return { success: true, proof };
  } catch (error) {
    console.error('Proof generation failed:', error);
    return { success: false, error: error.message };
  } finally {
    if (backend) {
      await backend.destroy();
    }
  }
}
```

## Complete Example

Here's a complete example that demonstrates the full proving workflow:

```typescript
import { UltraHonkBackend, ProofData } from '@aztec/bb.js';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

async function proveAndVerify() {
  // Load circuit bytecode (from Noir compiler output)
  const circuitJson = JSON.parse(readFileSync('./target/program.json', 'utf8'));
  const bytecode = circuitJson.bytecode;

  // Load witness data
  const witnessBuffer = readFileSync('./target/witness.gz');
  const witness = gunzipSync(witnessBuffer);

  // Initialize backend
  const backend = new UltraHonkBackend(
    bytecode,
    { threads: 4 }, // Use 4 threads for proving
    { recursive: false }
  );

  try {
    console.log('Generating proof...');
    const startTime = Date.now();

    // Generate proof with Keccak for EVM verification
    const proofData: ProofData = await backend.generateProof(witness, {
      keccak: true
    });

    const provingTime = Date.now() - startTime;
    console.log(`Proof generated in ${provingTime}ms`);
    console.log(`Proof size: ${proofData.proof.length} bytes`);
    console.log(`Public inputs: ${proofData.publicInputs.length}`);

    // Verify the proof
    console.log('Verifying proof...');
    const isValid = await backend.verifyProof(proofData, { keccak: true });
    console.log(`Proof verification: ${isValid ? 'SUCCESS' : 'FAILED'}`);

    // Get Solidity verifier contract
    const vk = await backend.getVerificationKey({ keccak: true });
    const contract = await backend.getSolidityVerifier(vk);

    console.log('Solidity verifier contract generated');

    return {
      proof: proofData,
      isValid,
      contract,
      provingTime
    };

  } finally {
    // Always clean up
    await backend.destroy();
  }
}

// Run the example
proveAndVerify()
  .then(result => {
    console.log('Success!', result);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```
