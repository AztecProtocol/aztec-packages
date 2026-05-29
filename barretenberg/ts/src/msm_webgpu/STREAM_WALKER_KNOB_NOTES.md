# Stream-walker — design-knob variation (thread C)

This branch implements the per-thread bucket-monotonic stream-walker from the
plan with **two deliberate design-knob variations** (both flagged in plan §13),
to see whether either choice changes the perf / correctness / complexity
picture. SwiftShader (software WebGPU) is the only renderer available in the
build container, so all timing observations below are software-renderer notes —
they do **not** generalise to M2 and must be re-measured on real hardware
(per the operator's explicit caveat).

## What changed vs the plan defaults

### KNOB 1 — TPB=64 with `pref_scratch` in `var<workgroup>`
- Plan default: TPB=128, 32 KB `pref_scratch` (at M2's shared-memory limit).
- Variant: **TPB=64**, `pref_scratch` = `TPB*S*2` vec4 = **16 KB** of workgroup
  memory, so the walker fits Mali Bifrost's 16 KB workgroup-memory limit with
  no fallback path. NUM_THREADS is held constant (max_workgroups doubled in
  effect), so all streaming buffers keep the same size.
- Accumulators live in **private registers** (plan §7.1) rather than a device
  `acc_buf`, which also frees a storage binding.

### KNOB 2 — task partitioning in a dedicated planner kernel
- Plan default: the walker computes its S task cuts at kernel init
  (9 binary searches/thread).
- Variant: a new **`ba_planner_partition_task`** kernel precomputes `task_cuts`
  before the walker; the walker reads them. Thread 0 of that kernel also emits
  the walker's indirect-dispatch args.

## Observations

### Complexity
- **KNOB 1 is essentially free in code.** Each thread uses only its own
  `pref_scratch[l*S..]` region, so there is no cross-thread aliasing and no
  `workgroupBarrier` in the main loop — the workgroup buffer behaves exactly
  like the per-thread device scratch it replaces. The diff is the declaration
  (`var<workgroup>` vs a binding) plus the TPB constant. No algorithmic change,
  and it removes one storage binding (helping the 8-binding mobile target).
- **KNOB 2 removes the binary-search block from the walker init** at the cost of
  a ~90-line planner kernel + one storage buffer (`task_cuts`) + one pipeline /
  bind / dispatch. A useful side effect of hoisting: the walker's split
  bookkeeping stays simple and the variant avoids the plan's in-walker atomic
  split-record append entirely. Splits are tagged per deterministic partial
  slot in `partial_dest`; a combine pass groups them. So KNOB 2 traded one
  extra dispatch for a strictly simpler, atomic-free walker.

### Correctness (SwiftShader, verified)
- The variant is **bit-exact** at logn=8 and logn=10 against the pure-JS noble
  Pippenger oracle, and matches the known-correct per-bucket debug accumulator
  with **0 mismatches** across all dense buckets, under heavy split load
  (logn=8: nwg=7, ~524 split buckets, ~1 add/task — i.e. the worst case for the
  split/partial machinery, covering gate classes G2–G4 in one shot).
- Two real walker bugs were found and fixed via the per-bucket A/B diagnostic
  (see the commit messages): a `so==count-1` continuation that owns no point of
  its start bucket, and task-end detection that compared a raw l0 cursor across
  non-monotonic sorted-bucket l0 regions. Neither is specific to the knobs —
  they are intrinsic to the walker's monotone walk — but the dedicated
  diagnostic harness (this branch) is what surfaced them.

### Launch overhead (KNOB 2)
- KNOB 2 adds exactly one extra compute dispatch (`ba_planner_partition_task`,
  nwg*256 threads in 32 workgroups of 256) and the `task_cuts` write. On
  SwiftShader this is dominated by the walker's batched-inversion loop and the
  combine scan, so it is not separately meaningful here. A clean
  separate-vs-in-kernel launch-overhead comparison needs `timestamp-query` on
  real hardware (M2) — deferred to the operator's re-measurement.

## Gate status (SwiftShader, this session)
- Baseline harness: **verified** — full pipeline vs noble agrees at logn=8 via
  the known-correct debug accumulator (`?use_debug_accum=1`). The queue-model
  `stream_accum` at branch HEAD disagrees (known WIP) — that is what the walker
  replaces.
- **G2 / G3 / G4: PASS** — walker bit-exact vs noble + debug accumulator at
  logn=8 (heavy splits) and logn=10. `?use_walker=1`.
- **Indexed combine (this PR): PASS** — bit-exact vs noble at logn=8, 10 and
  **14** (`?use_walker=1`, default combine path). See "Indexed linked-list
  combine" below. The old O(num_dense × active_partial_slots) scan is still
  reachable with `&combine=scan` for A/B only; it crashes SwiftShader (device
  lost) at logn≥10 and is not viable past the smallest gates.
- G5 (WASM cross-check): not achievable in this container — no emcc / wasi-sdk,
  so bb.js WASM cannot be built. Substituted the pure-JS noble Pippenger oracle
  (viable through ~logn=14, ~3 s). WASM cross-check deferred to M2 hardware.
- G6 / G7: require real GPU (M2 / n=2^17, 2^20) — out of scope for SwiftShader.

## Indexed linked-list combine (replaces the O(num_dense × num_slots) scan)

The correctness-first scan rescans every active partial slot for every dense
bucket. This PR replaces it with a per-bucket linked list built in one extra
pass:

- **`ba_walker_indexer`** (pure u32): one thread per partial slot. A slot
  tagged with a bucket id in `partial_dest` claims a node via a global
  `atomicAdd(&node_count, 1)` and prepends it to `bucket_head[bucket_id]` with
  an `atomicCompareExchangeWeak` retry loop. Handles are 1-indexed so
  `bucket_head == 0` means empty. Each node is 3 u32:
  `[next_handle, partial_slot, bucket_id]`.
- **`ba_walker_combine_list`**: one thread per dense bucket walks its list from
  `bucket_head` and affine-sums the pieces. Affine add is commutative, so the
  reverse-insertion list order is bit-exact with the scan.

Total combine work drops from O(num_dense × num_slots) to O(num_split_partials),
and each thread touches only its own pieces.

### Timing (SwiftShader, full GPU pipeline wall via `[gpu] returned in`)

| logn | scan combine (`&combine=scan`)    | indexed list (default) |
|------|-----------------------------------|------------------------|
| 8    | 21,320 ms (agrees)                | 346 ms (agrees)        |
| 10   | crashes SwiftShader (device lost) | 215 ms (agrees)        |
| 12   | crashes SwiftShader               | 518 ms (agrees)        |
| 14   | crashes SwiftShader               | 1,060 ms (agrees)      |

Everything but the combine path is identical between the two columns, so the
delta is the combine. These are software-renderer numbers and do **not**
generalise to M2 — but the operator has already proven the indexed design on
M2; this is the SwiftShader correctness + relative-cost confirmation.

### Buffer budget (new linked-list storage)

Sized to the worst case (every partial slot tagged), independent of logn.
At logn=17 (c=13, numWindows=20, BW=4352, B_TOTAL=87040; STREAM_T=8192, S=8;
num_partial_slots = 2·8192·8 = 131072):

| buffer         | size formula             | bytes @ logn=17      |
|----------------|--------------------------|----------------------|
| `bucket_head`  | B_TOTAL × 4 B            | 348,160 (~340 KB)    |
| `node_count`   | 1 atomic u32 (16 B min) | 16                   |
| `walker_nodes` | num_slots × 3 u32 × 4 B | 1,572,864 (~1.50 MB) |
| **total**      |                          | **~1.84 MB**         |

## How to reproduce
```
cd barretenberg/ts && yarn dev:msm-webgpu --host 127.0.0.1 --port 5173
# walker variant vs noble oracle (no WASM build needed):
node dev/msm-webgpu/drive-swiftshader.mjs \
  'http://127.0.0.1:5173/dev/msm-webgpu/index.html?autorun=msm-gpu-noble&logn=8&srs_logn=10&logn_min=8&use_walker=1'
# add &msm_diag=1 for the per-bucket A/B (walker vs debug accumulator) dump.
# indexed combine is the default; add &combine=scan to A/B against the old scan.
```
