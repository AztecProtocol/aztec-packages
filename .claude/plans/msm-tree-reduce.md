# Stage B — Tree-reduce per bucket with adaptive batch sizing

> Replaces the current SMVP round-loop (`smvp_batch_affine_gpu` + 5 shaders) with
> a tree-reduce structure that scales logarithmically in max bucket population
> instead of linearly. Designed for skewed real-world ZK workloads where the
> current round-loop's MAX_ROUNDS bound is dominated by a few heavy buckets.

## Constants

```
SWEET_B = 1024        // peak per-pair throughput (24.4 ns/pair from bench)
MIN_B = 32            // floor: TPB=32, 1 SIMD group, no cross-SIMD barriers, 1.56× sweet cost
TARGET_THREADS = 40_000   // Apple Silicon (M-series Pro/Max) resident thread budget
TPB_DEFAULT = 64
TPB_MIN_B = 32        // matches Apple's SIMD group width
MAX_PHASES = 10       // recursion safety cap; pre-pass usually computes exact depth
```

## Adaptive batch sizing

```
function pickBatch(total_adds):
    candidate_B = total_adds / (TARGET_THREADS / TPB_DEFAULT)   # = total_adds / 625

    if candidate_B >= SWEET_B:                       # plenty of work
        return (SWEET_B, ceil(total_adds / SWEET_B), 64)
    elif candidate_B >= 64:                          # mid: largest pow-2 ≤ candidate
        B = floor_pow2(candidate_B)
        return (B, ceil(total_adds / B), 64)
    else:                                            # tail: floor at MIN_B with TPB=32
        return (MIN_B, ceil(total_adds / MIN_B), 32)
```

## Phase structure

### Pre-pass kernel (per phase)

One small dispatch. Inputs: sorted schedule (Phase 1) or partials buffer (Phase ≥2). For each entry:
1. Determine WG slice membership via index-partitioning of `total_adds`.
2. Flag if entry is first of its bucket in its WG slice.
3. Flag if entry pairs with the next entry (same bucket, both in same WG slice).
4. Emit pair (idx_a, idx_b) to per-WG pair-list slot.

Then host-side prefix sums produce:
- `wg_pair_offset[]`, `wg_pair_count[]` — pair-list slice per WG
- `wg_output_offset[]`, `wg_output_count[]` — output partials slice per WG  
- `wg_first_bucket[]` — bucket_id of first partial (for cross-WG boundary detection)
- `max_pop_remaining` — if 0, no more dup buckets, terminate

No atomics. Per-entry kernel work is O(1); host prefix-sum is O(num_WGs) = O(1000) = trivial.

### Phase 1: per-WG slice batch-affine

One dispatch, `num_WGs` workgroups of TPB threads (from `pickBatch`). Inputs:
- Bucket-sorted schedule
- Pre-computed pair list

Each WG:
1. Reads its `wg_pair_count` pre-computed pairs from `pair_list[wg_pair_offset[wg_id] : wg_pair_offset[wg_id] + wg_pair_count[wg_id]]`
2. For each pair (a, b): loads `P = points[scalar_idx_a]` (with sign-flip per SCHEDULE_SIGN_BIT), `Q = points[scalar_idx_b]`, computes `delta_x = Q.x - P.x`
3. Cooperative Phase A/B/C/D batch inverse (workgroup-shared scan, 1 fr_inv_by_a per WG)
4. Per-pair: compute slope, R = P + Q
5. Compaction: each pair's result is the partial for some bucket. Adjacent same-bucket pairs in the slice get combined into running sum; final partials written to `output[wg_output_offset[wg_id] + slot]` with `bucket_id` tag.

Single fr_inv per WG amortises over `wg_pair_count` ≈ B pair-adds.

### Phase ≥2: tree-reduce on partials

Re-sort phase 1's output by bucket_id globally (use existing transpose pattern — fast on GPU). Then re-run pre-pass + Phase 1 kernel on the bucket-sorted partials buffer.

Key difference from Phase 1: load is `partials[idx]` (a point) instead of `points[scalar_idx]` (a point with sign). Faster — no negation per load.

### Phase final: BPR / Horner

After all phases collapse buckets to 1 point each, hand off to existing BPR per window + Horner combine across windows. No change to those.

## Memory budget (logN=16, N_entries=1.1M, B_active≈272K)

- `pair_list` (Phase 1): ~825K pairs × 8 bytes = **6.6 MB**
- `wg_*` arrays: 1000 WGs × ~5 × 4 bytes = **20 KB**
- `output partials` (Phase 1): ~325K × 68 bytes = **22 MB**
- `output partials` (Phase 2): ~80K × 68 bytes = **5.5 MB**
- `output partials` (Phase ≥3): rapidly shrinking
- Total scratch: **~35 MB**, well under any device limit

## Phase count (theoretical)

For typical 4-entries-per-bucket: `max_pop ≈ 16`, `log2(16/1024) ≤ 0` → **Phase 1 alone resolves it**.

For skewed (heavy bucket pop=10K): `max_pop = 10000`, `log2(10000/1024) ≈ 4` → **Phase 1 + 3-4 recursion levels**.

For uniform with sweet B fill: ~5 phases worst case.

vs current: 32 rounds. **6× fewer dispatches in typical case**.

## What we save

- **Dispatch overhead**: 5 phases × 3 dispatches each = 15 vs current 32 rounds × 3 = 96. Saves ~1.6 ms.
- **Late-round amortisation collapse**: gone — adaptive sizing keeps per-WG batch at sweet through phase 5+.
- **Pathological skew**: round count goes from O(max_pop) to O(log max_pop). **The big win for production ZK workloads.**

## Open implementation decisions

### Per-WG slice compaction (within phase 1 / phase ≥2)

Each WG's batch-affine produces `wg_pair_count` result points. These need to be COMPACTED into per-bucket partials (one partial per distinct bucket the WG touched).

Two sub-options:
- **(a) Within-WG sequential merge**: after batch-affine, one thread walks the pair results, merges adjacent same-bucket results, writes final partials. ~B sequential adds (cheap, 63/64 threads idle but only briefly).
- **(b) Within-WG segmented reduce**: parallel reduction grouping by bucket_id. More complex.

Going with **(a)** — simpler, the post-merge work is negligible compared to the batch-affine.

### Re-sort between phases

Phase k output is grouped by WG; Phase k+1 needs bucket-grouped input. Options:
- **Transpose-style**: use existing `transpose_parallel_{count,scan,scatter}` infrastructure on the new layout. Adds ~3 dispatches per phase.
- **Per-WG outputs are SORTED by bucket already** (since schedule was bucket-sorted). Just need a parallel MERGE of K sorted lists. O(N log K). Cheap.

Going with **merge** — fewer dispatches.

### Pair-list pre-pass

Single dispatch, one thread per schedule entry. Per entry:
- Determine WG = `entry_idx * num_WGs / total_adds_density` (uses precomputed running-adds index)
- Check predecessor entry: same bucket + same WG slice → emit pair (predecessor, self) to per-WG slot

Per-WG pair slot allocation: pre-pre-pass counts per-WG pair count, host prefix-sums.

So phase structure is actually:
1. count-pass — count pairs per WG (1 atomic per WG, only num_WGs increments, low contention)
2. host prefix-sum — compute pair_offsets
3. fill-pass — write pairs to per-WG slots (one atomic per WG for local cursor, or use 2-thread cooperation to make atomicLess)
4. phase 1 batch-affine

Actually atomics per-WG are TRIVIAL (one address per WG = no contention). Acceptable.

OR even cleaner: do the count-pass and fill-pass in ONE kernel with per-thread local pair-buffer in registers, flushed at WG boundary. Avoids any global atomics. Complexity vs simplicity tradeoff.

For first implementation: 2-pass pre-pass with per-WG-local atomics. Optimize later.

## Phase count termination

Pre-pass computes per-bucket population at phase 0. `MAX_PHASES = ceil(log2(max_pop / SWEET_B)) + 2`. Hard-coded; no runtime detection.

OR per-phase: if `num_distinct_buckets_output == num_distinct_buckets_input`, no reduction happened → done.

Use the formula-based approach (cleaner; hardcoded loop count). Loop:
```
for phase in 0..MAX_PHASES:
    if total_adds_remaining == 0: break
    dispatch pre-pass
    dispatch phase k
    re-sort output → input of next phase
```

## What this does NOT include (per user scope)

- Duplicate stripping
- Two bucket widths
- Adaptive bucket width (c stays constant)
- GLV scalar split

## Estimated impact

For UNIFORM data at logN=16 (current bench case):
- ba_inverse_Σ: 10.8 ms → estimated 6-8 ms. Saving ~3 ms = 4% MSM wall.
- Dispatch overhead saving: ~1.6 ms.

For SKEWED data (typical ZK workloads):
- ba_inverse phase: estimated 3-5× faster due to log_2 vs linear in max_pop.
- Could be ~25-40% MSM wall reduction. Numbers depend heavily on actual workload skew profile.
