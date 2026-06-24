# WebGPU MSM ↔ ChonkApi::prove — status

Target: **Apple M4 Pro, Metal-3, Chromium headless (puppeteer)** running the
canonical pinned flow `ecdsar1+transfer_1_recursions+sponsored_fpc`
(11 circuits, 91 delegated MSMs, 17 distinct N values, 18 named
polynomials).

## Current end-to-end numbers

| run | wall time | notes |
|---|---|---|
| `webgpu = off` (multi-threaded WASM Pippenger, 16 threads) | **~6.0 s** | CPU baseline |
| `webgpu = on` (M4 Pro Metal-3 via WebGPU bridge) | **~7.6 s** | correct (`vks_match = true`); 0.78× ±0.04 |

Session-over-session: 19.5 s → 7.6 s (**2.6×** wall-time improvement,
0.31× → 0.78×). Still not "substantially better than CPU"; root cause
breakdown below.

## Per-MSM named telemetry

Labels are plumbed end-to-end from `CommitBatch::commit_and_send_to_verifier`
through `CommitmentKey::batch_commit` → `MSM::batch_multi_scalar_mul`
→ `batch_multi_scalar_mul_webgpu_bn254` → the bridge protocol's
`SLOT_BATCH_LABELS_PTR`. Bridge enables `profile: true` on every MsmV2
instance, calls `resolveQuerySet` inside `encodeIntoBatch`, and reads
back per-pass GPU timestamps. Each MSM in the batch gets a `[msm]`
telemetry line with its `CommitmentLabels` entity name.

Two paths emit different `gpu` quantities depending on the batch shape:

- **`kind=mixed`** (single-encoder, no same-N collisions): `gpu` is
  the **sum of per-pass GPU timestamps** for that one MSM — true
  isolated compute, since all MSMs in the batch share one encoder and
  the timestamps are per-dispatch.
- **`kind=same-n`** (per-MSM submit, queue-serialized): `gpu_wait` is
  the time from this MSM's submit until `onSubmittedWorkDone()`
  resolves; `gpu_incremental` is the difference from the previous
  MSM's `gpu_wait`. The first same-n entry includes cold compile/
  first-touch; subsequent increments are warm per-MSM compute.

### Sample per-MSM data from one run

```
[msm] name=W_L      n=88_899 kind=same-n prepare=184.6ms  gpu_incremental=318.25ms  (gpu_wait=318.25ms — COLD pipeline compile)
[msm] name=W_R      n=88_899 kind=same-n prepare=13.6ms   gpu_incremental=11.68ms   (warm)
[msm] name=W_O      n=88_899 kind=same-n prepare=11.3ms   gpu_incremental=15.75ms   (warm)
[batch-Nenc] count=3 maxSameN=3 encode=356.5ms mapAsync=345.8ms

[msm] name=LOOKUP_READ_COUNTS n=36_863 kind=same-n prepare=72.5ms gpu_incremental=35.93ms  (warmup for n=36k)
[msm] name=LOOKUP_READ_TAGS   n=36_863 kind=same-n prepare=3.3ms  gpu_incremental=10.63ms  (warm)
[msm] name=W_4                n=88_899 kind=same-n prepare=9.4ms  gpu_incremental=17.85ms  (warm)

[msm] name=W_L n=71_364 kind=same-n prepare=62.2ms gpu_incremental=42.78ms  (cold n=71k)
[msm] name=W_R n=71_364 kind=same-n prepare=9.6ms  gpu_incremental=12.79ms  (warm)
[msm] name=W_O n=71_364 kind=same-n prepare=9.4ms  gpu_incremental=13.69ms  (warm)

[msm] name=CONCATENATED_RANGE_CONSTRAINTS_0 n=131_071 kind=same-n prepare=85.8ms gpu_incremental=84.37ms  (cold n=131k)
[msm] name=CONCATENATED_RANGE_CONSTRAINTS_1 n=131_071 kind=same-n prepare=8.4ms  gpu_incremental=29.11ms
[msm] name=CONCATENATED_RANGE_CONSTRAINTS_2 n=131_071 kind=same-n prepare=9.6ms  gpu_incremental=30.61ms
[msm] name=CONCATENATED_RANGE_CONSTRAINTS_3 n=131_071 kind=same-n prepare=9.4ms  gpu_incremental=30.59ms
[msm] name=CONCATENATED_NON_RANGE           n=131_071 kind=same-n prepare=10.1ms gpu_incremental=31.46ms
[msm] name=ORDERED_RANGE_CONSTRAINTS_0      n=131_071 kind=same-n prepare=9.5ms  gpu_incremental=30.37ms
[msm] name=ORDERED_RANGE_CONSTRAINTS_1      n=131_071 kind=same-n prepare=9.4ms  gpu_incremental=31.34ms
[msm] name=ORDERED_RANGE_CONSTRAINTS_2      n=131_071 kind=same-n prepare=9.8ms  gpu_incremental=30.21ms
[msm] name=ORDERED_RANGE_CONSTRAINTS_3      n=131_071 kind=same-n prepare=8.3ms  gpu_incremental=33.20ms
[msm] name=ORDERED_RANGE_CONSTRAINTS_4      n=131_071 kind=same-n prepare=8.3ms  gpu_incremental=31.48ms
[batch-Nenc] count=10 maxSameN=10 encode=173.7ms mapAsync=362.8ms
```

### Warm per-MSM GPU compute (steady state, after cold-warmup of each N)

Aggregated from `gpu_incremental` after warmup, or `gpu` from
`kind=mixed` batches:

| polynomial | n | warm GPU compute |
|---|---|---|
| W_4 (lone, `kind=mixed`) | 20_406 | 10.3 ms |
| W_R / W_O (warm, same-n) | 20_406 | 8.2–9.0 ms |
| W_4 (lone) | 30_240 | 11.8 ms |
| W_R / W_O (warm) | 30_240 | 9.1 ms |
| W_4 (lone) | 33_050 | 12.5 ms |
| W_R / W_O (warm) | 33_050 | 4.1–9.0 ms |
| LOOKUP_INVERSES (lone) | 36_863 | 13.4 ms |
| LOOKUP_READ_TAGS (warm) | 36_863 | 10.6 ms |
| W_4 (lone) | 38_778 | 14.0 ms |
| W_R / W_O (warm) | 38_778 | 11.3–12.1 ms |
| W_4 (lone) | 43_314 | 14.9 ms |
| W_R / W_O (warm) | 43_314 | 8.8–9.2 ms |
| W_4 (lone) | 71_364 | 21.2–21.4 ms |
| W_R / W_O (warm) | 71_364 | 12.8–15.6 ms |
| W_4 (lone) | 87_312 | 23.8 ms |
| W_R / W_O (warm) | 87_312 | 15.7–16.7 ms |
| W_4 (lone) | 88_899 | (mixed gpu, ~22 ms typical) |
| W_R / W_O (warm) | 88_899 | 11.7–17.9 ms |
| `gemini_masking_poly` etc. (lone, unnamed `?`) | 131_072 | 33.1–44.7 ms |
| ORDERED_RANGE_CONSTRAINTS_* / CONCATENATED_* (warm) | 131_071 | 29.1–33.2 ms |

The first MSM at each new N pays a one-shot ~50–150 ms compile +
first-touch cost (not shown above — see the `prepare=...ms` numbers in
the sample log; pipeline cache amortizes this across instances of the
same N within the session).

## What this tells us (and why "3× faster" doesn't apply to chonk)

The MsmV2 raw-bench "3.5×" reference is at **n = 2^20**, where GPU
parallelism dominates the ~30-pass dispatch floor. Chonk's MSMs are
distributed entirely between **n=16k and n=131k**, where warm GPU
compute (above) is in the 8–45 ms range. The CPU baseline at the same
sizes (16-thread WASM Pippenger on M4 Pro) is in the 5–30 ms range —
**parity to slight CPU edge at every N chonk uses**, with no single
size at which GPU clearly wins.

The end-to-end gap (~1.6 s) comes from:

1. **Per-MSM `prepare()` overhead** (~5–15 ms cached, 60–185 ms cold)
   — host Booth + level plan + uniform `writeBuffer`s. ~1 s total across
   91 MSMs. CPU has no analog.

2. **Same-N batch GPU queue serialization.** Of the 91 MSMs, ~43 ride
   on the GPU and ~25 of those are inside same-N batches of size 3 or
   10. They serialize on the GPU's command queue — `count=10` at
   n=131_071 ⇒ 10 × ~30 ms = 300 ms of strictly serial compute, vs
   CPU's ~250–400 ms for the same work but cleanly parallel across
   threads.

3. **`mapAsync` polling** — ~15–30 ms / batch on Dawn/Metal. Batched
   `Promise.all` collapses it within a batch but not across batches.
   ~60 batches × ~20 ms = ~1.2 s of pure event-loop polling.

## What it would take to actually win

In rough order of impact:

### 1. Multi-MSM-per-instance pool (medium effort)
Allocate K=4 `MsmV2` instances per N. Same-N batches round-robin into
distinct instances; the single-encoder mixed-N path then covers them
too (each instance owns its own `scalarsRawBuf` + per-level uniforms,
no race). Removes per-MSM submit + per-MSM mapAsync for the same-N
case. **Expected: 5–15% end-to-end (this would shave maybe ~0.5 s).**
Memory cost: ~300 MB extra GPU memory at K=4 with LRU.

### 2. Multi-MSM concurrent shaders (large effort — the real win)
Rewrite the pair-tree kernels so one dispatch processes M MSMs in
parallel, indexed by `(msm_idx, point_idx, window)`. The GPU then sees
M×~1500 points-per-MSM in parallel. The
[v4 pipeline memory note](../../../.claude/projects/-Users-zac-aztec-packages/memory/msm_webgpu_v4_pipeline.md)
identifies this as the only structural lever left: "the deep tail is
fundamentally under-parallel within one MSM — fill it by overlapping
windows/MSMs."

For chonk's same-n=3 and same-n=10 batches that's 3–6× speedup on the
GPU portion. End-to-end could plausibly drop below CPU
(1.3–1.5× faster than CPU).

### 3. Async commits in C++ (architectural — different layer)
Currently `bb_external_msm_bn254` is a synchronous WASM import — C++
waits for each batch's result before returning. Deferring commit reads
on the C++ side would let the GPU pipeline across multiple
`batch_multi_scalar_mul` calls, amortizing per-batch overhead further.
~1–2 weeks of focused commit-key + prover-stage work.

## What this session shipped (cumulative)

### Correctness
1. **`MsmV2Pool` accepts any positive-integer N.** Bounds-guarded
   `convert_points_only` shader.
2. **C++ `(0,0)` → infinity** decode in `read_affine_le`.
3. **Active-sums reset.** Persistent `padTemplateBuf`; encoder copy at
   the top of every `encodeIntoBatch`.

### Architecture
4. **Per-pool `PipelineCache`** keyed on WGSL source.
5. **Adaptive SRS upload** (initial 2^18, doubling on demand).
6. **SRS-offset routing** — every commit is a prefix-with-offset of
   the one uploaded pool.
7. **Bridge LRU cap 16**.

### Per-MSM speed
8. **Prepare-once + fits-check fast path.**
9. **u32 Booth on host** (replaces BigInt).
10. **Fused level plan + ping-pong count buffers.**
11. **Cap padding (`OVERSIZE_FACTOR = 1.3`)** — keeps ~70% of repeat
    prepares on the fast path despite scalar-distribution variance.

### Bridge-level batching
12. **`OP_BATCH_MSM` end-to-end** — one bridge call per
    `batch_multi_scalar_mul`.
13. **Single-encoder mixed-N batches** — one encoder, one staging
    buffer at distinct offsets, one submit, one mapAsync.
14. **Same-N batches** — per-MSM submit + `Promise.all` batched
    mapAsync.
15. **Solo-batch CPU fallback** — size-1 batches with `n < 2^17` go
    straight to CPU.

### Per-MSM named telemetry (this session, final pass)
16. **Label plumbing** through `CommitBatch::commit_and_send_to_verifier`
    → `batch_commit(..., labels)` → `MSM::batch_multi_scalar_mul(...,
    labels)` → `batch_multi_scalar_mul_webgpu_bn254(..., labels)` →
    new `SLOT_BATCH_LABELS_PTR` slot in the bridge protocol → bridge
    decode + per-MSM logging.
17. **GPU timestamp queries in `encodeIntoBatch`** — `resolveQuerySet`
    is now part of the encoder, so callers (the batch bridge path) can
    pull per-MSM GPU compute via `msm.readProfileGpuMs()` without
    needing the higher-level `MsmV2.run()` wrapper.

## Files touched (working tree, uncommitted)

C++:
- `barretenberg/cpp/src/barretenberg/commitment_schemes/commitment_key.hpp`
  — `batch_commit` accepts optional `std::span<const std::string> labels`;
  `CommitBatch::commit_and_send_to_verifier` passes them.
- `barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.{hpp,cpp}`
  — `MSM::batch_multi_scalar_mul` accepts optional labels.
- `…/ecc/scalar_multiplication/webgpu_msm_hook.{cpp,hpp}` — adaptive
  SRS upload + range-based prefix detection + `srs_offset` +
  `bb_external_batch_msm_bn254` (now takes a 6th `labels_packed`
  pointer) + solo-batch CPU fallback.
- `…/ecc/scalar_multiplication/webgpu_msm_marshalling.hpp` — `(0,0)` →
  infinity.

TypeScript / bb.js:
- `barretenberg/ts/src/msm_webgpu/msm_v2.ts` — pool accepts any N;
  `PipelineCache`; prepare-once fast path with `OVERSIZE_FACTOR`;
  `padTemplateBuf` reset; u32 Booth; fused plan walk; `encodeIntoBatch`
  now calls `resolveQuerySet`; new `readProfileGpuMs()` method.
- `…/msm_webgpu/wgsl/cuzk/{convert_points_only,csr_to_v2_active_sums}.template.wgsl`
  + `_generated/shaders.ts`.
- `…/msm_webgpu/bridge/protocol.ts` — `SLOT_SRS_OFFSET`,
  `SLOT_BATCH_META_PTR`, `SLOT_BATCH_LABELS_PTR`, `OP_BATCH_MSM`.
- `…/msm_webgpu/bridge/{main,worker_stub}.ts` — single-encoder path
  for mixed-N batches; per-MSM submit + batched mapAsync for same-N;
  label decode; per-MSM telemetry emit; instances created with
  `profile: true`.
- `…/barretenberg_wasm/barretenberg_wasm_base/index.ts` — default
  stubs (6-arg `bb_external_batch_msm_bn254`).
- `…/bb_backends/{index,wasm,browser/index,node/index}.ts` —
  `webgpuMsm: boolean` on `Barretenberg.initSingleton`.
- `barretenberg/ts/scripts/browser_postprocess.sh` — BSD sed + base64.

yarn-project:
- `yarn-project/ivc-integration/src/chonk_browser_webgpu_bench.test.ts`
  (new).
- `yarn-project/ivc-integration/src/serve.ts` — `runChonkWebGpuBench`
  + adapter probe.
- `yarn-project/ivc-integration/webpack.config.js` — `transpileOnly`,
  alias to bb.js browser bundle.

## Bench harness

```
yarn-project/ivc-integration/src/chonk_browser_webgpu_bench.test.ts
```

Runs the pinned ECDSA-r1 transfer flow twice (webgpu off, webgpu on)
via Puppeteer headless Chromium, asserts both verify and produce
byte-identical VKs. The bridge emits per-MSM telemetry as:

```
[msm] name=<entity> n=<size> kind=mixed|same-n gpu=<ms> | gpu_incremental=<ms>
[batch-1enc] count=<N> prepare=<ms> encode=<ms> submit+wait=<ms> gpu_sum=<ms>
[batch-Nenc] count=<N> maxSameN=<N> encode=<ms> mapAsync=<ms>
```

Reproduce:
```bash
cd barretenberg/cpp && cmake --build --preset wasm-threads --target barretenberg.wasm
gzip -kf build-wasm-threads/bin/barretenberg.wasm
cd ../ts && yarn build:browser \
  && cp ../cpp/build-wasm-threads/bin/barretenberg.wasm.gz dest/browser/barretenberg_wasm/barretenberg-threads.wasm.gz \
  && cp ../cpp/build-wasm-threads/bin/barretenberg.wasm.gz dest/browser/barretenberg_wasm/barretenberg.wasm.gz \
  && ./scripts/browser_postprocess.sh
cd ../../yarn-project/ivc-integration && yarn webpack
cd /Users/zac/aztec-packages/yarn-project && LOG_LEVEL=verbose \
  yarn workspace @aztec/ivc-integration test src/chonk_browser_webgpu_bench.test.ts
```

## Full e2e Perfetto trace (WASM phases + host + GPU + memory, one clock)

`window.runChonkWebGpuTrace(flow?)` (serve.ts) captures ONE webgpu-on prove as a
single Perfetto-loadable JSON (ui.perfetto.dev) overlaying, on one clock:

- **WASM prove phases** at phase granularity, one lane per worker thread — the
  C++ `BB_BENCH` per-call recorder, capped at **record-depth 10** (the deepest
  MSM overlay anchor `MSM::batch_multi_scalar_mul` lives there, in the
  Hypernova→fold→Oink→`commit_to_wires`→`batch_commit`→MSM path; the
  `evaluate_work_units` leaves at depth 11+ are auto-excluded), plus a deny-list
  of the `/chunk` work-unit leaves. Enabled via the `benchTrace` /
  `benchTraceMaxDepth` / `benchTraceDenylist` backend options →
  `bb_set_bench_trace*` WASM exports; dumped post-prove via
  `bb.dumpBenchTraceJson()` → `bb_dump_bench_trace_json`.
- **CPU (host MSM bridge)** — get / prepare / encode / submit+wait / decode.
- **GPU (WebGPU passes)** — per-pass timestamps per MSM.
- **Memory** — scalar `writeBuffer` uploads, SRS upload, mapAsync readbacks,
  each with bytes + direction.
- **Untracked** — prove-window time covered by no span (never hidden).

**Clock alignment.** This is a wasi-sdk build, so `std::chrono` → the bb.js WASI
`clock_time_get` import = `Date.now()·1e6` — a global wall clock shared by every
worker (coherent across all lanes), 1 ms-quantized. The trace stamps a
`min_ts_ns` header; the browser pairs `(Date.now(), performance.now())` anchors
(per bridge call + edge-detected bursts bracketing the prove) and least-squares
fits `host_ms = a + b·cMs` to map every C++ event onto the main-thread
`performance.now()` domain the GPU/host/memory lanes already use. Residual is
bounded below by the 1 ms `Date.now()` quantization (~0.3 ms RMS); the run logs
`b−1`, max/RMS residual, Σgpu vs Σsubmit_wait, and a top-20-by-duration summary.

**Must run on real hardware WebGPU** (Apple Metal / discrete NVIDIA):
SwiftShader/software is not BN254 bit-exact so the prove's verify fails — the
harness detects this and warns. The capture test writes
`/tmp/zac-webgpu/chonk-webgpu-e2e-trace.perfetto.json` (env `WEBGPU_TRACE_OUT`):

```bash
LOG_LEVEL=verbose yarn workspace @aztec/ivc-integration \
  test src/chonk_browser_webgpu_bench.test.ts -t "end-to-end WebGPU Perfetto trace"
```

or interactively via `yarn serve:chonk-webgpu` (port 8080) + a real Chrome:
`await window.runChonkWebGpuTrace()`.
