# Pippenger Multi-Scalar Multiplication (MSM)

Computes $\text{MSM}(\vec{s}, \vec{P}) = \sum_{i=0}^{n-1} s_i \cdot P_i$ over BN254 / Grumpkin.

Two implementations live behind one facade:

- **Round-parallel rewrite** (`scalar_multiplication_fast.{hpp,cpp}` + `pippenger_*.hpp`) — the default.
- **Legacy** (`legacy::MSM` in `scalar_multiplication.{hpp,cpp}`, byte-identical to the pre-rewrite code) — selected by
  setting the `BB_MSM_LEGACY` env var. Scheduled for removal once the rewrite has soaked.

## Entry points

| Facade call | Routes to | Safety |
|---|---|---|
| `pippenger(scalars, points, handle_edge_cases=true)` | `pippenger_fast` | ✓ safe |
| `pippenger_unsafe(scalars, points)` | `pippenger_round_parallel` | ⚠ requires linearly independent points |
| `MSM<Curve>::msm(...)` | `MSM_fast<Curve>::msm` | per `handle_edge_cases` flag |
| `MSM<Curve>::batch_multi_scalar_mul(...)` | `MSM_fast<Curve>::batch_multi_scalar_mul` | per `handle_edge_cases` flag |

"Unsafe" means the batched-affine path assumes no two points added pairwise are equal, inverse, or infinity.
Bucket collisions of equal/inverse points make the shared Montgomery inversion hit zero. Use the safe path
(Jacobian arithmetic throughout, `pippenger_round_parallel_jacobian_fast`) for caller-controlled points;
SRS points are linearly independent so commitments use the unsafe path. The `dedup_hint` flag opts an MSM
into the duplicate-scalar pre-pass (Phase A below); hints are set by provers on duplicate-heavy polynomials
(Honk wires, `z_perm`).

Inputs smaller than `MIN_PTS_PER_THREAD_FOR_PIPPENGER (24)` points per worker bypass everything and run
multi-threaded Straus (`pippenger_fallbacks.hpp`).

## Round-parallel algorithm

One window = one signed-digit position of width `c` bits. Windows are processed in batches sized so the
working set stays inside `BATCH_MEM_BUDGET` (32 MiB); every stage inside a batch is fully parallel across
`T = min(num_cpus, n / MIN_BATCH_CAPACITY)` tasks.

**Phase 1 — scalar profile.** Convert scalars out of Montgomery form (in place for non-GLV, restored at the
end; into a scratch buffer for GLV) and record each scalar's MSB. The MSB histogram gives
`effective_num_bits` (window count tracks the largest *actual* scalar, not the field width) and the
zero count (small active counts bail to the Straus fallback).

**GLV split.** For `n ≤ GLV_SMALL_N_THRESHOLD` (2^13 native / 2^16 WASM) or when the batch driver supplies a
pre-doubled table, each scalar splits as `k = k1 − λ·k2` giving `2n` half-width (128-bit) working scalars
against `[P, φP]` pairs — half the windows for double the points.

**Per batch of windows:**

1. **Digit extraction** — Constantine-style carry-less signed-Booth recoding (`pippenger_constantine.hpp`,
   SIMD ×4). Each (scalar, window) yields a signed digit in `[-2^(c-1), 2^(c-1)]`; per-(task, window)
   histograms count digit magnitudes.
2. **Bucket histogram** — in-place exclusive prefix sums turn per-task counts into scatter cursors.
3. **Bucket offsets** — per-window prefix sum over bucket counts → `bucket_start` ranges.
4. **Digit scatter** — re-decode digits and write `sign | scalar_idx` entries into the per-window schedule,
   bucket-contiguous (a counting sort; bucket magnitude is implicit in the `bucket_start` range an entry
   lands in).
5. **Chunk partition** — split each window's schedule into `T` equal chunks by schedule index (not bucket
   boundary; a bucket straddling two chunks contributes two partials that Stage 7's algebra absorbs).
6. **6a: bucket partials** — each task walks its chunk in sub-chunks of `SUBCHUNK_ENTRIES_CAP (2048)`
   entries: gather points by schedule index (software-prefetched 16 ahead — the gather is a random 64-byte
   load over the SRS span), then `tree_reduce_in_place` pairs same-bucket neighbours level by level, batching
   independent affine additions through one Montgomery inversion per `BATCH_CAPACITY (256)` pairs. Surviving
   per-bucket partials land in a dense per-(task, window) array.
   **6b: cross-task reduce** — re-partition by bucket range, merge the ≤ T partials per bucket, then
   `recursive_affine_bucket_reduce_strided` (Mitschabaude-style, ZPrize 2022) computes each window's
   `Σ_d d·B_d` with batched affine adds/doubles shared across all windows in the batch.
7. **Window combine** — Horner walk high → low window: double `c` times, add the window sum.

This stage split is why bucket counts are cheap here: Stage 6b (the only per-bucket-cost stage) measures
1-3% of MSM wall clock, while every extra *window* costs a full pass of Stages 1+4+6a over all n points.
The window-size model in `choose_window_bits` encodes exactly that trade
(`cost = rounds · (4·n + 12·buckets)` — coefficients scaled by 4 so the bucket:point ratio 12/4 = 3 stays integer).

### Dedup pre-pass (Phase A, hint-gated)

After the first batch's Stage 4, each task hash-scans its bucket range of window 0's schedule for groups of
entries with byte-identical scalars (only scalars with `msb ≥ c` — shorter ones have nothing to save).
Each cluster's points are tree-reduced into one combined point (`extra_points`), the cluster representative's
schedule entries get redirected to it, and the other members are skipped — later batches skip them during
Stage 1/4 directly via `redirect_lookup`. Caps (`DEDUP_MAX_CLUSTERS` 16384, `DEDUP_MAX_MEMBERS` 32768)
bound memory; capped-out clusters silently fall through to the normal path. See `pippenger_dedup.hpp`.

### Arena

All scratch lives in one per-MSM arena (`MsmArena`), sized up front by `compute_arena_bytes_for_msm`,
which takes the maximum over every reachable `effective_num_bits` layout — the live pipeline picks its
window size *after* seeing the data, so the sizer must dominate every choice the pipeline can make.
Zones: **P** (whole-MSM state: scalar profile, GLV buffers, window sums, dedup tables),
**W** (per-worker slabs; Stage 6 scratch and Phase A scratch overlay the same bytes because those parallel
phases never coexist), **S** (per-batch swing: schedules, histogram/cursor slab, dense partials).
`PerWorkerArenaLayout` is the single source of truth shared by the sizer, the live allocator, and the
arena regression tests. The batch driver (`pippenger_batched.hpp`) allocates one max-sized arena and one
shared GLV-doubled SRS prefix for a whole `batch_commit`.

## Tuning constants

| Constant | Value | Where | Why |
|---|---|---|---|
| `BAC_A` / `BAC_B` | 4 / 12 | `choose_window_bits` | cost = rounds·(BAC_A·n + BAC_B·buckets); bucket ≈ 3 point-visits (12/4), empirically calibrated |
| `GLV_SMALL_N_THRESHOLD` | 2^13 native / 2^16 WASM | dispatch | above this, the 2× point gather outweighs halved windows |
| `MIN_PTS_PER_THREAD_FOR_PIPPENGER` | 24 | dispatch | below this Straus wins |
| `BATCH_CAPACITY` | 256 | batched affine adds | one inversion per 256 pairs; 16 KB pair buffer stays in L1 |
| `SUBCHUNK_ENTRIES_CAP` | 2048 | Stage 6a | bounds per-task scratch independent of n |
| `BATCH_MEM_BUDGET` | 32 MiB | windows-per-batch solve | WASM-friendly resident-scratch ceiling |
| `GATHER_PREFETCH_DIST` | 16 | Stage 6a gather | hides DRAM latency the branchy gather loop can't overlap on its own |

## File structure

```
scalar_multiplication/
├── scalar_multiplication.hpp/.cpp   # facade (BB_MSM_LEGACY dispatch) + legacy::MSM implementation
├── scalar_multiplication_fast.hpp   # round-parallel public API (MSM_fast, pippenger_fast, ...)
├── scalar_multiplication_fast.cpp   # phases/stages 1-7, arena zones, jacobian-safe path
├── pippenger_arena_layout.hpp       # window-size model, schedule builder, arena layout/sizing helpers
├── pippenger_constantine.hpp        # signed-Booth window recoder (scalar + SIMD x4)
├── pippenger_dedup.hpp              # schedule encoding bits + Phase A duplicate-scalar machinery
├── pippenger_batched.hpp            # multi-MSM batch driver (shared arena + GLV table)
├── pippenger_fallbacks.hpp          # trivial/Straus small-N drivers
├── process_buckets.hpp/.cpp         # legacy radix sort (legacy::MSM only)
├── bitvector.hpp                    # legacy bucket-exists bitmap (legacy::MSM only)
└── README.md
```

## Benchmarks

`pippenger_bench` covers single MSMs (2^10..2^20, including the GLV small-N region), sparsity/duplicate
profiles, batch commits, and Chonk-shaped batch scenarios. Run on the remote bencher
(`scripts/benchmark_remote.sh pippenger_bench`); per-stage timing is visible through the `BB_BENCH`
stage markers (`MSM::Stage*`).

## References

1. Pippenger, N. (1976). "On the evaluation of powers and related problems"
2. Bernstein, D.J. et al. "Faster batch forgery identification" (batch inversion)
3. Botrel, Ratsimbazafy — Constantine's `signedWindowEncoding` (carry-less Booth recoding)
4. Mitschabaude — ZPrize 2022 batch-affine bucket reduction
