# BatchMsmV2 — Batched MSM design for the WebGPU pipeline

## Problem

`MSM::batch_multi_scalar_mul` issues groups of MSMs sharing one SRS prefix. The
two recurring batches in the Chonk / translator flow are

| label                               | B (batch size) | n (per-MSM)        |
|-------------------------------------|----------------|--------------------|
| witness column commits (W_L/W_R/W_O)| 3              | 2^17 typical       |
| translator range-constraint polys   | 10             | 2^15…2^18          |

The bridge's existing same-N path runs B MSMs serially through a single
`MsmV2` instance — call this the **solo** path. Telemetry on the dev page
shows solo is already 2-3× faster than the WASM-MT Pippenger at the chonk
sizes, so any batch-mode replacement has to clear *that* bar to be worth
landing. The bridge's own slot-pool experiment note (in `bridge/main.ts`)
warned of the failure mode we then hit:

> GPU still executes passes within one command buffer sequentially — the slot
> pool removes per-MSM mapAsync but doesn't parallelize GPU compute itself.
> Net: 0.78× → 0.58×. Reverted.

So whatever we built had to be more than command-buffer-level batching.

## Two-tier execution

### Tier 1 (the slot-pool retry): correctness scaffolding, NOT a perf win

`BatchMsmV2` first version built `B` independent `MsmV2` instances, each
bound to its own dedicated `MsmV2Pool` that shares the SRS poolX / poolY
buffers but holds **disjoint scratch**. This unblocked the same-N
`scalarsRawBuf` race that forced the original bridge slot-pool to keep
per-MSM submits, so `prepareAll` could fire B parallel prepares under one
`Promise.all` (overlapping their `mapAsync` waits into one host idle window)
and `runAll` could encode every slot into one command buffer for a single
submit + mapAsync.

A new factory `MsmV2Pool.fromSharedSrs(device, srsN, poolX, poolY,
sharedCache?)` ships with this tier; it takes pre-built SRS GPU buffers
from a master pool, skips the upload + Montgomery convert, and never frees
those buffers on destroy. The master pool owns the pipeline cache, so slot
N≥1 also skips shader compile.

**The dev-page sweep at log₂(n) ∈ {15..18} × B ∈ {3, 10} showed Tier 1
loses to the simpler "B serial WebGPU solo MSMs" baseline at every B=3 row
and at B=10 below n=2^17.** Concretely at the W_L/W_R/W_O case (B=3,
n=2^17): batch = 0.81× of solo (124 ms vs 100 ms). The host-side mapAsync
overlap was real (~50-100 ms saved at B=10) but it didn't recover what we
lost to (a) per-slot scratch allocation on first prepare and (b) the GPU
still executing the B pipelines serially within one command buffer.

This matched the slot-pool experiment's prediction exactly: command-buffer
batching alone is not the win.

### Tier 2 (shipped): virtualised B·W-window MSM

Tier 2 replaces `BatchMsmV2`'s internals (API unchanged — caller still does
`create → prepareAll → runAll → destroy`) with **one** `MsmV2` instance
configured with `batchSize = B`. The two leaf-data shaders learn the
`(gid.y → b, w)` split:

- `bucket_histogram.template.wgsl` and `decompose_scalars_booth.template.wgsl`
  bake `WINDOWS_PER_MSM` (= per-MSM W = `ceil(254 / c)`) as a compile-time
  WGSL constant. Each thread reads `scalars[(gid.y / WINDOWS_PER_MSM) * n
  + p]` and uses `w = gid.y % WINDOWS_PER_MSM` for the Booth-window bit
  index. For single-MSM (B=1), `WINDOWS_PER_MSM == num_windows`, the
  formula collapses to `b ≡ 0`, and the math is byte-identical to
  pre-Tier-2.
- Everything downstream (planner, transpose, conv, fused affine-add,
  reduce, finalize) operates on `numWindows = B · W` effective windows
  obliviously — no per-MSM identity below the leaf data shaders. `MsmV2`'s
  per-window indexing already scales with `numWindows`.

`BatchMsmV2.prepareAll` concatenates the B caller-supplied scalar buffers
into one `B × n × 32`-byte block and feeds it to `msm.prepare`. `runAll`
decodes the resulting B·W window sums, splits into B groups of W, and
runs the host Horner combine once per slot.

#### What Tier 2 changed in MsmV2 / shader_manager.ts

The original single-MSM path baked `NUM_WINDOWS = ceil(NUMBITS / c)` into
the two planner shaders (`ba_planner_v2_offsets`, `ba_planner_v2_emit`)
as a *workgroup-id bound* — `if (w >= NUM_WINDOWS) return`. For Tier 2
we dispatch `batchWindows` workgroups where `batchWindows` can be up to
`B · W`, so the planner gen functions now take `num_windows` as a direct
parameter (not `num_bits`) and MsmV2 passes `m.numWindows`. Missing this
was the rev 7 correctness bug — at B=3 with `numBatches=1` the planner
silently skipped slots 1 and 2, producing slot 2 = identity in the output.

The original code also aliased `valIdxBuf` (sized `batchWindows × n`) as
the planner's per-bucket carry-prefix table of size `B_TOTAL = B · W ·
BW`. The invariant `batchWindows × n >= B · W · BW` held trivially for
single-MSM, but for Tier 2 at large n the MEM_BUDGET-driven `numBatches`
search pushes `batchWindows` down and the invariant breaks. We now
allocate `carryOffBuf` separately in `SharedScratch` (sized `B_TOTAL ×
4`, ~3-11 MB across the production range) and drop the constraint.

#### Sweep results — what Tier 2 actually buys

dev page `Batch sweep 2^15…2^18` × `B ∈ {3, 10}` on the dev machine (Apple
M-class GPU, 14-thread WASM-MT for the WASM baseline). All 8 sweep points
PASS the per-slot correctness check against both `solo MsmV2` and `WASM
batch_multi_scalar_mul_native` results.

```
  B  logN |   batch   solo    wasm-run    wasm-wall | batch/solo  batch/wasm-run  batch/wasm-wall
   3  15  |     62      42       148         177    |    0.67×        2.39×            2.85×
   3  16  |     83      63       140         171    |    0.76×        1.68×            2.06×
   3  17  |    122     100       236         283    |    0.82×        1.94×            2.32×
   3  18  |    193     215       712         799    |    1.11×        3.68×            4.13×
  10  15  |    124     134       330         362    |    1.07×        2.65×            2.92×
  10  16  |    201     217       689         739    |    1.08×        3.42×            3.67×
  10  17  |    355     415      1142        1243    |    1.17×        3.22×            3.50×
  10  18  |    895     660      1396        1592    |    0.74×        1.56×            1.78×
```

**vs WASM-batch (the production baseline being replaced)**: Tier 2 wins
1.78×-4.13× wall at every point. This is the headline.

**vs WebGPU solo (the existing bridge same-N fallback)**:
- B=10 at translator sizes n ∈ [2^15, 2^17]: **1.07× — 1.17× faster**.
  This is where the translator range-constraint commits live, so
  shipping Tier 2 here is a clear production win.
- B=3 at W_L/W_R/W_O size n=2^17: 0.82× — Tier 2 *loses* by ~22 ms.
  Solo stays the production path for B=3 ≤ n=2^17.
- B=3 n=2^18: 1.11× — Tier 2 wins; not the typical W_L/W_R/W_O size but
  worth noting.
- B=10 n=2^18: 0.74× — known regression. At this corner the MEM_BUDGET
  heuristic forces `numBatches` very high (~57 dispatches per level
  because `bufA` blows up with `batchWindows × wstride1 × 64`), and the
  many-small-dispatches path leaves the GPU under-fed. Tunable via a
  `MEM_BUDGET` refit for batch mode; not a blocker for translator
  sizes.

#### Why solo still wins at B=3 n ≤ 2^17

The fundamental tradeoff Tier 2 makes is **B× wider working set in GPU
memory** (`bufA`, `bufB`, `bucketResult`, `redBuf`, `carryOff` all scale
with `numWindows = B · W`) in exchange for fewer host round-trips and
better GPU saturation per dispatch. The Apple M-class SLC and the GPU L2
caches are sized in the tens of MB; when the working set fits in cache,
the wider dispatch gives a small GPU-saturation win (B=10 case). When it
doesn't, cache evictions cost more than we save (B=3 n=2^17 case).

We measured this directly in the rev-9 sweep: B=10 n=2^17 working set
≈ 200 MB (within SLC reach for the dispatch's hot regions) → 1.17× win;
B=10 n=2^18 working set ≈ 500 MB (well past cache) → 0.74× regression.

### Production deployment recommendation

The right bridge routing is size-and-batch-conditional:

| same-N batch | Route through |
|---|---|
| B=3 W_L/W_R/W_O at n ≤ 2^17 | existing solo path (no change) |
| B=10 translator at n ∈ [2^15, 2^17] | `BatchMsmV2.create/prepareAll/runAll` |
| B ≥ 4 at n=2^18 | flag for re-bench after MEM_BUDGET refit |

Concretely, `bridge/main.ts:runBatchMsm` should add a precondition check
on the same-N collision path: if `B ≥ 4` and `n ≤ 2^17`, switch to
`BatchMsmV2`; otherwise keep the existing serial-solo + per-MSM
submit + batched mapAsync path. The exact threshold should be re-tuned
against each target GPU's L2/SLC capacity using the dev page sweep
button.

## API

```ts
import { BatchMsmV2 } from '@aztec/bb.js/msm_webgpu';

const batch = await BatchMsmV2.create(device, srsBytes, n, B);
await batch.prepareAll(scalarsList);    // B Uint8Array, each n × 32 LE Fr
const out = await batch.runAll();        // { results, gpuMs, wallMs }
batch.destroy();
```

`scalarsList` is the caller's B per-slot scalar arrays; `runAll` returns
the B affine results in slot order plus GPU and wall timings.

## Correctness coverage

- **Node-side unit tests** (`batch_msm.test.ts`, `batch_msm_shader.test.ts`,
  15 tests total):
  - `hostHornerCombine` Horner fold cross-checked against an in-process
    noble BN254 reference at c ∈ {8, 10, 13, 15} (matches the production
    `pickC` table).
  - `gen_bucket_histogram_shader` / `gen_decompose_scalars_booth_shader`
    render checks: `WINDOWS_PER_MSM` is correctly substituted; the
    `(b, w)` split formula and the `scalar_idx = b × input_size + p`
    lookup appear in the rendered WGSL source.
  - `buildInitCounts` JS reference for the per-bucket histogram is cross-
    checked against an independent BigInt Booth-digit oracle at
    single-MSM and batch (B=3, B=10) shapes — guarantees the host
    fallback (kept as an A/B diagnostic) is byte-equivalent to the GPU
    shader's intended behaviour.
- **Browser-side cross-check** (dev page `Batch MSM (B=3, 10)` button,
  `Batch sweep` button): every per-slot batched result must equal
  `solo MsmV2.run()` AND `WASM batch_multi_scalar_mul_native` on the
  same scalars. All 8 sweep points pass.

## What this design does not solve

- **B ≥ 4 at n = 2^18.** Tier 2 regresses here due to `MEM_BUDGET` /
  `numBatches` corner case. Follow-up: refit MEM_BUDGET for batch mode,
  possibly with a larger budget cap or a different bufA shape.
- **Off-SRS batches.** Each MSM must share the SRS prefix. The chonk /
  translator batches all do, so not a current issue.
- **Mixed-N batches.** `BatchMsmV2` only handles same-N. The bridge's
  existing mixed-N path is unchanged.

## Files

- `barretenberg/ts/src/msm_webgpu/batch_msm.ts` — `BatchMsmV2` class
  (single-`MsmV2`-with-`batchSize=B` Tier 2 implementation).
- `barretenberg/ts/src/msm_webgpu/batch_msm.test.ts` — Horner-combine
  noble cross-checks.
- `barretenberg/ts/src/msm_webgpu/batch_msm_shader.test.ts` — Tier 2
  shader rendering + JS reference cross-checks.
- `barretenberg/ts/src/msm_webgpu/msm_v2.ts` — added `batchSize` /
  `windowsPerMsm` knobs; `MsmV2Pool.fromSharedSrs` factory; pool-owned
  `carryOffBuf`; planner shaders take `num_windows` directly.
- `barretenberg/ts/src/msm_webgpu/wgsl/cuzk/bucket_histogram.template.wgsl`,
  `decompose_scalars_booth.template.wgsl` — virtual-window split.
- `barretenberg/ts/src/msm_webgpu/wgsl/cuzk/ba_planner_v2_offsets.template.wgsl`,
  `ba_planner_v2_emit.template.wgsl` — `NUM_WINDOWS` is now the *total*
  dispatch window count (B·W in batch mode), passed directly via gen
  function instead of derived from `num_bits / c`.
- `barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp`
  — new dev-page exports `bb_native_pippenger_bn254_batch_load` /
  `_batch_run` wrapping `MSM::batch_multi_scalar_mul_native` with a
  vector of B spans (the true apples-to-apples WASM baseline for
  `BatchMsmV2`).
- `barretenberg/ts/dev/msm-webgpu/{index.html,main.ts,pippenger_wasm.ts}`
  — `Batch MSM (B=3, 10)` and `Batch sweep 2^15…2^18` buttons with
  per-slot correctness check, vs-solo and vs-WASM ratios.

## Open follow-ups

1. **Bridge integration** — wire the size-conditional routing rule above
   into `bridge/main.ts:runBatchMsm`.
2. **MEM_BUDGET refit** — pin down the B=10 n=2^18 regression and decide
   whether to bump MEM_BUDGET for batch mode or restructure bufA.
3. **MEM_BUDGET tuning per GPU** — the current 248 MB budget is a static
   constant; on cards with bigger L2 / SLC the Tier 2 win likely extends
   to larger n.
