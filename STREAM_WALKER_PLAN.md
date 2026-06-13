# Stream-walker MSM accumulator — comprehensive plan

## 1. Scope and constraints

This plan replaces the current `ba_stream_accum` + queue/emit/emit_fixup/recompute_split kernels on PR #23575 with a **per-thread bucket-monotonic walker** that holds the per-thread S=8 batched-inversion model from the original plan but eliminates the queue layer and its bookkeeping pathology.

### 1.1 Hard requirements

| Constraint | Source | Implication |
|---|---|---|
| Per-thread batched inversion only; no workgroup-cooperative inversion | Verified empirically — cooperative variant has single-inverter bottleneck | Inner loop is per-thread; no `workgroupBarrier` in main loop |
| Every iteration of every thread performs exactly 8 affine-add slot ops | User-stated | IDLE work fills any holes; uniform inner-loop instruction stream |
| Memory budget ≤ 100 MB for MSM up to n=2^20 | Phone deployment | Eliminate queue_buf (2.55 MB), bufA/bufB/ringBuf/prefScratchBuf (~62 MB at 2^17); move `pref_scratch` to workgroup-local |
| Performance ≥ current pair-tree V2 | User-stated | Per-kernel breakdown vs V2 must match or beat 51 ms accumulate at n=2^17 |
| Safegcd inversion stays as-is (`fr_inv_by_loop_pk`) | User-stated | No change to `inverse_funcs.template.wgsl` |

### 1.2 Out of scope for this session

- **GPU-side partials reduction.** The user has explicitly directed that we hack `partials_buf` reduction on the host CPU and **exclude that host fixup from benchmark timings**. A proper GPU partial-sum kernel is a separate follow-up.
- **Coalesced-task layout.** A future optimization where task assignments are interleaved across threads in a warp to improve memory coalescing. The initial stream-walker uses simple block layout; coalesced layout is deferred to a follow-up optimization pass once measurement on M2 and Adreno tells us if uncoalesced reads dominate.
- **`c` (window-size) re-tuning for n=2^20.** Assume the existing `c` selection logic holds; only revisit if memory budget breaks.

### 1.3 Terminology — what the names in this plan refer to

To avoid collision with existing names in the codebase:

| Term used in this plan | Refers to |
|---|---|
| **"pair-tree V2"** or **"the existing pair-tree V2"** | The pair-tree accumulator currently in the codebase (`ba_fused_super_bench.template.wgsl` and friends). The 2026-05-28 benchmark report measured this at 51 ms accumulate / 74.8 ms total GPU at n=2^17. This is what the new design must match or beat. **Not the same thing as the stream-walker.** |
| **"streaming" / "stream_accum" / "queue model"** | The current state of PR #23575 — the queue-based per-thread S=8 accumulator with planner emit/emit_fixup/recompute_split kernels. This is what this plan *replaces*. |
| **"the stream-walker"** | The new per-thread bucket-monotonic-walker accumulator this plan designs. There is no V1/V2 numbering on this — it's a single design. References to the deferred items below are by name, not by version number. |
| **"initial stream-walker"** | The first end-to-end working build of the stream-walker, produced by following §14 of this plan. Uses block-task layout and host-side partials fixup. |
| **"GPU partials-reduction kernel"** | A follow-up GPU kernel (separate future session) that replaces the host CPU partials fixup. Not in scope for this plan. |
| **"coalesced-task layout"** | A follow-up optimization that reassigns tasks to threads such that warp-adjacent threads read contiguous SRS positions. Not in scope for this plan. |

### 1.4 Decisions taken on the open questions from the audit

| Question | Decision | Rationale |
|---|---|---|
| Coalesced-task vs block-task layout? | **Block layout** for the initial stream-walker | Simpler. Same memory access pattern as the current code (which works). The coalesced layout becomes a follow-up optimization pass once we have a stable correct baseline to measure against. |
| Per-thread init-time cumsum or separate planner kernel? | **In-kernel** for the initial stream-walker | ≤ 240 sequential reads per thread at n=2^20 (one-time cost per kernel invocation). Trivial vs the main-loop cost. Hoist to a separate kernel only if measurement shows >5% of total stream-walker time. |
| `partials_buf` reduction strategy? | **Host CPU fixup** for the initial stream-walker; **exclude from benchmark times** | Per user directive. GPU partials-reduction kernel is a follow-up session. |

---

## 2. Architecture

### 2.1 Kernel pipeline (after this change)

```
preprocess (existing, unchanged):
  decompose_scalars_booth → transpose_count/reduce/scan/scatter
  csr_to_v2_active_sums → csr_to_v2_meta

planner (existing, mostly unchanged):
  ba_planner_classify          [unchanged]
  ba_planner_meta_fixup        [unchanged]
  ba_planner_radix_count×3     [unchanged]
  ba_planner_radix_scan×3      [unchanged]
  ba_planner_radix_scatter×3   [unchanged]
  ba_planner_cumsum            [modified: emit `nwg` based on new TPB/S/MIN_ITERS]
  ba_planner_partition_wg      [unchanged]
  ba_planner_partition_thread  [unchanged]
  ba_planner_split_detect      [NEW — single-thread scan of thread_cuts emitting split_records]

accumulation:
  ba_size1                     [unchanged — single-point buckets]
  ba_stream_walker             [NEW — replaces ba_stream_accum]
  (no ba_partial_sum on GPU in V1 — see §10)

reduce (existing, unchanged):
  ba_reduce_init_bench
  ba_reduce_level_bench
```

### 2.2 Kernels deleted

- `ba_stream_accum.template.wgsl`
- `ba_stream_accum_debug.template.wgsl`
- `ba_planner_emit.template.wgsl`
- `ba_planner_emit_fixup.template.wgsl`
- `ba_recompute_split.template.wgsl`
- `ba_partial_sum.template.wgsl` (the on-GPU version; replaced by host fixup in V1)

Their generators in `shader_manager.ts` and pipeline/bind declarations in `msm_v2.ts` go away with them.

### 2.3 Buffers deleted

From `StreamPlannerBuffers` in `ba_stream_plan.ts`:
- `queueBuf` — no queue
- `partialsBuf` — replaced by simpler layout (see §3)
- `partialBucketsList` — replaced by `split_records` (see §3)

From the V2 pair-tree pool (this is the bigger memory win):
- `bufA`, `bufB`
- Any ring-buffer scratch
- `prefScratchBuf` (the global `pref_scratch` from current stream_accum — moves to workgroup-local)

---

## 3. Memory layout

### 3.1 Streaming working set

| Buffer | Size formula | n=2^17 (c=13) | n=2^20 (c=15) | Notes |
|---|---|---:|---:|---|
| `acc_buf` | `NUM_THREADS × S × 64 B` | 1 MB | 4 MB | Per-thread × per-slot accumulator (x,y); private if we hold in registers, but spill-safe as device storage |
| `pref_scratch` | `TPB × S × 64 B` per workgroup | **`var<workgroup>`** | **`var<workgroup>`** | 32 KB per workgroup at TPB=128, S=8, 32 B per slot ×2 planes — fits exactly in M2's 32 KB shared limit. Not in device memory at all. |
| `partials_buf` | `8 × NUM_THREADS × 64 B` | 1 MB | 4 MB | Up to 8 partial writes per thread |
| `split_records` | `(NUM_THREADS·8) × 12 B` | 192 KB | 768 KB | `(bucket_idx, first_partial_idx, partial_count)` per split |
| `bucket_sums` | `bTotal × 64 B` | 5.4 MB | 18 MB | Unchanged — every algorithm pays this |
| `sorted_bucket_list` + `sorted_count_list` + `offsets` | `3 × bTotal × 4 B` | 1 MB | 3 MB | Existing planner outputs |
| `cumulative_adds` | `bTotal × 4 B` | 350 KB | 1.1 MB | Existing |
| `thread_cuts` | `NUM_THREADS × 8 B` | 16 KB | 64 KB | Existing |
| `wg_cuts` | `MAX_WG × 8 B` | <1 KB | <1 KB | Existing |
| `l0_index` | proportional to total adds | ~80 MB | ~640 MB | **Existing — unavoidable; same in V2** |
| `point_x`, `point_y` (SRS) | `n × 64 B × 2` | ~16 MB | ~128 MB | Existing |

**Streaming-specific addition (everything except SRS/l0_index/bucket_sums): ~9 MB at 2^17, ~31 MB at 2^20.** This compares against the V2 pair-tree's ~62 MB of `bufA/bufB/ringBuf/prefScratchBuf` at 2^17 — the dominant memory win.

### 3.2 Total memory at n=2^20

| Category | V2 pair-tree (current) | Stream walker (this plan) |
|---|---:|---:|
| SRS + l0_index (any algorithm) | ~770 MB | ~770 MB |
| Algorithm-specific accumulation | ~62 MB (extrapolated from 2^17) | ~10 MB |
| `bucket_sums` | ~18 MB | ~18 MB |
| **Total** | **~850 MB** | **~798 MB** |

Note: the elephant in the room at n=2^20 is `l0_index` + SRS, which is shared by every algorithm. To fit 100 MB budget for the *streaming MSM specifically* (excluding the prover's other budgets for SRS/l0_index management), we need the accumulation column at ≤ 30 MB. Stream walker delivers ~10 MB. The remaining budget should go elsewhere in the prover.

---

## 4. Kernel parameters

```
const TPB              = 128;     // workgroup_size — chosen so pref_scratch fits in 32 KB shared
const S                = 8;       // slots per thread; pair-pointers per inversion
const MIN_ITERS_PER_WG = 8;       // amortize kernel launch cost
const MAX_STREAM_WORKGROUPS = 64; // up from 32 — at n=2^20 we want more parallelism than 32 WGs offers
```

At n=2^17: `nwg = clamp(131K / (128·8·8), 1, 64) = clamp(16, 1, 64) = 16`. NUM_THREADS = 2048.

At n=2^20: `nwg = clamp(20M / 8192, 1, 64) = 64`. NUM_THREADS = 8192.

`pref_scratch` workgroup-shared size: `TPB × S × 2 planes × 16 B = 128 × 8 × 32 = 32 KB`. Exactly at M2's limit; Adreno supports 32 KB on recent versions; Mali Bifrost 16 KB which would force TPB=64 on those targets. **Mobile GPU note: if we discover Mali targets max out at 16 KB workgroup memory, drop TPB to 64 and double `MAX_STREAM_WORKGROUPS`.**

---

## 5. Planner changes

### 5.1 `ba_planner_cumsum` — modified

`target_work` formula updates to match new constants:
```wgsl
let target_work = TPB * S * MIN_ITERS_PER_WG;  // = 128 * 8 * 8 = 8192
nwg = clamp(total_adds / target_work, 1, MAX_STREAM_WORKGROUPS);
```

Also writes indirect-dispatch args for `ba_stream_walker` at `planner_meta[12..14]` (same as today).

### 5.2 `ba_planner_split_detect` — DROPPED in initial stream-walker

*Original design here was a single-thread planner kernel that pre-computed inter-thread splits. During implementation I dropped it: every inter-thread split is also detected by the walker (as a `cur_offset > 0` condition on slot 0 or `task_end_offset > 0` condition on slot 7), and having two sources of split records introduced an awkward coordination contract — the walker would need to know which slots' partial-writes were already covered by `split_detect` to avoid double-emitting. Simpler to have the walker be the single source of truth.*

*Effect on the plan: all `split_records` entries are emitted by the walker via a single atomic counter at `planner_meta[5]`. `partials_buf` slot encoding is `t * 8 + k` for slot k of thread t (unchanged). Host fixup groups entries by bucket. The original §5.2 pseudo-code is preserved below for reference but is not implemented.*

**Original pseudo-code (NOT implemented):**

```wgsl
@compute @workgroup_size(1)
fn main() {
  var sb: u32 = 0u;
  let num_active_threads = planner_meta[3] * TPB;

  // Inter-thread splits.
  for (var t: u32 = 1u; t < num_active_threads; t = t + 1u) {
    let cb = thread_cuts[2u*t + 0u];
    let co = thread_cuts[2u*t + 1u];
    if (co > 0u) {
      // bucket cb is split between threads t-1 and t.
      split_records[3u*sb + 0u] = sorted_bucket_list[cb];
      // first_partial_idx: thread t-1's partial slot for its LAST slot
      // (i.e., 8*(t-1) + 7), thread t's partial slot for its FIRST slot
      // (8*t + 0). partial_count = 2 for inter-thread-only.
      split_records[3u*sb + 1u] = 8u*(t - 1u) + 7u;  // first partial position
      split_records[3u*sb + 2u] = 2u;                  // count of partials
      sb = sb + 1u;
    }
  }

  // Intra-thread splits are NOT enumerated here — they are produced by
  // the stream-walker kernel itself when a task boundary lands mid-bucket.
  // Those splits get appended to split_records during kernel execution.
  //
  // ... see §9 for the intra-thread split protocol.

  planner_meta[META_INTER_SPLIT_COUNT] = sb;
}
```

Intra-thread split detection happens in the walker kernel because the per-thread task partitioning is computed there. The single-thread planner pass handles only the easy inter-thread case.

---

## 6. The stream-walker kernel

### 6.1 Bindings (8 storage + 1 uniform — within the 8-binding mobile limit if we drop one)

```wgsl
@group(0) @binding(0) var<storage, read>       sorted_bucket_list:  array<u32>;
@group(0) @binding(1) var<storage, read>       sorted_count_list:   array<u32>;
@group(0) @binding(2) var<storage, read>       offsets:             array<u32>;
@group(0) @binding(3) var<storage, read>       cumulative_adds:     array<u32>;
@group(0) @binding(4) var<storage, read>       thread_cuts:         array<u32>;
@group(0) @binding(5) var<storage, read>       l0_index:            array<u32>;
@group(0) @binding(6) var<storage, read>       point_x:             array<vec4<u32>>;
@group(0) @binding(7) var<storage, read>       point_y:             array<vec4<u32>>;
@group(0) @binding(8) var<storage, read_write> bucket_sums:         array<vec4<u32>>;
@group(0) @binding(9) var<storage, read_write> partials_buf:        array<vec4<u32>>;
@group(0) @binding(10) var<storage, read_write> split_records:      array<atomic<u32>>;
@group(0) @binding(11) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(12) var<uniform>             params:             vec4<u32>;
```

**This is 13 bindings — too many for mobile** (`maxStorageBuffersPerShaderStage=8`). Reduction strategy:

- Combine `sorted_bucket_list`, `sorted_count_list`, `offsets`, `cumulative_adds` into one packed buffer (4 u32 per bucket).
- Combine `bucket_sums` and `partials_buf` into one buffer with offset addressing (`bucket_sums` lives at offset 0, `partials_buf` at offset `bTotal × 64`).
- Combine `point_x` and `point_y` into one buffer with offset (point_y at offset `n × 32`).
- `split_records` is small enough to merge with `partials_buf` tail.

Target: **7 storage + 1 uniform = 8 bindings.**

```wgsl
@group(0) @binding(0) var<storage, read>       bucket_meta:    array<vec4<u32>>;  // (sorted_bucket, count, offset, cum_adds)
@group(0) @binding(1) var<storage, read>       thread_cuts:    array<u32>;        // 2 u32/thread
@group(0) @binding(2) var<storage, read>       l0_index:       array<u32>;
@group(0) @binding(3) var<storage, read>       points:         array<vec4<u32>>;  // x and y with offset
@group(0) @binding(4) var<storage, read_write> sums_and_partials: array<vec4<u32>>;  // bucket_sums || partials_buf
@group(0) @binding(5) var<storage, read_write> split_records:  array<atomic<u32>>;
@group(0) @binding(6) var<storage, read>       planner_meta:   array<u32>;
@group(0) @binding(7) var<uniform>             params:         vec4<u32>;
```

`params` carries `(num_threads, b_total, n_total, M_partials_offset_in_sums)`.

### 6.2 Workgroup-shared declarations

```wgsl
var<workgroup> pref_scratch: array<vec4<u32>, TPB * S * 2>;  // 32 KB at TPB=128
//                                              [thread][slot][x_or_y_plane][limb_pair]
```

Per-thread per-slot access pattern uses `local_thread_id * S * 4 + slot_id * 4 + 0..3` indexing.

### 6.3 Top-level structure

```
fn main(global_invocation_id, local_invocation_id) {
  let t = gid.x;
  let l = lid.x;
  if t >= NUM_THREADS: return;

  // Phase 1: read thread range and partition into 8 tasks.
  let (thread_first_bucket, thread_first_offset) = thread_cuts[t];
  let (thread_last_bucket,  thread_last_offset)  = thread_cuts[t + 1];
  let task_cuts = compute_task_cuts(thread_first_bucket, thread_first_offset,
                                    thread_last_bucket,  thread_last_offset);
  // task_cuts is array<TaskCut, 9> with cuts[0] = thread start, cuts[8] = thread end.

  // Phase 2: initialize 8 slots.
  var state: array<SlotState, 8>;
  initialize_slots(state, task_cuts);

  // Phase 3: main loop.
  loop {
    if all_slots_idle(state) { break; }

    // Forward prefix
    var acc = get_r_f8();
    for k in 0..8: {
      let dx = compute_dx_for_slot(state[k]);
      acc = mul(acc, dx);
      pref_scratch[l * S + k] = acc;
    }

    // One inversion (safegcd, per-thread)
    let inv = inverse(acc);

    // Inverse pass
    var carry = inv;
    for jj in 0..8: {
      let k = 7 - jj;
      let inv_dx = mul(carry, pref_scratch[l * S + (k - 1)]);
      if k > 0 { carry = mul(carry, dx_for_slot(state[k])); }
      pref_scratch[l * S + k] = inv_dx;
    }

    // Backward peel
    for jj in 0..8: {
      let k = 7 - jj;
      if state[k].is_idle { continue; /* discard work */ }

      let r = affine_add_step(state[k], pref_scratch[l * S + k]);
      advance_slot(state, k, r, task_cuts);  // see §7
    }
  }
}
```

---

## 7. Per-slot state machine

### 7.1 SlotState (private memory)

```wgsl
struct SlotState {
  // Position within the bucket stream
  cur_bucket_sorted:  u32,    // index into bucket_meta
  cur_offset:         u32,    // offset within current bucket's add range
  cur_l0_base:        u32,    // offsets[cur_bucket_sorted] — cached, refreshed on bucket advance
  cur_count:          u32,    // sorted_count_list[cur_bucket_sorted] - 1 — cached
  task_end_bucket:    u32,    // last bucket of this slot's task
  task_end_offset:    u32,    // last offset within task_end_bucket
  is_first:           bool,   // true on the first add of a fresh bucket
  is_idle:            bool,   // slot has exhausted its task
  is_split_start:     bool,   // current bucket is shared with prev thread/task
  is_split_end:       bool,   // current bucket is shared with next thread/task
  partial_write_idx:  u32,    // where to write retire result if split

  acc_x, acc_y:       array<u32, 8>,  // ~32 B each, lives in registers
}
```

Approximate size: ~96 bytes × 8 = 768 bytes per thread of private storage. Comfortable in M2's per-thread register file.

### 7.2 Slot lifecycle

```
INIT (per slot k):
  let (cur_bucket, cur_off, end_bucket, end_off) = task_cuts[k..k+1]
  state[k].cur_bucket_sorted = cur_bucket
  state[k].cur_offset        = cur_off
  state[k].cur_l0_base       = bucket_meta[cur_bucket].offset
  state[k].cur_count         = bucket_meta[cur_bucket].count - 1
  state[k].task_end_bucket   = end_bucket
  state[k].task_end_offset   = end_off
  state[k].is_first          = true
  state[k].is_idle           = (cur_bucket == end_bucket && cur_off == end_off)  // empty task
  state[k].is_split_start    = (cur_off > 0 || cur_bucket_is_first_of_thread_and_thread_offset > 0)
  state[k].is_split_end      = false  // computed dynamically when bucket exhausts
  state[k].partial_write_idx = encode_partial_slot(t, k, kind)  // see §9

PER-ITERATION (within backward peel):
  // r_x, r_y is the affine-add result for this iter
  state[k].cur_offset += (state[k].is_first ? 2 : 1)
  state[k].is_first = false

  let bucket_exhausted = (state[k].cur_offset >= state[k].cur_count)
  let task_exhausted   = (state[k].cur_bucket_sorted == state[k].task_end_bucket
                         && state[k].cur_offset >= state[k].task_end_offset)

  if (task_exhausted):
    // Task done — retire this iter's result and idle the slot.
    let is_partial = (state[k].cur_offset < state[k].cur_count)  // ended mid-bucket
                  || state[k].is_split_start
                  || state[k].is_split_end_for_this_thread
    if (is_partial):
      partials_buf[state[k].partial_write_idx] = (r_x, r_y)
      record_intra_thread_split_if_needed(...)  // §9.2
    else:
      bucket_sums[bucket_meta[state[k].cur_bucket_sorted].bucket_id] = (r_x, r_y)
    state[k].is_idle = true

  elif (bucket_exhausted):
    // Bucket done within task — retire to bucket_sums (no split), advance.
    bucket_sums[bucket_meta[state[k].cur_bucket_sorted].bucket_id] = (r_x, r_y)
    state[k].cur_bucket_sorted += 1
    state[k].cur_offset = 0
    state[k].cur_l0_base = bucket_meta[state[k].cur_bucket_sorted].offset
    state[k].cur_count   = bucket_meta[state[k].cur_bucket_sorted].count - 1
    state[k].is_first = true
    state[k].is_split_start = false  // moved past split-start bucket

  else:
    // Within-bucket progress — store accumulator in registers for next iter.
    state[k].acc_x = r_x
    state[k].acc_y = r_y

IDLE LOOP (when state[k].is_idle):
  // Use IDLE anchor points (offsets idle_anchor and idle_anchor+1 in l0_index,
  // chosen so the dx between them is nonzero on BN254 SRS).
  // The affine-add result is discarded.
  // This keeps the per-iter instruction count uniform across the workgroup.
```

### 7.3 Termination

Thread exits when all 8 slots have `is_idle = true`. Within a workgroup, the kernel naturally runs until the last thread's last slot retires — no explicit barrier needed because there's no cross-thread state.

---

## 8. Task partitioning algorithm

Each thread partitions its `[thread_first, thread_last)` work range into 8 equal-work tasks at kernel init.

### 8.1 Algorithm

```
Inputs:
  thread_first_bucket, thread_first_offset (from thread_cuts[t])
  thread_last_bucket,  thread_last_offset  (from thread_cuts[t+1])

Step 1: Compute total adds in thread's range.
  Use cumulative_adds (already computed by planner cumsum):
    let total_at_thread_start = cumulative_adds[thread_first_bucket] + thread_first_offset
    let total_at_thread_end   = cumulative_adds[thread_last_bucket]  + thread_last_offset
    let thread_total = total_at_thread_end - total_at_thread_start

Step 2: Find 8 task cut points in cumulative-adds space.
  for k in 0..9:
    let target = total_at_thread_start + (k * thread_total) / 8
    task_cuts[k] = binary_search_cumulative_adds(target, range=[thread_first_bucket, thread_last_bucket])
    // Returns (bucket_sorted_idx, offset_within_bucket).
```

**Binary search bounds:** the thread's range covers at most `(thread_total / 1) + 1` buckets (when each bucket has 1 add). Realistically at n=2^20 with c=15 and ~2400 adds per thread, each thread covers ~20-30 buckets. Binary search depth ~5.

**Cost per thread:** 9 binary searches × ~5 reads each = ~45 reads. Plus 2 reads to set up `thread_total`. **~50 reads per thread, one-time at init.** Negligible vs main-loop.

### 8.2 Edge cases

| Case | Detection | Handling |
|---|---|---|
| Thread has 0 adds | `thread_total == 0` | All slots `is_idle = true` at init; main loop exits immediately |
| Thread has < 8 adds | `thread_total < 8` | Some tasks get 0 adds → corresponding slots are idle from start |
| Thread's range is entirely within one bucket | `thread_first_bucket == thread_last_bucket` | All 8 task_cuts are within that bucket. Every retire is a partial (no bucket completes within this thread). See §9.4 |
| Thread's first task is a partial-start | `thread_first_offset > 0` | Slot 0's first bucket is `is_split_start = true`; its first retire writes to partials_buf |
| Thread's last task is a partial-end | `thread_last_offset > 0` | Slot 7's last bucket retire is a partial-end |

---

## 9. Split bucket handling

A bucket is **split** if multiple writers (across thread/task boundaries) contribute partials to it. Every split bucket needs at least 2 partial slots written and a reduction (§10).

### 9.1 Three sources of splits

1. **Inter-thread splits**: `thread_cuts[t+1].offset > 0` → bucket is shared between thread t and t+1. Detected by `ba_planner_split_detect` (§5.2).
2. **Intra-thread task splits**: a task boundary inside thread t lands mid-bucket. Detected at kernel init time by inspecting `task_cuts`.
3. **Single-bucket threads (CC-2)**: entire thread is inside one bucket. All 8 task boundaries are intra-bucket → 8 partials per thread for that bucket. Detected at init.

### 9.2 Partial slot encoding (deterministic, no atomics in the inner loop)

`partials_buf` is sized `8 × NUM_THREADS × 64 B`. Slot `(t, k)` lives at `partials_buf[t * 8 + k]`.

Each slot k of thread t has a predetermined partial-write address: `t * 8 + k`. This is computed at init and stored in `state[k].partial_write_idx`. When the slot retires a partial, it writes to that address without contention.

### 9.3 `split_records` construction

The planner's `ba_planner_split_detect` (§5.2) writes inter-thread splits to `split_records`. Intra-thread splits are written by the walker kernel via atomic-allocated slabs (single atomic per thread on `planner_meta[META_SPLIT_COUNT]`, so atomic contention is bounded by NUM_THREADS — same magnitude as the existing `planner_meta[6]` slab atomic).

```
// In the walker kernel, at init time, after computing task_cuts:
var intra_split_count: u32 = 0;
var intra_split_records: array<(bucket, first_slot, count), 8>;  // private memory

for k in 0..8:
  let (sb, so) = task_cuts[k]
  let (eb, eo) = task_cuts[k+1]
  if sb == eb and eo > 0 and so < eo:
    // Task is entirely within bucket sb, ends mid-bucket → partial
    intra_split_records[intra_split_count] = (sb, t*8 + k, 1)
    intra_split_count += 1
  elif sb != eb and eo > 0:
    // Task ends mid-bucket eb → partial at eb
    intra_split_records[intra_split_count] = (eb, t*8 + k, 1)
    intra_split_count += 1
  // Handle intra-thread split-starts similarly (first add of next task is mid-bucket)

if intra_split_count > 0:
  let base = atomicAdd(&planner_meta[META_SPLIT_COUNT], intra_split_count);
  for i in 0..intra_split_count:
    split_records[3 * (base + i) + 0] = intra_split_records[i].bucket
    split_records[3 * (base + i) + 1] = intra_split_records[i].first_slot
    split_records[3 * (base + i) + 2] = intra_split_records[i].count
```

**Atomic count:** 1 atomic per thread (only if the thread has any intra-thread splits). At NUM_THREADS=8192, worst case 8192 atomics on one global counter → same magnitude as the existing `planner_meta[6]` allocator. Bounded.

### 9.4 CC-2 protocol (single-bucket thread)

When `thread_first_bucket == thread_last_bucket`, the entire thread is one slice of one bucket. All 8 task partitions slice that bucket. Each retire is a partial. The thread emits ONE split record with `(bucket, first_slot=t*8, count=8)`. The host fixup combines all 8 partials for this bucket.

---

## 10. Host-side partials fixup (initial stream-walker hack)

**Per user directive: this is temporary. The GPU partials-reduction kernel is deferred to a follow-up session. Exclude from kernel-timing benchmarks.**

### 10.1 Protocol

After `ba_stream_walker` completes and before `ba_reduce_init_bench`:

1. Host reads `split_records` count from `planner_meta[META_SPLIT_COUNT]`.
2. Host reads `split_records[0..split_count]` and `partials_buf[0..NUM_THREADS*8]` via `mapAsync`.
3. Host CPU-side: for each split record `(bucket, first_slot, count)`:
   - Sequentially affine-add `partials_buf[first_slot]` through `partials_buf[first_slot + count - 1]` together
   - Combine with the existing `bucket_sums[bucket]` write (which may or may not be present depending on whether any of the contributing tasks wrote a whole-bucket retire to `bucket_sums[bucket]`; the walker convention is that whole-bucket retires happen only when the bucket is fully consumed within ONE task)
   - Write the result back to `bucket_sums[bucket]`
4. Host writes `bucket_sums` updates back via a small `writeBuffer` call.

**Why this works:** the walker has carefully placed every retire either in `bucket_sums` (whole-bucket within one task) or in `partials_buf` (split bucket contribution). The host just needs to reduce the partials.

### 10.2 Benchmark exclusion

The bench harness measures GPU kernel time via `timestampWrites`. Host fixup happens between `device.queue.submit()` and the next compute pass — it's wall-clock time but **not** counted in `gpu_phase_breakdown.accumulate`. We add an explicit `host_partials_fixup_ms` field to the bench report so it's visible but separable.

For the streaming-vs-pair-tree GPU comparison, the relevant numbers are `gpu_phase_breakdown.accumulate` (which excludes host time entirely). For wall-time fairness, both sides include their respective host overhead.

### 10.3 GPU partials-reduction kernel (follow-up session, not this plan)

GPU `ba_partial_sum` kernel that:
- Reads `split_records`
- One workgroup per split (or batched workgroups for small splits)
- Pairwise reduction with per-thread S=8 batched inversion
- Writes final to `bucket_sums`

This is what the original plan §7 already proposes — its design is sound; the current implementation just has correctness bugs from the upstream queue model. With clean `split_records` input, the kernel becomes straightforward.

---

## 11. Verification plan

### 11.1 Correctness gates (in order)

| Gate | Test | Expected outcome |
|---|---|---|
| G1 | `ba_planner_split_detect` produces `split_records` matching a CPU reference computed from `thread_cuts` | bit-equal |
| G2 | Walker at logn=8, 1 workgroup, single-bucket data | bucket_sums = CPU `cpuReferenceAccumulate` |
| G3 | Walker at logn=10, multi-bucket data, no splits forced | bucket_sums match (partials_buf should be empty) |
| G4 | Walker at logn=10, splits forced (small per-thread budget → many splits) | bucket_sums + host fixup of partials_buf match CPU reference |
| G5 | Walker at logn=14, default config, cross-check against WASM (with host fixup) | "WebGPU and WASM MT agree" |
| G6 | Walker at logn=17, cross-check on real M2 (with host fixup) | agree |
| G7 | Walker at logn=20, memory and correctness | agree, memory under 100 MB streaming budget |

### 11.2 Memory measurement

Add a debug pass that sums the byte sizes of all `device.createBuffer` calls and emits via the bench harness. Confirm streaming working set ≤ 30 MB at n=2^17 and ≤ 100 MB at n=2^20.

### 11.3 Local testing infrastructure

Use the existing `drive-index.mjs` against real Chrome WebGPU on M2 (not SwiftShader):

```bash
# Terminal 1
cd ~/aztec-packages/barretenberg/ts
yarn dev:msm-webgpu --host 127.0.0.1 --port 5173

# Terminal 2 — cross-check (correctness gate)
node dev/msm-webgpu/drive-index.mjs \
  'http://127.0.0.1:5173/dev/msm-webgpu/index.html?coi=1&autorun=msm-cross-check&logn=17'

# Terminal 2 — bench (perf gate)
node dev/msm-webgpu/drive-index.mjs \
  'http://127.0.0.1:5173/dev/msm-webgpu/index.html?coi=1&autorun=msm-bench&logn=17&reps=5'
```

Real M2 GPU, no BrowserStack round-trip, no SwiftShader.

---

## 12. Performance measurement

### 12.1 Per-kernel timing (`profile=1` mode)

The existing `setPhase()` infrastructure in `msm_v2.ts:2229+` already labels each kernel. Add new phases:

- `planner` (existing, covers classify through partition_thread)
- `split_detect` (new — single-thread split detection)
- `size1` (existing)
- `stream_walker` (replaces `stream_accum` + `partial_sum`)
- `host_partials_fixup` (V1 only — measured separately, **not** in GPU breakdown)
- `reduce` (existing)

### 12.2 Comparison targets at n=2^17

| Phase | Pair-tree V2 (baseline) | Stream-walker target | Stretch |
|---|---:|---:|---:|
| preprocess | 13 ms | ≤ 13 ms | — |
| planner (incl. split_detect) | 1.7 ms | ≤ 4 ms | ≤ 2 ms |
| accumulate | 51 ms | ≤ 60 ms | ≤ 40 ms |
| reduce | 8.6 ms | ≤ 8.6 ms | — |
| **total GPU** | **74.8 ms** | **≤ 85 ms** | **≤ 65 ms** |
| host_partials_fixup | n/a | **excluded from total** | n/a |

"Target" = acceptable for first stream-walker ship. "Stretch" = what we aspire to with the workgroup-shared pref_scratch + redundant-load elimination.

(In this table, "Pair-tree V2" refers to the existing in-tree pair-tree algorithm — the baseline your 2026-05-28 benchmark report measured at 51 ms accumulate at n=2^17. It is not the same thing as the stream-walker.)

### 12.3 Comparison targets at n=2^20

Pair-tree at n=2^20 may not fit in memory at all (extrapolating its 384 MB at 2^17 to 2^20 by linear-in-n is ~3 GB; even sub-linear scaling busts the budget). Stream walker must work AND beat pair-tree (which may simply be infeasible at this size). **Success criterion at 2^20: cross-check passes, total GPU time < 1 second.** Absolute numbers TBD by measurement.

---

## 13. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Workgroup-shared `pref_scratch` requires TPB=128, halving WG count vs current TPB=256 | Low | M2 has 8 cores; 16 WGs at n=2^17 still oversubscribes 2× per core. Mobile may benefit from smaller WGs anyway. |
| Mobile Mali targets max 16 KB workgroup memory → forces TPB=64 | Medium | Detection: query `maxComputeWorkgroupStorageSize` at adapter init; fall back to TPB=64 + 2× WG count. Pref_scratch declaration uses a const that's set at shader-gen time. |
| Tail IDLE penalty when slot work imbalance exceeds expectation | Low-Medium | Equal-work task partitioning bounds this. Worst case: huge first bucket in a thread → slot 0 grinds while others idle on anchor. Measurable; mitigation is task partitioning quality. |
| Host partials fixup time dominates wall-clock at high split counts | Medium (initial stream-walker only) | Host fixup is O(num_splits × adds_per_split) which is small at typical loads (≤ NUM_THREADS·8 splits, avg 2-4 partials each, ~1-2 ms host CPU). Acceptable for the initial ship. The GPU partials-reduction kernel follow-up removes this entirely. |
| Memory access uncoalesced across warp | Medium on mobile | Documented as a deferred optimization. Measurement on M2 + Adreno with the initial block-layout stream-walker tells us whether to invest in the coalesced-task layout. |
| `acc_buf` register spill if private state too large | Low | 768 B per thread total; M2 has ~256 KB per-core register file divided across active threads. Comfortable. If spill occurs, fall back to keeping `acc_x`/`acc_y` in workgroup memory at the cost of TPB=64. |
| `split_records` overflow if too many splits | Low | Sized at `9 × NUM_THREADS` (worst case = 8 intra-thread per thread + 1 inter-thread tail). Bounded. |

---

## 14. Implementation order

Strict sequencing — each step must verify before the next begins.

1. **Add new constants** (`MAX_STREAM_WORKGROUPS = 64`, etc.) and the new `bucket_meta` packed buffer to `ba_stream_plan.ts`. Verify existing kernels still compile and pass cross-check at logn=10.
2. **(DROPPED — see §5.2)** Originally `ba_planner_split_detect`. Subsumed into the walker's atomic-counter partials emission. Gate G1 is moved into the walker's smoke-test (verify split_records entries produced by the walker match a CPU reference computed from thread_cuts + per-thread task partition).
3. **Implement `ba_stream_walker` skeleton** — bindings, init phase (task partitioning), an empty main loop. Verify with a forced single-thread, single-slot, single-bucket configuration that the slot lifecycle works. Gate G2.
4. **Add main loop** (forward prefix, inversion, inverse pass, backward peel) reusing field arithmetic templates from the current `ba_stream_accum`. Verify at logn=10 without splits. Gate G3.
5. **Implement partial-write paths** (slot retirement to `partials_buf`, intra-thread split detection at init, atomic `split_records` registration). Gate G4.
6. **Implement host partials fixup** in TypeScript. Verify against WASM cross-check. Gate G5.
7. **Wire into the batched MSM path** (`encodeIntoBatch`). Delete old `ba_stream_accum`, `ba_stream_accum_debug`, `ba_partial_sum`, `ba_recompute_split`, emit, emit_fixup. Verify at logn=14, 17. Gates G5-G6.
8. **Add the `host_partials_fixup_ms` field to bench reports** and adjust GPU-time aggregation to exclude it. Run perf gates at 2^17.
9. **Remove V2 pair-tree buffers** (`bufA`, `bufB`, `ring*`, `prefScratchBuf`) from the pool. Verify memory measurement gate.
10. **Test at n=2^20.** Gate G7.

### 14.1 Stop conditions

- If gates G1-G4 don't pass within ~3-5 iterations each, the per-thread/per-slot bookkeeping has a structural error — stop and re-validate the state machine against this plan before more code.
- If G5 (cross-check) passes but the perf target at 2^17 misses by >2×, investigate per-kernel breakdown to localize the cost (likely candidates: SRS read pattern, pref_scratch contention, IDLE overhead) before adding mitigations.
- If memory at 2^20 exceeds budget, do NOT attempt to mitigate within stream-walker — the budget overrun is most likely from `l0_index` or SRS, both of which are upstream of this kernel and need a separate plan.

---

## 15. What this plan does not address

- **GPU `ba_partial_sum` kernel design.** Deferred. The original plan §7 sketches it; with clean `split_records` input from this plan, it becomes a straightforward per-thread S=8 batched-inversion tree reduction restricted to split buckets.
- **Coalesced-task layout (interleaved across warp).** Deferred to a follow-up optimization pass after initial-stream-walker measurement on M2 and Adreno targets.
- **Mobile GPU specific tuning** (Mali workgroup memory limit fallback, Adreno coalescing patterns). Deferred — the initial stream-walker targets M2 first.
- **`c` (window size) selection at n=2^20.** Assumed unchanged from current selection logic.

---

## 15.1 Local implementation status (this session)

Branch `stream-walker-impl` at `/tmp/aztec-pr23575` carries the work-in-progress. Heads as of this session:

| Commit | Step | What landed |
|---|---|---|
| `0f45d295ca` | §14 step 1 | Constants + bucket_meta/splitRecords buffer sizes in `ba_stream_plan.ts`. TS compile clean. |
| `89b62330a7` | §14 step 2 | Plan §5.2 / §14 step 2 dropped (walker emits all split_records — see edit above). |
| `9f8d8acf33` | §14 steps 3+4 | New WGSL templates: `ba_bucket_meta_pack.template.wgsl`, `ba_stream_walker.template.wgsl`. `shader_manager.ts` gen functions wired. Mustache render succeeds. WGSL not yet sent through Tint at runtime. |

### What's NOT done yet, in order of next-session priority

1. **Wire walker into `msm_v2.ts`** — currently a phantom kernel: compiled by `shader_manager.ts` but not instantiated, bound, or dispatched. Pool allocation for `bucket_meta`, `partials_buf` (16/thread), `split_records` (16 entries/thread × 2 u32) needs adding. The walker uses 8 storage + 1 uniform bindings; on M2 desktop this fits.
2. **Bucket-meta pack kernel dispatch** — runs after the planner's partition_thread, before the walker, populating `bucket_meta` from `sorted_bucket_list/sorted_count_list/offsets/cumulative_adds`.
3. **Combined `points` buffer** — walker expects `point_x` and `point_y` concatenated with `point_y` at offset `params.z`. Easiest path is to allocate a new combined buffer at pool init (or stack `point_y` in the existing `point_x` allocation with a stride).
4. **Host-side partials fixup** — §10 protocol; readback `split_records` + `partials_buf`, group by bucket_id, sequential affine-add on CPU, writeBuffer back to `bucket_sums`. Excluded from GPU timing.
5. **Cross-check at logn=10** — `?autorun=msm-cross-check&logn=10` against WASM. This is the first real correctness gate.

### Open issues / known bugs in current code

- **No runtime WGSL validation done.** naga rejects existing `fr_inv_by_loop_pk` (`const JUMPY_K` in function scope) — that's a naga vs Tint gap, pre-existing. The walker hasn't been sent through Chrome's actual compiler. First dispatch may surface bugs (binding mismatches, fixed-size array out-of-bounds, etc.).
- **Worktree node_modules is a symlink** to the main checkout's `~/aztec-packages/barretenberg/ts/node_modules`. If the operator's other agent on `tier-2-v2` regenerates anything in there, this worktree's builds may break unexpectedly.
- **Bindings count = 9** is fine on M2 but exceeds the mobile-WebGPU default `maxStorageBuffersPerShaderStage=8`. Mobile fallback: fold `bucket_sums + partials_buf` into one `sums_and_partials` binding (the earlier-version layout the walker WGSL was first written against — easily restored).

## 16. Cross-references

- Original PR #23575 plan gist: https://gist.github.com/AztecBot/439c9925837d13f010204b5c9d6400ad
- 2^17 benchmark report: https://gist.github.com/AztecBot/2dc66289627deb44f546faebd41d2acf
- Iteration / failure report: https://gist.github.com/AztecBot/8c3e80a19a02ef587fadfdeb6fc126b1
- PR head as of plan authoring: `d67c6d8ebf` (worktree at `/tmp/aztec-pr23575`)
- Audit conversation: this session
