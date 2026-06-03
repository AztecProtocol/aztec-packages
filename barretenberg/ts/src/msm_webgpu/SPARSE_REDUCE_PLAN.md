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

1. Host: per-window active-bucket count (reduction over `is_present`), exposed to
   the reduce dispatch. Low risk, needed for classification + segment sizing.
2. Kernel `ba_reduce_sparse`: S-slot batched gap-aware segmented scan, one
   workgroup/window. Validate byte-identical vs the dense tree on a dense MSM,
   then on the structured wires.
3. Classify dense vs sparse per window; route each to the cheaper path.
4. Bench the real wire dumps (`?msm_dump=wire_n90325` …) — target: reduce
   6.1ms → ~1.5-2ms on the structured wires, unchanged on all-large.

Repro: dumps live in `dev/msm-webgpu/dumps/`; the C++ dump hook is in
`scalar_multiplication.cpp pippenger_round_parallel` under `MSM_DUMP_DIR`.
