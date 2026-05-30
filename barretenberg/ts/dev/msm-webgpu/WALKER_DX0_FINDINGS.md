# Root-cause investigation: `ba_walker_combine` dx==0 / off-curve bucket

Branch: `stream-walker-dx0-rootcause-inv` (off `stream-walker-impl`).

Target: the off-curve-bucket bug at logn 8..16 where `ba_walker_combine`
produces an off-curve value for a small number of buckets, each with exactly
one `dx == 0` exception during the linked-list traversal. The prior session
was about to make the combine's affine addition exception-safe; that is a
symptom patch. This investigation looks upstream.

## TL;DR

1. **The decompose → cut → walker-emission → combine *logic* is correct.** A
   dependency-free reproduction of the exact integer logic of every kernel in
   the path (plus inline BN254) finds **zero** structural defects across
   logn 8..16 × 25 seeds: no range overlap (double-count), no gap, no bucket
   with both a finalized `sum` and `partial`, no bucket holding the same input
   point twice, and no bucket holding a point and its negation. Partials always
   cleanly partition each bucket; the combine of those partials is on-curve and
   matches the reference. **This rules out the hypothesized upstream causes**
   (scalar decomposition, signed-digit recoding, bucket-index assignment, and
   the walker's partial emission producing a duplicate or a P/−P sign
   collision).

2. **A concrete upstream defect *is* present: an uninitialized-sentinel bug
   that injects off-curve garbage into the combine.** `ba_walker_combine`'s
   input linked list is built by `ba_walker_partials_index`, which links every
   partial slot whose `partial_dest != NO_BUCKET` (`0xffffffff`). But the host
   prepares that buffer with `enc.clearBuffer(walkerPartialDest)`, which writes
   **0**, not `0xffffffff`. The walker is *indirect-dispatched* over only
   `numActive = nwg*256` threads (≤ `streamNumThreads = 8192`), so it only
   initializes the slots it owns. Every slot owned by a **non-dispatched**
   thread therefore still reads **0**, which the indexer interprets as
   `bucket_id = 0` and links into **global bucket 0's** combine list — with
   `partials_buf = (0,0)` (off-curve, from the same zero-clear). Combining
   `(0,0)+(0,0)` is exactly the `dx == 0` exception, and bucket 0's value goes
   off-curve.

   - This matches "off-curve **value** for a small number of buckets" (it is
     global bucket 0). It is **invisible to the final MSM result**: the
     reduction (`ba_reduce_init_bench.wgsl:5-8,37-38`) explicitly drops
     column 0 (`src = w*bw + i + 1`), the zero digit, weight 0 — so the
     cross-check against the reference still passes even though bucket 0 is
     corrupt. That is consistent with the prior session detecting it via a
     per-bucket on-curve assertion rather than a result mismatch.
   - It manifests only when `numActive < streamNumThreads` (smaller logn,
     roughly logn 8..14). `numActive = nwg*256` and `nwg` is capped at
     `max_workgroups = 32` (the value actually passed to the cumsum shader:
     `gen_ba_planner_cumsum_shader(STREAM_T, STREAM_S, 1, 32)` — not the 64 in
     `ba_stream_plan.ts`), so `numActive ≤ 8192 = streamNumThreads`. At the
     largest sizes `nwg = 32 ⇒ numActive = 8192`, every slot is initialized,
     stale = 0, and the bug does not manifest. `node_counter` never overflows
     (`realPartials ≤ dispatched ⇒ realPartials + stale ≤ max_nodes`).
   - Side check: because `nwg ≤ 32 ⇒ numActive ≤ streamNumThreads`, the
     walker's `if (t >= NUM_THREADS=8192) return` guard never drops dispatched
     threads, so there is **no** "upper half of the bucket stream goes
     unaccumulated" bug — even though `numActive` and the fixed `NUM_THREADS`
     are wired from different constants. (Had `max_workgroups` been 64,
     `numActive` would reach 16384 > 8192 and that guard *would* drop half the
     work — worth noting if either constant changes.)

## Reproduction

`dev/msm-webgpu/walker-dx0-repro.mjs` (no deps, no GPU). It ports the exact
integer logic of `decompose_scalars_booth`, `ba_planner_cumsum`,
`ba_planner_partition_thread`, `ba_planner_partition_task`, `ba_stream_walker`,
and `ba_walker_combine`, plus inline BN254 G1 (complete affine add for
references, the incomplete add the GPU uses for the combine replay).

```
node dev/msm-webgpu/walker-dx0-repro.mjs 12 7    # curve-accurate single run
node dev/msm-webgpu/walker-dx0-repro.mjs sweep    # structural sweep logn 8..16 × 25 seeds
```

Representative output (`sweep`): `SWEEP CLEAN: no structural double-count /
sign-collision in the walker+combine LOGIC` for every size/seed. The GPU
slot-space model line shows the stale slots that the sentinel bug mislinks to
bucket 0, e.g. logn=12: `stale->bucket0=102400 ... => bucket 0 combine list
gets 102400 off-curve (0,0) nodes -> dx==0`.

> A subtle harness gotcha surfaced and was fixed in the repro: an LCG PRNG has
> non-random low bits, which biases the booth digits and can mask
> bucket-distribution bugs. The repro uses mulberry32.

## Root cause and the correct upstream fix (NOT exception-safe addition)

The `dx == 0` in the combine is not a property of the addition formula and not
a logic bug in the walker; it is off-curve `(0,0)` garbage that should never
have entered bucket 0's combine list. Two upstream changes (both implemented in
this PR) fix it at the source:

1. **Exclude zero-digit buckets in `ba_planner_classify`** (primary). Buckets
   with `id % BW == 0` are the Booth zero digit; they contribute nothing and
   the reduction already drops column 0 (`ba_reduce_init`: `src = w*bw + i+1`).
   Excluding them from the dense/size1 lists means global bucket 0 is never
   combined at all, so the uninitialized slots that get mis-linked to it are
   never read. The result is identical (those buckets were dropped anyway) and
   it saves accumulating every per-window zero bucket. `classifyParams.y` now
   carries `BW`.
2. **Guard `ba_walker_partials_index` against `bucket_id == 0`** (defense in
   depth). Even with (1), the zero-cleared slots still carry `bucket_id 0`;
   skipping them in the indexer keeps the garbage out of the linked list
   regardless of classification.

The deeper sentinel hardening — initialize `partial_dest` to `NO_BUCKET`
(`0xffffffff`) instead of `0`, or bound the indexer scan to the dispatched
range `2*numActive*S` — would also let global bucket 0 hold its correct
(on-curve) sum rather than the cleared `(0,0)`. It is unnecessary for
correctness given (1) and is left as a follow-up to avoid an unvalidated buffer
change.

## Validation status

The logic correctness and the slot-staleness arithmetic are validated
deterministically on CPU here. The final GPU cross-check (20+ runs, multiple
seeds, hot-bucket input vs `@noble/curves` under headless SwiftShader) is the
remaining step; this container has no Chrome/Playwright and the in-tree
`barretenberg.wasm.gz` is a 213-byte stub, so the headless GPU harness could
not be run. The reproduction + the exact buckets to read back (global bucket 0
and its linked-list nodes' `nodes_slot` / `partials_buf` x,y) are provided so a
GPU-equipped run can confirm and land the fix.
