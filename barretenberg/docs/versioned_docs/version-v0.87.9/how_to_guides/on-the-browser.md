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
