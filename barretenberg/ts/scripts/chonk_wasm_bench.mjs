// Node-V8 Chonk proving benchmark for bb.js.
//
// Times AztecClientBackend.prove() over the pinned chonk flows using the WASM backend run under Node's V8 — the same
// engine the browser uses, unlike the wasmtime-based benchmark_wasm_remote.sh (Cranelift), whose numbers do not
// predict browser performance. Run the same script against two builds (current vs baseline) and compare.
//
// Prereqs:
//   - bb.js is built: (cd barretenberg/ts && yarn build)   [needs the wasm artifact + dest/node]
//   - pinned inputs downloaded: barretenberg/cpp/scripts/chonk_inputs.sh download
//
// Usage (from barretenberg/ts so node_modules resolves):
//   node scripts/chonk_wasm_bench.mjs
//
// Env knobs:
//   WASM_BENCH_BACKEND   wasm | native           (default wasm)        — wasm = bb.js WASM under Node/V8
//   WASM_BENCH_THREADS   integer                 (default 16)          — set to your browser deployment's thread count
//   WASM_BENCH_ITERS     integer                 (default 3)           — first iter is warmup (V8 tiers up), discarded
//   CHONK_PINNED_IVC_FLOW    substring filter     (default: all flows)
//   CHONK_PINNED_IVC_INPUTS_DIR  override pinned-flows dir
//   AZTEC_REPO_ROOT      repo root                (default: ../.. from cwd)
//   BB_BINARY_PATH       bb binary (native backend only)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Decoder } from 'msgpackr';
import { ungzip } from 'pako';

import { AztecClientBackend, BackendType, Barretenberg } from '../dest/node/index.js';

const repoRoot = process.env.AZTEC_REPO_ROOT ?? resolve(process.cwd(), '../..');
const pinnedRoot = process.env.CHONK_PINNED_IVC_INPUTS_DIR ?? join(repoRoot, 'barretenberg/cpp/chonk-pinned-flows');
const backendLabel = (process.env.WASM_BENCH_BACKEND ?? 'wasm').toLowerCase();
const threads = Number(process.env.WASM_BENCH_THREADS ?? 16);
const iters = Math.max(1, Number(process.env.WASM_BENCH_ITERS ?? 3));
const flowFilter = process.env.CHONK_PINNED_IVC_FLOW;

function discoverFlows() {
  if (!existsSync(pinnedRoot)) {
    throw new Error(`pinned-flows dir not found: ${pinnedRoot}. Run barretenberg/cpp/scripts/chonk_inputs.sh download`);
  }
  return readdirSync(pinnedRoot)
    .map(name => join(pinnedRoot, name))
    .filter(p => statSync(p).isDirectory() && existsSync(join(p, 'ivc-inputs.msgpack')))
    .filter(p => (flowFilter ? basename(p).includes(flowFilter) : true))
    .sort();
}

function loadPinnedFlow(flowDir) {
  const buf = readFileSync(join(flowDir, 'ivc-inputs.msgpack'));
  const steps = new Decoder({ useRecords: false }).unpack(buf);
  if (!steps.length) {
    throw new Error(`No execution steps in ${flowDir}/ivc-inputs.msgpack`);
  }
  return {
    bytecodes: steps.map(s => ungzip(s.bytecode)),
    witnesses: steps.map(s => ungzip(s.witness)),
    vks: steps.map(s => new Uint8Array(s.vk)),
    names: steps.map(s => s.functionName),
  };
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function main() {
  const flows = discoverFlows();
  if (!flows.length) {
    throw new Error(`No pinned flows under ${pinnedRoot}${flowFilter ? ` matching '${flowFilter}'` : ''}`);
  }
  const backendType = backendLabel === 'native' ? BackendType.NativeUnixSocket : BackendType.Wasm;
  const defaultBbPath = join(repoRoot, 'barretenberg/cpp/build/bin/bb');
  const bbPath = process.env.BB_BINARY_PATH ?? (existsSync(defaultBbPath) ? defaultBbPath : undefined);

  console.log(
    `[chonk-wasm-bench] backend=${backendLabel} threads=${threads} iters=${iters} (1 warmup) flows=${flows.length}`,
  );

  const barretenberg = await Barretenberg.initSingleton({
    backend: backendType,
    threads,
    ...(backendType === BackendType.NativeUnixSocket && bbPath ? { bbPath } : {}),
  });

  const results = [];
  try {
    for (const flowDir of flows) {
      const name = basename(flowDir);
      const { bytecodes, witnesses, vks, names } = loadPinnedFlow(flowDir);
      const samples = [];
      let verified = false;
      for (let i = 0; i < iters; i++) {
        const backend = new AztecClientBackend(bytecodes, barretenberg, names);
        const t0 = performance.now();
        const { proof, vk } = await backend.prove(witnesses, vks);
        const ms = performance.now() - t0;
        if (i === 0) {
          verified = await backend.verify(proof, vk);
        }
        await backend.destroy?.();
        samples.push(ms);
        console.log(`  ${name} iter ${i}${i === 0 ? ' (warmup)' : ''}: ${ms.toFixed(0)} ms`);
      }
      const measured = iters > 1 ? samples.slice(1) : samples;
      results.push({ name, median: median(measured), min: Math.min(...measured), verified });
    }
  } finally {
    await Barretenberg.destroySingleton();
  }

  console.log(`\n[chonk-wasm-bench] summary (median of measured iters, backend=${backendLabel} threads=${threads}):`);
  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(55)} ${r.median.toFixed(0).padStart(8)} ms  (min ${r.min.toFixed(0)} ms)  verified=${r.verified}`,
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
