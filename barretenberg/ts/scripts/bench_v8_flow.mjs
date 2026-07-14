// Prove one pinned Chonk flow under Node/V8 via bb.js (the realistic client/browser engine),
// timing the prove. This is the same threaded wasm path a browser uses (Worker threads +
// SharedArrayBuffer), driven from Node so it scripts cleanly on a laptop.
//
// Usage: node scripts/bench_v8_flow.mjs <flowDir> <threads> [wasmPath]
//   <flowDir>   directory containing ivc-inputs.msgpack
//   <threads>   thread count == HARDWARE_CONCURRENCY (see SKILL.md for the HC mapping)
//   [wasmPath]  optional .wasm.gz to load instead of the packaged dest wasm. This is how you
//               A/B two commits: build barretenberg.wasm.gz at each and pass each path here.
//
// Prints "PROVE_MS=<n>" on success (internal prove time, excludes wasm compile + CRS init).
// Set VERIFY=1 for a one-time correctness check. Peak RSS is captured by the caller
// (/usr/bin/time -l), but note the phone-faithful memory metric is the wasm linear heap, not RSS.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Decoder } from 'msgpackr';
import { ungzip } from 'pako';
import { AztecClientBackend, BackendType, Barretenberg } from '../dest/node/index.js';

const flowDir = process.argv[2];
const threads = Number(process.argv[3]);
const wasmPath = process.argv[4] || undefined;
if (!flowDir || !Number.isInteger(threads)) {
  console.error('usage: node scripts/bench_v8_flow.mjs <flowDir> <threads> [wasmPath]');
  process.exit(2);
}

const steps = new Decoder({ useRecords: false }).unpack(readFileSync(join(flowDir, 'ivc-inputs.msgpack')));
if (!steps.length) throw new Error(`no execution steps in ${flowDir}`);
const bytecodes = steps.map(s => ungzip(s.bytecode));
const witnesses = steps.map(s => ungzip(s.witness));
const vks = steps.map(s => new Uint8Array(s.vk));
const names = steps.map(s => s.functionName);
const kinds = steps.map(s => s.kind);

const bb = await Barretenberg.initSingleton({
  backend: BackendType.Wasm,
  threads,
  ...(wasmPath ? { wasmPath } : {}),
});

try {
  const backend = new AztecClientBackend(bytecodes, bb, names, kinds);
  const t0 = performance.now();
  const { proof, vk } = await backend.prove(witnesses, vks);
  const t1 = performance.now();
  if (process.env.VERIFY === '1') {
    console.log(`VERIFIED=${await backend.verify(proof, vk)}`);
  }
  console.log(`PROVE_MS=${Math.round(t1 - t0)}`);
} finally {
  await Barretenberg.destroySingleton();
}
