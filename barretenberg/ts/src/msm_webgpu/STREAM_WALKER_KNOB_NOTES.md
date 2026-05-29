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
- G5 (logn≥14): not run. The split-combine here is a correctness-first
  O(num_dense × active_partial_slots) scan, fine for the small-n gates but too
  slow at logn≥14; large-n needs the plan's host-side partials fixup or an
  indexed GPU reduction. (Flagged, not silently capped.)
- G6 / G7: require real GPU (M2 / n=2^17, 2^20) — out of scope for SwiftShader.

## How to reproduce
```
cd barretenberg/ts && yarn dev:msm-webgpu --host 127.0.0.1 --port 5173
# walker variant vs noble oracle (no WASM build needed):
node dev/msm-webgpu/drive-swiftshader.mjs \
  'http://127.0.0.1:5173/dev/msm-webgpu/index.html?autorun=msm-gpu-noble&logn=8&srs_logn=10&logn_min=8&use_walker=1'
# add &msm_diag=1 for the per-bucket A/B (walker vs debug accumulator) dump.
```
