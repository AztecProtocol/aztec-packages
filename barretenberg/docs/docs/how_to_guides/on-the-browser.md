---
title: Barretenberg on the browser
description: Complete guide to using bb.js for zero-knowledge proof generation and verification on the browser or node.js
keywords: [bb.js, barretenberg, proving, verifying, zero-knowledge, TypeScript, JavaScript, browser, node, node.js]
---

bb.js is the TypeScript/JavaScript prover and verifier library for Barretenberg. It provides both a command-line interface and a programmatic API for generating and verifying zero-knowledge proofs in Node.js and browser environments.

## Overview

bb.js supports multiple proof systems:

- **UltraHonk**: The current recommended proof system with various hash function options
- **Chonk**: For Aztec-specific client-side IVC proving

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

#include_code imports examples/basic.test.ts typescript

Using a precompiled program and a witness from `nargo execute`, you can directly import it and initialize the backend:

#include_code setup examples/basic.test.ts typescript

And just prove it using the witness:

#include_code prove examples/basic.test.ts typescript

Verification is similarly simple:

#include_code verify examples/basic.test.ts typescript

### Verifier Targets

UltraHonk supports different verifier targets for different verification environments. The `verifierTarget` option configures the hash function and zero-knowledge settings automatically:

- `evm` / `evm-no-zk`: For Ethereum/Solidity verification (uses keccak)
- `noir-recursive` / `noir-recursive-no-zk`: For recursive verification in Noir circuits (uses poseidon2)
- `noir-rollup` / `noir-rollup-no-zk`: For rollup circuits with IPA accumulation (uses poseidon2)
- `starknet` / `starknet-no-zk`: For Starknet verification via Garaga (reserved for future use)

#include_code verifier_targets examples/basic.test.ts typescript

### Getting Verification Keys (VK)

#include_code verification_keys examples/basic.test.ts typescript

### Getting Solidity Verifier

The solidity verifier _is_ the VK, but with some logic that allows for non-interactive verification:

#include_code solidity_verifier examples/basic.test.ts typescript

## Using the Low-Level API

For more control, you can use the Barretenberg API directly:

#include_code low_level_api examples/basic.test.ts typescript

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

The wasm binary's initial and maximum memory are link-time constants baked
into the Emscripten-built artifact. They cannot be tuned per `Barretenberg.new`
call -- the underlying `MODULARIZE=1` loader does not honor a runtime
override. To target a memory-constrained environment, rebuild bb.js with a
toolchain that pins the memory shape you need (see
`cmake/toolchains/wasm-emscripten.cmake`).
