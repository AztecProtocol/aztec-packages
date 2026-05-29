# Stream-walker — design-knob variation (thread C)

This branch implements the per-thread bucket-monotonic stream-walker from the
plan with **two deliberate design-knob variations** (both flagged in plan §13),
to see whether either choice changes the perf / correctness / complexity
picture. SwiftShader (software WebGPU) is the only renderer available in the
build container, so all numbers below are software-renderer observations — they
do **not** generalise to M2 and must be re-measured on real hardware.

## What was changed vs the plan defaults

### KNOB 1 — TPB=64 with `pref_scratch` in `var<workgroup>`
- Plan default: TPB=128, 32 KB `pref_scratch` (at M2's shared-memory limit).
- Variant: **TPB=64**, `pref_scratch` = `TPB*S*2` vec4 = **16 KB** workgroup
  memory, `MAX_STREAM_WORKGROUPS` doubled to keep NUM_THREADS constant (8192).
  16 KB fits Mali Bifrost's workgroup-memory limit, so the walker is portable
  to that mobile class without a fallback path.
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
- **KNOB 1 is essentially free in code.** Because each thread uses only its own
  `pref_scratch[l*S..]` region, there is no cross-thread aliasing and therefore
  no `workgroupBarrier` in the main loop — the workgroup buffer behaves exactly
  like the per-thread device scratch it replaces. The diff is the declaration
  (`var<workgroup>` vs a binding) plus the TPB/MAX_WORKGROUPS constants. No
  algorithmic change.
- **KNOB 2 removes ~50 lines from the walker init** (the binary-search block)
  at the cost of a ~70-line planner kernel + one storage buffer (`task_cuts`)
  + one extra pipeline/bind. A useful side effect: with partitioning hoisted,
  the walker's split bookkeeping stays simple and the variant avoids the plan's
  in-walker atomic split-record append entirely (splits are tagged per
  deterministic partial slot in `partial_dest`; the host/combine groups them).

### Correctness
- (to be filled from the SwiftShader gate run — G2/G3/G4 at logn≤10 vs the
  pure-JS noble oracle.)

### Launch overhead (KNOB 2)
- The separate planner adds exactly one extra compute dispatch
  (`ba_planner_partition_task`, nwg*256 threads over 32 workgroups of 256) plus
  the buffer it writes. (Measured dispatch cost to be filled from profile mode.)

## Gate status (SwiftShader, this session)
- Baseline harness: **verified** — full pipeline vs noble agrees at logn=8 when
  routed through the known-correct per-bucket debug accumulator
  (`?use_debug_accum=1`). The queue-model `stream_accum` at branch HEAD
  disagrees (known WIP), which the walker replaces.
- G1 (task partition / split tagging vs CPU ref): (status)
- G2 (walker, single bucket): (status)
- G3 (walker, multi-bucket, no forced splits): (status)
- G4 (walker, splits forced): (status)
- G5 (logn=14 vs reference): (status — the correctness-first combine is an
  O(num_dense × active_partial_slots) scan and is only intended for the small-n
  gates; large-n needs the plan's host fixup or an indexed GPU reduction.)
- G6/G7: require real GPU (M2 / n=2^17, 2^20) — out of scope for SwiftShader.
