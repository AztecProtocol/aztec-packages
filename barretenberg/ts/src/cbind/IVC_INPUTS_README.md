# IVC Inputs Module

This module provides TypeScript utilities for working with IVC (Incremental Verifiable Computation) input files (`ivc-inputs.msgpack`) used by the Barretenberg Client IVC API.

## Overview

The IVC inputs format is a msgpack-encoded array of private execution steps. Each step contains:
- `bytecode`: The circuit bytecode
- `witness`: The witness data for the circuit
- `vk`: The verification key (optional)
- `functionName`: The name of the function/circuit

## Usage

### Reading IVC Inputs

```typescript
import { IvcInputs } from '@aztec/bb.js/cbind';

// Load from file
const inputs = IvcInputs.fromFile('./ivc-inputs.msgpack');

// Access steps
const stepCount = inputs.getStepCount();
const firstStep = inputs.getStep(0);

console.log(`Loaded ${stepCount} steps`);
console.log(`First step: ${firstStep?.functionName}`);
```

### Writing IVC Inputs

```typescript
import { IvcInputs } from '@aztec/bb.js/cbind';

// Create new inputs
const inputs = new IvcInputs();

// Add steps
inputs.addStep({
  bytecode: Buffer.from(compiledBytecode),
  witness: Buffer.from(witnessData),
  vk: Buffer.from(verificationKey),
  functionName: 'my_circuit',
});

// Save to file
inputs.toFile('./my-ivc-inputs.msgpack');
```

### Using with Generated APIs

The `IvcRunner` class provides a high-level interface that works with any of the three generated APIs:

```typescript
import { IvcRunner } from '@aztec/bb.js/cbind';
import { NativeApi, AsyncApi, SyncApi } from '@aztec/bb.js/cbind';

// With Native API (using bb binary)
const nativeApi = new NativeApi('/path/to/bb');
await nativeApi.init();
const nativeRunner = new IvcRunner(nativeApi);

// With Async API (using WASM)
const wasm = new BarretenbergWasmMain();
await wasm.init();
const asyncApi = new AsyncApi(wasm);
const asyncRunner = new IvcRunner(asyncApi);

// With Sync API (using WASM)
const syncApi = new SyncApi(wasm);
const syncRunner = new IvcRunner(syncApi);
```

### Running IVC Flows

```typescript
// Complete flow: start, accumulate all steps, and prove
const proof = await runner.runComplete('./ivc-inputs.msgpack');

// Or run steps individually
await runner.start(numCircuits);
await runner.accumulateStep(step);
const proof = await runner.prove();

// Check precomputed verification keys
const allValid = await runner.checkPrecomputedVks('./ivc-inputs.msgpack');
```

## Polymorphic Design

The module is designed to work polymorphically with all three API implementations. Any function that accepts an `IvcApi` interface will work with:

- `SyncApi` - Synchronous WASM API
- `AsyncApi` - Asynchronous WASM API  
- `NativeApi` - Native binary API via subprocess

This allows you to write code once and use it with different backends based on your needs.

## Examples

See the test files for complete examples:
- `test-ivc-runner.ts` - Demonstrates basic usage with Native API
- `test-ivc-wasm.ts` - Shows usage with WASM APIs