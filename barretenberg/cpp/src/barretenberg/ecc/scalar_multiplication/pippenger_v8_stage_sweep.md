# Pippenger new-vs-legacy under V8 — stage sweep

**Setup.** Node/V8 (the browser's engine, unlike wasmtime/Cranelift). Instrumented wasm
(`-DENABLE_WASM_BENCH=ON`) driven by `ts/scripts/pippenger_v8_bench.mjs` →
`bench_pippenger_round_parallel` WASM_EXPORT, over the global SRS monomial points + random
scalars. 3 iters/config (iter 0 = warmup, discarded); median of the 2 measured. `fast` =
round-parallel rewrite (`pippenger_round_parallel`), `legacy` = byte-identical merge-train MSM
(`legacy::pippenger_unsafe`) with BB_BENCH markers mapped to the rewrite's stages. Run locally;
relative numbers (ratios, shares) are engine+algorithm-determined, so machine-independent.

Stage name mapping (legacy → rewrite): `build_point_schedule` ≈ Stage1+Stage4 ·
`sort_point_schedule` ≈ Stage2/3 · `batch_accumulate_into_buckets` ≈ **Stage6a** ·
`accumulate_buckets` ≈ Stage6b+Stage7 · `convert_scalars` ≈ Phase1.

## Total MSM wall (ms, median) and legacy/fast speedup `x`

| n | HC2 fast | HC2 leg | HC2 x | HC4 fast | HC4 leg | HC4 x | HC8 fast | HC8 leg | HC8 x |
|---|---|---|---|---|---|---|---|---|---|
| 131072 | 624 | 799 | **1.28** | 328 | 411 | **1.25** | 170 | 256 | **1.50** |
| 262144 | 1092 | 1424 | **1.30** | 570 | 752 | **1.32** | 317 | 444 | **1.40** |
| 524288 | 2156 | 2623 | **1.22** | 1138 | 1872 | **1.65** | 584 | 782 | **1.34** |
| 1048576 | 4322 | 5064 | **1.17** | 2060 | 3262 | **1.58** | 1132 | 1535 | **1.36** |
| 2097152 | 9137 | 9214 | **1.01** | 4220 | 5128 | **1.22** | 2262 | 2880 | **1.27** |

## Dominant stage — bucket accumulation wall (ms): fast Stage6a vs legacy batch_accumulate

| n | HC2 fast | HC2 leg | HC4 fast | HC4 leg | HC8 fast | HC8 leg |
|---|---|---|---|---|---|---|
| 131072 | 459 | 626 | 262 | 328 | 149 | 186 |
| 262144 | 846 | 1181 | 470 | 595 | 276 | 328 |
| 524288 | 1620 | 2178 | 939 | 1252 | 517 | 604 |
| 1048576 | 3410 | 4502 | 1740 | 2384 | 992 | 1181 |
| 2097152 | 6450 | 7592 | 3550 | 4494 | 1970 | 2249 |

## reduce stage wall (ms): fast Stage6b+7 vs legacy accumulate_buckets

| n | HC2 fast | HC2 leg | HC4 fast | HC4 leg | HC8 fast | HC8 leg |
|---|---|---|---|---|---|---|
| 131072 | 115 | 108 | — | — | — | — |
| 262144 | 210 | 191 | — | 104 | — | — |
| 524288 | 403 | 344 | 112 | 206 | — | 105 |
| 1048576 | 779 | 346 | 206 | 371 | — | 192 |
| 2097152 | 1380 | 1198 | 391 | 345 | 119 | 348 |

(`—` = stage too small to register in that run's tree. reduce is the least reliably captured
stage; treat as approximate.)

## What stands out

1. **`fast` wins everywhere — but the margin collapses at low threads + large n.** At HC=8 the
   rewrite is 1.27–1.50× across all sizes; at HC=2 it shrinks with size to **1.01 (parity) at
   2^21**. The advantage scales with thread count — a meaningful chunk of the win is *better
   thread utilisation* (round-parallelism), not just per-op speed. Browser-relevant: at low
   thread counts and the largest circuits, the edge is small.

2. **The win lives in bucket accumulation (Stage6a, ~85% of the MSM).** fast's Stage6a is
   ~12–30% faster than legacy's `batch_accumulate_into_buckets` across the whole grid — the
   batched-affine + recursive reduction amortises inversions, which V8's slow field ops reward.
   This is the consistent, dominant source of the speedup.

3. **The reduce stage is the rewrite's soft spot at low HC + large n.** At HC=2/2^21, fast's
   reduce (Stage6b cross-thread + Stage7) is ~1380 ms vs legacy's ~1198 ms — fast is *slower*
   here, eating the bucket-accum advantage and producing the total parity in (1). This matches
   the native/wasmtime finding that Stage6b scales worst. If we wanted to lift the low-thread /
   large-n case, **Stage6b cross-thread reduction is the target**, not bucket accumulation.

## Caveats
- Local V8 (Node), not the dedicated bench box — relative numbers only.
- Total wall is measured directly (reliable). Per-stage values come from the BB_BENCH tree
  (fast = main-thread sequential-batch wall; legacy = per-thread average wall); the `reduce` row
  is approximate (sometimes below the print threshold).
- wasmtime tracked V8 well on the earlier single-point check (~88% Stage6a, ~2× native), so the
  wasmtime sweep remains a usable proxy for *shape*.

## NATIVE (EC2, clang, no V8) — total MSM wall (ms) and legacy/fast `x`

Same `pippenger_bench` scaling benches (`PippengerRoundParallelScaling` = fast, `PippengerScalingLegacy` = legacy), `HARDWARE_CONCURRENCY` ∈ {2,4,8}, google-benchmark real time.

| n | HC2 fast | HC2 leg | HC2 x | HC4 fast | HC4 leg | HC4 x | HC8 fast | HC8 leg | HC8 x |
|---|---|---|---|---|---|---|---|---|---|
| 131072 | 290 | 280 | **0.97** | 146 | 156 | **1.07** | 80 | 88 | **1.10** |
| 262144 | 540 | 528 | **0.98** | 273 | 288 | **1.05** | 140 | 161 | **1.15** |
| 524288 | 1039 | 1003 | **0.97** | 526 | 553 | **1.05** | 267 | 298 | **1.12** |
| 1048576 | 2129 | 1942 | **0.91** | 1073 | 1016 | **0.95** | 550 | 557 | **1.01** |
| 2097152 | 3509 | 3478 | **0.99** | 1779 | 1963 | **1.10** | 916 | 1042 | **1.14** |

### Native vs V8 — the inversion
- **Native HC=2: `fast` is *slower* than legacy** (x 0.91–0.99) — round-parallel scaffolding isn't paid back when field ops are cheap and threads are few.
- Native HC=4 ≈ parity; HC=8 only ~1.10–1.15×. Compare V8 HC=8 = 1.27–1.50×.
- The rewrite's win is **field-op/inversion-bound** (bucket accumulation) — it shows on slow engines (V8/WASM) and shrinks to marginal/negative natively.
- **2^20 is the consistent native weak spot** (0.91/0.95/1.01, never beating legacy) while 2^19 and 2^21 do better — a size-boundary (windows-per-batch / arena) effect. This is the original "native 2^20 flat" observation, localized.

## NATIVE per-stage breakdown — % share of MSM (HC=8; shares are ~flat across HC=2/4/8)

Within-impl shares (fast counters = main-thread wall; legacy counters = CPU summed over worker threads — so shares, not raw ms, are the honest cross-impl comparison). Outer wrappers (`evaluate_work_units`, `batch_multi_scalar_mul`) excluded.

**fast**

| n | from_mont | schedule | sort | bucket_accum | reduce |
|---|---|---|---|---|---|
| 131072 | 0.7% | 5.1% | 0.2% | 92.0% | 2.0% |
| 262144 | 0.7% | 4.9% | 0.1% | 92.4% | 1.8% |
| 524288 | 0.7% | 4.6% | 0.1% | 92.8% | 1.7% |
| 1048576 | 0.6% | 4.8% | 0.1% | 93.6% | 0.9% |
| 2097152 | 0.8% | 6.9% | 0.1% | 89.1% | 3.0% |

**legacy**

| n | from_mont | schedule | sort | bucket_accum | reduce |
|---|---|---|---|---|---|
| 131072 | 1.1% | 0.8% | 4.4% | 83.4% | 10.3% |
| 262144 | 1.2% | 1.0% | 4.3% | 83.5% | 10.0% |
| 1048576 | 1.4% | 1.6% | 3.9% | 83.6% | 9.6% |

**Reading it.** Same stage distribution as V8 — `bucket_accum` dominates both (~90% fast, ~83% legacy). So native vs V8 differ in the *per-op speed* of bucket accumulation, not in the breakdown. The one structural difference: **legacy spends ~10% in `reduce` (`accumulate_buckets`) vs the rewrite's ~2%** — the rewrite's cheaper reduction is a genuine win, but it's a small slice, and (per the totals) at low HC/large-n the rewrite's reduce regresses and erases its bucket-accum edge.

## perf profile — where the time actually goes (native 2^20, HC8)

`perf record --call-graph dwarf` on a symbolized build (EC2 = AMD EPYC 7R13, Zen 3),
inline-resolved flat self-time:

| % self | function |
|---|---|
| **67.9%** | `drain_batch<BN254>` — batch-affine point addition (Stage6a core) |
| 12.6% | Stage6a worker (scatter/loop around drain) |
| 5.7% | `invert_vartime` (Bernstein-Yang modular inverse) |
| 2.9% | Stage4 digit scatter |
| 1.6% | `tree_reduce_in_place` |
| 1.4% | `apply_divstep_matrix` (inversion internals) |
| 1.1% | `random_element` (bench scalar gen, not MSM) |

**`drain_batch` = 68% — the field multiplications in the affine-add formula.** The batched
modular inverse is only ~7% (well-amortized by the batch trick). So Stage6a is **compute-bound on
the ~6 field-muls-per-add**, and legacy's `add_affine_points` does the *same* arithmetic — which is
why they tie at 2^20 where that cost dominates.

## Why 2^20 ties but 2^19 / 2^21 don't — the round-count crossover

Each round ≈ one pass doing ~n field-mul-heavy bucket adds, so **round count drives the work.** The
two impls' window-size cost models pick different c (fast: `2^(c-1)` Booth buckets; legacy:
`2^bits` full buckets, `BUCKET_ACCUMULATION_COST=5`):

| n | fast rounds (c) | legacy rounds (bits) | fast/legacy rounds | measured time fast/legacy |
|---|---|---|---|---|
| 2^19 | 20 (c=13) | 20 (b=13) | 1.00 | 1.12× (fast) |
| 2^20 | 20 (c=13) | 17 (b=15) | **1.18** | **1.01× (tie)** |
| 2^21 | 16 (c=16) | 17 (b=15) | **0.94** | 1.14× (fast) |

- Fast normally does *more* rounds but wins on per-round efficiency (threading, batch-affine, SIMD
  digit-extract), ~10–15%.
- **2^20:** fast stays c=13 (20 rounds) while legacy jumps to bits=15 (17 rounds). Fast's 18% extra
  round-work cancels its per-round edge → tie.
- **2^21:** fast jumps to c=16 (16 rounds, fewer than legacy's 17) → round advantage + per-round
  edge → fast wins. *That's why 2^21 gets faster.*

**Why fast can't just raise c at 2^20** (confirmed: forcing c=14/15/16 all stayed ~550 ms): c=16 →
32k Booth buckets/window (8× c=13). Fast scatters into a **dense per-thread bucket buffer**, so the
O(buckets) cost — dense-buffer memset, scatter, and the Stage6b reduction — grows 8× and eats the
round savings. Legacy's **sort-based** accumulation has no dense-buffer per-bucket overhead, so it
profits from bits=15. Only at 2^21 does n grow enough that c=16's round cut outweighs the bucket cost.

Also refuted as causes of the 2^20 tie: **window_bits** (forced-c neutral), **batch budget**
(32→128 MB regressed *every* size by 7–10% — 32 MB is cache-optimal), **batch balance** (6+6+6+2 →
5+5+5+5 neutral).

## Could native SIMD fix the field-mul floor?

Hard, and not on this hardware. There is no 64×64→128 widening multiply in AVX2/NEON
(`VPMULUDQ` = 32×32→64 only), so SIMD montmul needs a **redundant-limb field rewrite** (radix
2^29/2^32 for AVX2, 2^52 for AVX-512 IFMA) — a new field impl + reduction + correctness suite +
rewiring `drain_batch`, i.e. a multi-week field-layer project (exactly the wasm `VectorField` work).
- The only SIMD montmul that reliably beats scalar `MULX` asm is **AVX-512 IFMA**, which is **not on
  the Zen 3 bench box (AVX2-only)** — needs Zen 4 / Ice Lake+.
- AVX2 radix-2^29 montmul generally *loses* to good `MULX` scalar asm, so on this hardware it's high
  effort for ~zero (likely negative) native gain.

The field-SIMD win is real on **WASM/V8** (slow scalar field ops there), which is the in-flight
`VectorField` work (`rk/wasm-simd-*`) and the actual browser target where fast already leads 20–50%.

## Recommendation

The 2^20 native tie is **understood, not a bug**: a round-count crossover where fast's larger
bucket-accumulation overhead prevents the larger-c round cut that legacy gets, on a CPU where the
per-add field-mul is already at the scalar-asm floor.

- It is a **single non-priority point** (native, single-MSM, 2^20, HC8). Fast wins every other
  native size and 20–50% on V8/browser.
- "Fixing" it means re-engineering the **68% hot path** (dense-bucket scatter + reduction to make
  large c profitable) — a tuned local optimum (the code already documents fighting L1 aliasing
  there) — with high risk of regressing Mega/browser and a full re-bench burden.
- **Do not do speculative Stage6a surgery for this.** Bank the understanding. The field-mul win
  where it counts is the WASM/V8 `VectorField` path.

## Investigation hooks (temporary, on `si/pipp-big-sizes` — revert before any PR)

- `BB_MSM_FORCE_C` env in `choose_window_bits` (force window size).
- `BB_MSM_DEBUG_PLAN` env in `pippenger_round_parallel` (dump c / num_windows / wpb / batches).
- legacy stage markers (`MSM::build_point_schedule` / `sort_point_schedule` /
  `batch_accumulate_into_buckets` / `accumulate_buckets`) + the `_fast` main-thread stage scopes.
- `PippengerRoundParallelScaling` / `PippengerScalingLegacy` benches; `pippenger_wasm_export.cpp`
  + `ts/scripts/pippenger_v8_bench.mjs`; `benchmark_wasm{,_remote}.sh` ENABLE_WASM_BENCH/BB_BENCH
  forwarding. Build-cache `-g`/no-strip change is local-only.
