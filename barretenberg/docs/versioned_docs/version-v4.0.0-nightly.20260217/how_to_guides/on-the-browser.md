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
- **Chonk**: For Aztec-specific client-side proving

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

The `UltraHonkBackend` class provides a high-level interface for proof generation and verification. You can import any specific backend (i.e. UltraHonk):

```typescript
import { UltraHonkBackend } from '@aztec/bb.js';
```


Using a precompiled program and a witness from `nargo execute`, you can directly import it and initialize the backend:

```typescript
// Load circuit bytecode (from Noir compiler output)
const circuitPath = path.join(__dirname, 'fixtures/main/target/program.json');
const circuitJson = JSON.parse(readFileSync(circuitPath, 'utf8'));
const bytecode = circuitJson.bytecode;

// Load witness data
const witnessPath = path.join(__dirname, 'fixtures/main/target/program.gz');
const witnessBuffer = readFileSync(witnessPath);

// Initialize backend
const backend = new UltraHonkBackend(bytecode);
```


And just prove it using the witness:

```typescript
// Generate proof for EVM verification (uses keccak hash, no ZK)
const proofData: ProofData = await backend.generateProof(witnessBuffer, {
  verifierTarget: 'evm-no-zk',
});

const provingTime = Date.now() - startTime;
console.log(`Proof generated in ${provingTime}ms`);
console.log(`Proof size: ${proofData.proof.length} bytes`);
console.log(`Public inputs: ${proofData.publicInputs.length}`);
```


Verification is similarly simple:

```typescript
// Verify the proof
console.log('Verifying proof...');
const isValid = await backend.verifyProof(proofData, { verifierTarget: 'evm-no-zk' });
console.log(`Proof verification: ${isValid ? 'SUCCESS' : 'FAILED'}`);
```


### Verifier Targets

UltraHonk supports different verifier targets for different verification environments. The `verifierTarget` option configures the hash function and zero-knowledge settings automatically:

- `evm` / `evm-no-zk`: For Ethereum/Solidity verification (uses keccak)
- `noir-recursive` / `noir-recursive-no-zk`: For recursive verification in Noir circuits (uses poseidon2)
- `noir-rollup` / `noir-rollup-no-zk`: For rollup circuits with IPA accumulation (uses poseidon2)
- `starknet` / `starknet-no-zk`: For Starknet verification via Garaga

```typescript
// Default: recursive verification in Noir (poseidon2, ZK enabled)
const proof = await backend.generateProof(witnessBuffer);
expect(proof.proof.length).toBeGreaterThan(0);

// EVM verification without ZK (keccak hash)
const proofEvm = await backend.generateProof(witnessBuffer, { verifierTarget: 'evm-no-zk' });
expect(proofEvm.proof.length).toBeGreaterThan(0);

// EVM verification with ZK (keccak hash)
const proofEvmZk = await backend.generateProof(witnessBuffer, { verifierTarget: 'evm' });
expect(proofEvmZk.proof.length).toBeGreaterThan(0);

// Recursive verification in Noir (explicit)
const proofRecursive = await backend.generateProof(witnessBuffer, { verifierTarget: 'noir-recursive' });
expect(proofRecursive.proof.length).toBeGreaterThan(0);
```


### Getting Verification Keys (VK)

```typescript
// Get verification key for recursive verification (default)
const vk = await backend.getVerificationKey();

// For a solidity verifier (EVM target):
const vkEvm = await backend.getVerificationKey({ verifierTarget: 'evm-no-zk' });
```


### Getting Solidity Verifier

The solidity verifier _is_ the VK, but with some logic that allows for non-interactive verification:

```typescript
// Needs the EVM target VK (uses keccak hash)
const solidityContract = await backend.getSolidityVerifier(vkEvm, { verifierTarget: 'evm-no-zk' });
```


## Using the Low-Level API

For more control, you can use the Barretenberg API directly:

```typescript
const api = await Barretenberg.new({ threads: 1 });

// Blake2s hashing
const input = Buffer.from('hello world!');
const hash = await api.blake2s(input);

// Pedersen commitment
const left = Fr.random();
const right = Fr.random();
const commitment = await api.pedersenCommit([left, right], 0);

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

You can define specific thread counts in case you need the cores for other things in your app:

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

It can be useful to manage memory manually, specially if targeting specific memory-constrained environments (ex. Safari):

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
