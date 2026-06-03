# Sparse bucket-reduce — design + real-data justification

## Why (ground truth from `bb prove --scheme chonk` on `ecdsar1+transfer_1_recursions`)

Dumped all 505 MSMs of a real Chonk prove (hooked `pippenger_round_parallel`,
labelled each by curve + the `dedup_hint` wire flag). The BN254 **wire commits**
(`w_l/w_r/w_o/w_4`, the only polys passing `dedup_hint=true`) are the single
largest category — **56 MSMs, 3.85M point-terms** — and are heavily mixed:

| | zero | msb 1-13 (bools/u8s) | 64-127 | 192+ |
|---|---|---|---|---|
| BN254 wires | 22.2% | 14.3% | 2.9% | 58.8% |

Per-wire it swings from `n=5490` (32% zero + 67% small + 0.3% large) to
`n=131071` (100% large).

GPU breakdown on these real wires (logN-equivalent, M2), split off:

| wire | gpu | walker | reduce |
|---|---|---|---|
| n=90325 (mixed) | 15.5 | 3.1 | **6.1** |
| n=131071 (all large) | 31.1 | 20.6 | **6.1** |

Two facts:
1. The **walker already exploits the structure** — 3.1ms (mixed) vs 20.6ms
   (all-large). Small/zero scalars cost ~nothing in accumulation.
2. The **reduce is a flat, data-independent 6.1ms** — identical for the mixed
   and the all-large wire. It runs the full `2^(c-1)` buckets × every window even
   though structured wires leave the high-window buckets ~82% empty. That waste
   is the lever. (The variable-window split is the WRONG fix: neutral-to-worse on
   every real wire because it adds walker work — more digits for the large
   scalars — and the dense tree isn't work-bound anyway.)

The C++ reduce is *also* dense/data-independent (its cost model bills `T·W·B`,
occupancy-independent); structured data wins there purely via the accumulation
(`Stage6a` 1.46G vs 6.66G uniform). The GPU matches that in the walker. The gap
is that the GPU reduce is a much larger *fraction* of GPU time, and it's
memory-bound on the empty buckets.

## What

Make the bucket reduction **data-dependent**: compute each window's
`S_w = Σ_k k·bucket[k]` over only the **active** buckets (`is_present`), skipping
the empties, while keeping the decompose/walker untouched (no walker penalty).

Math (gap-aware suffix sum, exact ⇒ byte-identical to the dense tree):
process active magnitudes descending `k_1 > k_2 > …`; maintain `running` (suffix
sum of bucket values) and `acc`; at each active `k_i`:
`running += bucket[k_i]; acc += running · (k_i − k_{i+1})`. Empty runs collapse
into the integer gap `(k_i − k_{i+1})`. For dense windows every gap is 1 (`·1` is
a no-op copy), so dense cost is unchanged; sparse windows pay
`O(active) adds + O(active·log gap) gap-scales` instead of `O(B)`.

## How (must be parallel + batched-inversion, or the win evaporates)

- One workgroup per window; **S contiguous bucket-segments per workgroup**, one
  per slot — reuse the walker's S-slot batched inversion (one safegcd per S
  affine ops). Each slot runs its segment's gap-aware chain.
- Cross-segment carry: a higher segment's total suffix-sum adds into every lower
  segment's `acc`, weighted by that segment's bucket span — a workgroup scan
  over the per-segment (suffix, acc, span) triples.
- `running · gap` is a small double-and-add (gap ≤ segment span); gap==1 short-
  circuits to a copy so dense windows incur no scalar-mults.
- Dispatch only where it pays: classify each window dense/sparse by active count
  (cheap reduction over `is_present`); dense windows keep the existing tree,
  sparse windows take this kernel. (Stage 2.)

## Stages

1. **v0 — correctness reference (DONE, committed behind `?sparse_reduce=1`).**
   `ba_reduce_sparse.template.wgsl`: one thread per window, gap-aware suffix sum
   over active buckets, UN-batched (one finv per affine op). Validated
   byte-identical to the dense tree: golden logN14 `255df40fb6007596` + the real
   wire dump `wire_n23074` (`0x59e9d999ef00fd22`), both oracle-agree. Slow as
   expected (reduce 21ms vs 1.9ms) — its only job is to lock the math + the host
   wiring (pipeline, per-window (base,B) `reduce_meta`, bind, flag, dispatch).
2. **v1 — batched (NEXT, the perf win).** Replace the un-batched inner loop with
   the walker's S-slot batched inversion: split the window into S contiguous
   bucket-segments (one per slot), each slot runs its segment's gap-aware chain,
   the S affine adds per step share one finv (forward prefix-product / single
   inverse / backward peel). Combine: `S_w = Σ_s (alg_s + lo_s·seg_sum_s)` — no
   cross-segment carry (each segment weights by its own absolute magnitude). The
   `running·gap` and `lo_s·seg_sum_s` scalar-mults are double-and-adds; gap==1
   short-circuits so dense segments match the dense tree.
   **v1 status (DONE, committed, flag-gated): correct but NOT faster.** Parallel
   (one workgroup/window, WG slots = segments, segment-local + workgroup tree-sum)
   and validated byte-identical (golden logN14, real `wire_n23074`). But it leaves
   the inversions un-batched (one safegcd per affine add), and measured SLOWER on
   the dominant c=13/B=4096 wires: `wire_n90325` reduce 17.9ms vs dense 6.1ms;
   `wire_n97487` 9.65 vs 6.12. Only wins on tiny B (`wire_n23074` 1.69 vs 1.83).
   Two causes, both fundamental to the un-batched/per-window-workgroup shape:
   (a) the safegcd inversion dominates — the dense tree's whole point is batching
   it (one inverse per chunk), so one-inverse-per-add loses regardless of how many
   empties are skipped; (b) one workgroup per window = ≤numWindows workgroups
   resident, and safegcd's register pressure caps occupancy, so the GPU is
   under-fed. Skipping empties does NOT pay for itself until the inversions are
   batched AND occupancy is high.
3. **v2 — batched + high-occupancy (the real win, NOT yet built).** Replace the
   per-add `finv` with the walker's forward-prefix-product / single-inverse /
   backward-peel across S slots (one safegcd per S adds), AND raise occupancy
   beyond one workgroup/window (split each window across multiple workgroups with
   a cross-workgroup combine, or process many windows per workgroup). This is the
   perf-critical kernel; v0/v1 are byte-identical oracles to validate it against.
4. Bench the real wire dumps (`?msm_dump=wire_n90325` …) — target: reduce
   6.1ms → ~1.5-2ms on the structured wires, unchanged on all-large.

Repro: dumps live in `dev/msm-webgpu/dumps/`; the C++ dump hook is in
`scalar_multiplication.cpp pippenger_round_parallel` under `MSM_DUMP_DIR`.
