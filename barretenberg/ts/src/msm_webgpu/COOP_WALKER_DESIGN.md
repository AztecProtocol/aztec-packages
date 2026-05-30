# Cooperative-inversion bucket accumulator ("coop-walker")

Re-architecture of the MSM bucket-accumulate stage for laptop + mobile GPUs.
Grounded in the measured ground truth that the stream-walker accumulate kernel
is **memory-bound / occupancy-limited**, not inversion-bound.

## Measured starting point (not re-derived)

- The stream-walker accumulate kernel is extremely memory-bound on real
  hardware. safegcd inversion *looks* like ~47% of the walker wall only
  because memory stalls dilate it — the identical safegcd is <30% of MsmV2,
  which is not memory-starved. Lever = **hide memory latency**
  (occupancy / coalescing / fewer dependent gathers), not cheaper inversion.
- The stream-walker is per-thread bucket-monotonic. Each thread serially
  walks a contiguous bucket range carrying **S** independent slot accumulators
  in private registers, and stages forward-prefix products through a
  `var<workgroup> pref_scratch` sized `TPB*S*2` vec4 = **16 KB at TPB=64,S=8**.
  That long per-thread serial dependency chain + the 16 KB workgroup footprint
  are why occupancy is low and memory latency is not hidden.
- Mobile reality: 16 KB workgroup memory (Mali) / 32 KB (Apple, Adreno);
  only 10 storage buffers per stage on many mobile adapters; Android Chrome
  has no timestamp-query (wall-time only).

## Why the walker is occupancy-starved

Two coupled costs both scale with **S** (slots per thread):

1. **Register pressure.** Per slot the walker keeps `acc_x[8] + acc_y[8]`
   (16 u32) plus 8 bookkeeping `array<u32,S>` (cursor, bucket_end,
   task_end_sort, task_end_cur, cur_sorted, cur_bucket, is_first, slot_done,
   split_start). At S=8 that is ~150+ live registers per invocation → few
   resident invocations → memory latency is exposed.
2. **Workgroup memory.** `pref_scratch = TPB*S*2` vec4 = 16 KB at TPB=64,S=8.
   On Mali (16 KB total shared) this caps the core to **one resident
   workgroup**. No second workgroup means barriers and dependent gathers in
   the resident workgroup stall the whole core.

Shrinking S (the sibling "S-sweep") trades inversion amortization for
occupancy but leaves the *structure* — long per-thread serial chain, per-slot
carried state — intact. This design changes the structure instead.

## The structural change: share one inversion across the workgroup

Set **slots-per-thread = 1**. Each thread is a plain serial walker over one
contiguous slice of the sorted bucket stream (reusing the existing
`thread_cuts` partition unchanged). The batched-inversion that made affine
adds cheap is moved from *per-thread over S slots* to *per-workgroup over TPB
threads*:

- Each round, every active thread produces exactly one `dx` for its pending
  affine add (a retired thread contributes `dx = R`, Montgomery one, which is
  inert).
- The workgroup computes the batch inverse of the TPB `dx` values
  cooperatively: an exclusive **prefix-product scan** and an exclusive
  **suffix-product scan** in workgroup memory, then a **single** safegcd
  inversion of the workgroup-wide product (one thread), then
  `inv_dx_t = inv_total * pre[t] * suf[t]`.
- Each thread applies its affine add with its `inv_dx_t` and advances.

### What this buys, on every axis the ground truth cares about

| Axis | stream-walker (TPB=64,S=8) | coop-walker (TPB=64,S=1) |
|---|---|---|
| Live registers / invocation | ~150+ (scales with S) | ~20 (one accumulator) |
| Workgroup memory | 16 KB (`TPB*S*2` vec4) | ~6 KB (dx + pre + suf, `3*TPB*2` vec4) |
| Independent adds in flight / round | S=8 per thread | TPB=64 per workgroup |
| safegcd inversions | ≈ total_adds / S | ≈ total_adds / TPB (**~8× fewer**) |
| Mali resident workgroups / core | 1 (16 KB cap) | ≥2 (6 KB) |

Lower registers + lower workgroup memory → **higher occupancy** → more
resident workgroups to hide memory latency (the MsmV2 win) while still
**streaming** each point from global memory exactly once (the walker memory
footprint — no pair-tree materialization). The cooperative scan adds
`2*log2(TPB)` barriers per round, but with high occupancy those barriers are
hidden by sibling workgroups — exactly the latency-hiding regime MsmV2 proves
is reachable on this hardware.

Fewer total inversions (~8×) is a bonus, not the point: the wall is memory,
and a shorter per-invocation serial chain with far more resident invocations
is what hides it.

## I/O contract (drop-in for the existing pipeline)

The coop kernel replaces only the `stream_walker` accumulate dispatch. It
reuses the entire surrounding pipeline (decompose → transpose → planner →
reduce → `walker_partials_index` → `walker_combine`) and keeps the exact same
output contract:

- A bucket fully owned within one thread's range → full EC sum written to
  `bucket_sums[bucket_id]`, no partial.
- A bucket split across a thread boundary → each thread writes its piece's
  partial-sum to a unique slot (`2*t+0` split-start suffix, `2*t+1` task-end
  prefix) with `partial_dest[slot] = bucket_id`; `walker_combine` sums them.
- Unused partial slots → `partial_dest = NO_BUCKET`.

Because there is no S sub-split, the coop kernel emits **fewer** partials than
the walker (boundaries only at thread cuts, not task cuts), which also reduces
exposure to the known `walker_combine` `dx==0` incomplete-affine-add bug.

## Status

- [x] Headless-SwiftShader GPU-vs-noble cross-check harness
      (`autorun=msm-noble`, `test-msm-xcheck.mjs`), GREEN on the baseline at
      logn=8 and logn=10.
- [ ] coop-walker kernel + host wiring (selectable via `accum` knob).
- [ ] cross-check coop at logn 8/10, multiple seeds.
- [ ] BrowserStack real-hardware time vs stream-walker and MsmV2 baselines
      (≥1 Apple, ≥1 Adreno, ≥1 Mali), memory not worse than the walker.

## Alternatives considered (documented, not pursued first)

- **Stage points in bucket-sorted order** to remove the two-hop dependent
  gather (`l0_index[cursor]` → `point_x[2*pt]`) from the hot loop and coalesce
  reads. Rejected as the first move because the staging buffer (~n·64 B) adds
  memory and a full extra streaming pass on an already memory-bound kernel;
  worth revisiting as a workgroup-memory tile rather than a global buffer.
- **Drop Montgomery form** for the modest muls/element. Orthogonal to the
  occupancy problem; not the lever.
