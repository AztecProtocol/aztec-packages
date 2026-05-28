# BatchMsmV2 — Batched MSM design for the WebGPU pipeline

## Problem

`MSM::batch_multi_scalar_mul` issues groups of MSMs sharing one SRS prefix. The
two recurring batches in the Chonk / translator flow are

| label                               | B (batch size) | n (per-MSM)        |
|-------------------------------------|----------------|--------------------|
| witness column commits (W_L/W_R/W_O)| 3              | 2^17 typical       |
| translator range-constraint polys   | 10             | 2^15…2^18          |

The current WebGPU bridge handles same-N batches by either (a) one `MsmV2`
instance run B times back-to-back, or (b) a "slot pool" of B `MsmV2` instances
encoded into one command buffer. Telemetry shows both regress vs. the WASM
MT Pippenger path. The user spec already named the suspects: "separate
dispatches, prepare phase waiting for gpu compute, etc." The bridge's own
slot-pool experiment note (in `bridge/main.ts`) is the most pointed evidence:

> GPU still executes passes within one command buffer sequentially — the slot
> pool removes per-MSM mapAsync but doesn't parallelize GPU compute itself.
> Net: 0.78× → 0.58×. Reverted.

So whatever we build has to be more than command-buffer-level batching.

## Bottlenecks (ranked)

1. **Per-MSM prepare waits.** `MsmV2.prepare()` issues a bucket-histogram pass
   + `mapAsync` readback inside its body. For B MSMs that is B sequential GPU
   round-trips at ~5–10 ms each (Chrome event-loop polling) → 50–100 ms of host
   idle for B=10.
2. **GPU underutilisation at small n.** At n=2^15 a single MSM's planner /
   fused / reduce dispatches do not saturate the GPU. Stacking B MSMs into one
   dispatch would give B× more independent work per shader.
3. **Per-MSM scratch contention.** `MsmV2Pool` holds one shared scratch
   (bufA/bufB/scalarsRawBuf/…) so two same-N `MsmV2` instances bound to one
   pool cannot prepare or run concurrently — the second clobbers the first's
   plan. This is why the slot-pool path had to keep per-MSM submits.
4. **B × Horner-combine on host.** Cheap compared to the above, but worth doing
   in parallel once everything else is fast.

## Two-tier plan

### Tier 1 (this PR): correctness scaffolding only — **not** a perf win

`BatchMsmV2.create(device, srs, n, B, opts)` builds B `MsmV2` instances, each
bound to its own dedicated `MsmV2Pool` that **shares the SRS poolX / poolY
buffers** with slot 0. Only slot 0 actually uploads + Montgomery-converts the
SRS; slots 1..B-1 reuse those GPU buffers through a new
`MsmV2Pool.fromSharedSrs(device, srsN, poolX, poolY)` constructor. Memory cost
is the per-slot scratch (`bufA/bufB/scalarsRawBuf`, the dominant ones) — at
n=2^17 that's ~25 MiB × (B-1) extra. Bounded and acceptable for B ≤ 10.

API:

```ts
const batch = await BatchMsmV2.create(device, srsBytes, n, B);
await batch.prepareAll(scalarsList);     // B Uint8Array, each n×32 LE Fr
const out = await batch.runAll();        // { results: {x, y}[B], gpuMs }
batch.destroy();
```

`prepareAll` fires `Promise.all(this.msms.map(m => m.prepare(scalars[i])))`;
each MsmV2's histogram pass writes to a *distinct* scratch (different pool),
so the B histogram dispatches queue up on the device queue and their
`mapAsync` waits overlap rather than serialising. `runAll` encodes every
MSM's run pipeline into ONE command encoder writing to ONE shared staging
buffer at distinct offsets — one `submit`, one `mapAsync`, B parallel JS-side
decodes + Horner combines.

**The dev-page sweep at log₂(n) ∈ {15..18} × B ∈ {3, 10} shows Tier 1 is
slower than the simpler "B serial WebGPU solo MSMs" baseline at every B=3 row
and at B=10 below n=2^17.** Concretely at the W_L/W_R/W_O case (B=3,
n=2^17): batch = 0.81× of solo (124 ms vs 100 ms). The host-side mapAsync
overlap is real but doesn't recover what we lose to (a) per-slot scratch
allocation overhead on first prepare and (b) the GPU still executing the B
pipelines serially within one command buffer.

This matches exactly the prediction in `bridge/main.ts:573-585` ("slot-pool
experiment: ... GPU still executes passes within one command buffer
sequentially — the slot pool removes per-MSM mapAsync but doesn't parallelize
GPU compute itself. Net: 0.78× → 0.58×. Reverted."). Tier 1's 0.7–1.13×
range beats that experiment's 0.58× because per-pool scratch removes the
same-N scalarsRawBuf race that forced the original slot-pool to keep per-MSM
submits, but it doesn't change the conclusion: command-buffer batching alone
is not the win.

**So Tier 1 is scaffolding only**: the `BatchMsmV2` class, the
`MsmV2Pool.fromSharedSrs` factory, the correctness tests, and the dev-page
batch + sweep buttons. The buttons gave us the measurement that justifies
*not* shipping Tier 1 into the bridge and *yes* pursuing Tier 2. The class
itself is preserved because Tier 2 reuses the same API and the same unit-test
contract — only `prepareAll`/`runAll`'s internals are replaced with a single
B·W-virtualised dispatch.

### Tier 2 (follow-up): virtualised B·W-window MSM

The only way to get true GPU concurrency for B same-N MSMs is to fuse them
into one dispatch. The clean way is to treat the batch as a single virtual MSM
of size n with B·W effective windows, where window y ∈ [0, B·W) decodes its
scalar digits from `scalars[(y / W) * n + i]`'s w-th Booth window
(w = y mod W). The pair-tree machinery already handles `batchWindows ≥ 1`
windows obliviously — only the two leaf-data shaders need to learn the
`(y → b, w)` split:

- `bucket_histogram.template.wgsl`: index the scalar buffer at
  `(thread_y / W) * n + thread_x`, write counts at
  `((thread_y / W) * W + thread_y % W) * BW + bucket` (i.e. preserve B·W ×
  BW grid).
- `decompose_scalars_booth.template.wgsl`: same scalar lookup, same indexing.

Everything downstream (planner, transpose, fused affine-add, reduce, finalize)
already iterates over `batchWindows × per_window_stride` slots without caring
about MSM identity. Output is B·W window sums; the host splits into B groups
of W and Horner-combines each.

This is the *correct* algorithm. The follow-up scope:
- two shader modifications (`bucket_histogram.template.wgsl` +
  `decompose_scalars_booth.template.wgsl`) + their template-WGSL hot-reload
  churn,
- additional `wstride1` / `pairCap` re-validation under the wider window grid
  (now B·W bucket grids of width BW each instead of W bucket grids),
- the planner's `MEM_BUDGET` heuristic was tuned for ≤ 20 windows; with
  B·W ≈ 200 windows the batch-windows-per-dispatch knob `numBatches` needs a
  refit,
- the redM allocation in `ensureScratch` is sized to `numWindows × stride` —
  needs to grow to `B × numWindows × stride` so the per-(b, w) window sums
  have somewhere to land,
- host combine splits B·W window sums into B groups of W and Horner-combines
  each independently (already implemented in `batch_msm.ts:hostHornerCombine`,
  just called once per slot).

Expected payoff at the W_L/W_R/W_O case (B=3, n=2^17), reading off the Tier 1
sweep: GPU compute today is ≈54 ms/MSM × 3 = ~160 ms serialised. Tier 2 fuses
into one dispatch with 3× the windows; GPU saturation is currently the
bottleneck at this size, so the speedup is bounded by `B / (1 +
GPU_saturation_overhead_factor)`. A ~1.5–2× over solo is the realistic
target — bringing the WASM ratio at this size from 2.41× to **3.5–5×**.

## Correctness check

The unit test in `batch_msm.test.ts` does B = {3, 10} batches at n ∈
{2^15, 2^16, 2^17} (we cap at 2^17 in tests so the suite stays under a
minute) and asserts each per-MSM result matches a one-off `MsmV2.run()` on
the same scalars. This is a strict cross-check — any divergence between the
batched and solo paths fails the test.

## Memory budget

The user noted "2^20 scalars fit in modern GPU local memory" — that's
0.5 GiB of bare Fr bytes (2^20 × 32). The Apple M-series shared memory
budget is 8–18 GiB so the SRS pool (~64 MiB at n=2^20) + per-slot scratch
(~25 MiB × B) at the largest sizes we hit (B=10, n=2^18) is ~370 MiB total —
comfortably below the WebGPU per-buffer cap (1 GiB on Chrome). Memory is
not the bottleneck; per-MSM mapAsync waits and per-pass GPU serialization
are.

## What this design does not solve

- Same-N concurrency *on the GPU itself*. Tier 1 only fixes host-side waits;
  the B compute pipelines still execute back-to-back. Tier 2 is the fix.
- Off-SRS batches (where each MSM has a distinct point set). Not in scope —
  the chonk + translator batches always share an SRS prefix.
- Mixed-N batches. The dev-page button only exercises same-N batching. Mixed
  batches would degrade to slot-0 per-MSM today.

## Files added / changed

- `barretenberg/ts/src/msm_webgpu/batch_msm.ts` — `BatchMsmV2` class.
- `barretenberg/ts/src/msm_webgpu/batch_msm.test.ts` — correctness suite.
- `barretenberg/ts/src/msm_webgpu/msm_v2.ts` — add
  `MsmV2Pool.fromSharedSrs(device, srsN, poolX, poolY)` factory.
- `barretenberg/ts/dev/msm-webgpu/main.ts` + `index.html` — batch benchmark
  button.
