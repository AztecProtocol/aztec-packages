// Node-V8 Pippenger MSM benchmark for bb.js.
//
// Runs `pippenger_round_parallel` under Node's V8 — the engine the browser uses, unlike the
// wasmtime/Cranelift benchmark_wasm_remote.sh, whose numbers do not predict browser performance.
// Calls the bench_pippenger_round_parallel WASM_EXPORT (see
// cpp/src/barretenberg/ecc/scalar_multiplication/pippenger_wasm_export.cpp) directly via the
// low-level BarretenbergWasmMain (same threading path AztecClientBackend uses), sweeping a size
// grid. With the wasm built -DENABLE_WASM_BENCH=ON, each size prints the Stage1..Stage7
// per-stage breakdown (via info() -> logstr -> the logger below), to put next to the native and
// wasmtime sweeps.
//
// Prereq: bb.js built with the instrumented wasm:
//   (cd barretenberg/cpp && cmake --preset wasm-threads -DENABLE_WASM_BENCH=ON \
//        && cmake --build --preset wasm-threads --target barretenberg.wasm)
//   (cd barretenberg/ts && yarn build)   # or copy the wasm into dest/
//
// Usage (from barretenberg/ts):
//   WASM_BENCH_THREADS=8 node scripts/pippenger_v8_bench.mjs
//
// Env knobs:
//   WASM_BENCH_THREADS  integer   (default 8)   — worker threads (MSM reads this as get_num_cpus)
//   WASM_BENCH_ITERS    integer   (default 4)   — first iter is warmup (V8 tiers up)
//   PIPP_SIZES          csv       (default 2^17..2^21)

import { Barretenberg, BackendType } from '../dest/node/index.js';

const threads = Number(process.env.WASM_BENCH_THREADS ?? 8);
const iters = Math.max(1, Number(process.env.WASM_BENCH_ITERS ?? 4));
const sizes = (process.env.PIPP_SIZES ?? '131072,262144,524288,1048576,2097152')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(n => Number.isInteger(n) && n > 0);

async function main() {
  const maxSize = Math.max(...sizes);
  // initSRSChonk loads the monomial SRS into the wasm global CRS the export reads. Size it to the
  // largest sweep point (round up to a power of two to be safe).
  const srsSize = 1 << Math.ceil(Math.log2(maxSize));
  const api = await Barretenberg.new({ backend: BackendType.Wasm, threads, srsSize, logger: msg => console.log(msg) });
  // Reach the BarretenbergWasmMain on the SRS-loaded instance for the raw export call.
  const wasm = api.backend.wasm;

  // WASM_BENCH_IMPLS: csv of fast|legacy (default both, fast first).
  const impls = (process.env.WASM_BENCH_IMPLS ?? 'fast,legacy').split(',').map(s => s.trim());

  console.log(
    `[pippenger-v8] threads=${threads} iters=${iters} (1 warmup) srsSize=${srsSize} impls=${impls.join(',')} sizes=${sizes.join(',')}`,
  );
  for (const impl of impls) {
    const useLegacy = impl === 'legacy' ? 1 : 0;
    for (const n of sizes) {
      // bench_pippenger_round_parallel(uint32 num_points, uint32 num_iters, uint32 use_legacy); no outputs.
      wasm.callWasmExport('bench_pippenger_round_parallel', [n, iters, useLegacy], []);
    }
  }

  await api.destroy();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
