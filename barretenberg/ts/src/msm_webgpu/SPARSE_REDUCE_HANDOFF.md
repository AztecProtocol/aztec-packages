# Sparse bucket-reduce — handoff

Worktree: `~/localclaudebox/wt-memory` (branch `msm-arena-rewrite`). All paths below
relative to `barretenberg/ts/` unless noted. Vite serves this worktree on port 5210.

## Goal

Make the WebGPU MSM **bucket reduction** fast on *real production* scalar data. The
dense reduce (`ba_reduce_level_bench`) is a flat **6.1 ms, data-independent** — it runs
the full `2^(c-1)` buckets × every window even when most high-window buckets are empty.
On the real Chonk wire commits that's the single biggest avoidable cost.

## The lever — proven on real data (this is solid; don't re-litigate it)

Dumped **all 505 MSMs** of `ChonkAPI::prove(ecdsar1+transfer_1_recursions+sponsored_fpc)`
(see Repro). Findings:

- **Wire commits** (`w_l/w_r/w_o/w_4` — the only polys passing `dedup_hint=true`) are the
  largest category: **56 MSMs, 3.85M point-terms**, and genuinely mixed:
  **22% zero, 14% msb<14 (bools/u8s), 59% large**. Per-wire it swings from
  `n=5490` (32% zero + 67% small + 0.3% large) to `n=131071` (100% large).
- GPU breakdown on a real mixed wire (`n=90325`): **walker 3.1 ms** (already exploits the
  structure — 3.1 vs 20.6 ms for the all-large `n=131071`), **reduce 6.1 ms**
  (identical to the all-large wire → data-independent → the waste).
- Production MSM work is ~85% structured. The walker half is already good; the **reduce**
  is the target.

## Status — what's committed & correct vs what's not

| | state |
|---|---|
| dump loader `?msm_dump=` | committed (191c3afbe1), GPU runs+cross-checks on real wire scalars |
| **v0** sparse reduce (1 thread/window, un-batched) | committed (cfac9011c4), **byte-identical correct**, but ~10× slower (1 safegcd per add) |
| **v1** sparse reduce (1 workgroup/window, WG slots, un-batched) | committed (332b7c9947), **byte-identical correct**, **slower** (reduce 17.9 vs 6.1 ms on n=90325) |
| **v2** sparse reduce (batched inversion) | **written, compiles, runs, byte-identical for S=1, WRONG for S>1**. Reverted from the tree (flag-path = correct v1). Code preserved at `wgsl/cuzk/ba_reduce_sparse_v2.wip.wgsl`. |

Default (no `?sparse_reduce=1`) is the dense tree — untouched, zero regression.
Golden (no-split, seed 12345): logN14 `255df40fb6007596`, 15 `1ae5f73b51ce81fc`,
16 `f44181e584ddb91f`, 17 `1d13b4f68d91c67c`. Real wire `wire_n23074` → `0x59e9d999ef00fd22`.

## The ONE remaining bug (v2)

v2 is the right architecture (batched + gap-aware skip) and ~90% done. It is
**byte-identical for `S=1`** (`const S` in the kernel) and **wrong for `S>1`**. So the
per-slot gap-aware math + combine are correct; the defect is in the **multi-slot batched
inversion in phase B** — the forward-prefix-product / single-inverse / backward-peel
across the S slots. The math was traced repeatedly against the dense reduce's proven
version (`ba_reduce_level_bench.template.wgsl`, the forward loop + the fused backward) and
matches, so it's almost certainly a WGSL-level detail, not the algorithm.

**Why I couldn't pin it:** the bench only emits the final commitment X-coordinate. There's
no way to see where the per-slot `run`/`alg` diverge. **Next step is instrumentation, not
more reading:** add a debug storage buffer, have v2 (with S=8) write each slot's `seg_sum`
(`run_x/run_y`) and `alg` for window 0, run a tiny case (logN16, seed 12345 — smallest with
`seg>1`), and diff against the S=1 result (correct). The divergence localizes the bug; the
fix is then small. Candidates to scrutinize while instrumented: the `pref[]`/`dx_x[]`
private arrays under register spill, the `montgomery_product_f8(accp, dxv)` chain vs the
walker's `if k==0 acc=dx`, and any single `dx==0` poisoning the whole batch's inverse.

To reproduce the failure: copy `ba_reduce_sparse_v2.wip.wgsl` over
`ba_reduce_sparse.template.wgsl`, regenerate (`node src/msm_webgpu/scripts/inline-wgsl.mjs`),
then `?autorun=msm-cross-check&logn=16&scalar_seed=12345&sparse_reduce=1` → wrong X
(`S=8`); set `const S: u32 = 1u` → correct (`f44181e584ddb91f`).

## Architecture the win requires (the operator's repeated point)

Structured data is **skewed**: window 0 (small scalars) has thousands of active buckets,
high windows a handful. So **per-window uniform allocation is wrong** — load-imbalanced and
≤numWindows workgroups resident (low occupancy under safegcd register pressure). The reduce
must mirror the **walker**: partition the **active-bucket work** into balanced tasks
(the planner already does this for accumulation), run many workgroups at full occupancy, and
**batch the inversions** (one safegcd per S adds). v2 has batched+skip but is still
one-workgroup-per-window — raising occupancy (split a window across workgroups with a
cross-workgroup combine, or many windows per workgroup) is the follow-on after the S>1 bug.

## Dead-ends — proven, do NOT repeat

- **Un-batched inversions** (v0/v1): one safegcd per affine add → inversion-bound → loses to
  the dense tree regardless of how many empties are skipped. Batching is mandatory.
- **Direct `k·bucket[k]` per active bucket** (double-and-add): more ops than the dense tree's
  suffix-sum for dense windows (window 0). Loses.
- **Variable-window split-c** (a long earlier rabbit hole): neutral-to-worse on the real
  wires — a smaller `c_hi` gives the large scalars *more* windows → more walker adds, which
  cancels the reduce savings. Not the lever. (The split machinery is on the branch behind
  `?split=1`; the table-driven reduce it left is byte-identical for no-split.)
- **Cooperative single-dispatch dense reduce**: memory-bound, measured a wash.
- The C++ (`~/barretenberg-claude-2`) variable-window split is *also* neutral-to-worse for
  structured profile C (measured: 14.2 vs 12.9 ms at 2^16); the C++ "demolishes structured
  data" via the accumulation skipping zeros, which the GPU walker already matches.

## File map

- `wgsl/cuzk/ba_reduce_sparse.template.wgsl` — current = v1 (correct). After ANY edit run
  `node src/msm_webgpu/scripts/inline-wgsl.mjs` to regenerate `wgsl/_generated/shaders.ts`
  (the runtime uses the generated file, NOT the template).
- `wgsl/cuzk/ba_reduce_sparse_v2.wip.wgsl` — the batched v2 (buggy S>1; correct S=1).
- `cuzk/shader_manager.ts` — `gen_ba_reduce_sparse_shader` (line ~541).
- `src/msm_webgpu/msm_v2.ts` — `sparseReduce` config (≈274/1543/1875); pipeline+layout
  (≈2017/2120); per-window `reduce_meta` `(base,B)` buffer + bind (≈2900); dispatch (≈3415);
  passCount (≈3092).
- `dev/msm-webgpu/main.ts` — `?sparse_reduce=1` (≈104) and `?msm_dump=<name>` loader (≈438).
- `SPARSE_REDUCE_PLAN.md` — the design + stage notes.

## Repro

Dump real scalars (C++ checkout `~/barretenberg-claude-2`):
```
# dump hook lives in scalar_multiplication.cpp pippenger_round_parallel under MSM_DUMP_DIR
cd barretenberg/cpp/build && ninja bb
MSM_DUMP_DIR=/tmp/msm-dump HARDWARE_CONCURRENCY=8 ./build/bin/bb prove -o /tmp/chonk-out \
  --ivc_inputs_path ../../yarn-project/end-to-end/example-app-ivc-inputs-out/ecdsar1+transfer_1_recursions+sponsored_fpc/ivc-inputs.msgpack \
  --scheme chonk
# files: msm_c<curvetag>_<idx>_n<n>_dup<0|1>.bin ; dup1 = wire commit ; c0001 = BN254
```
Analyze: `/tmp/analyze4.mjs` (msb histogram, wire vs non-wire).

GPU bench/validate (worktree, vite on 5210):
```
cd barretenberg/ts
bash ~/localclaudebox/msm-arena-validate.sh 5210          # golden + oracle, no-split
# sparse reduce on a real wire (dumps copied to dev/msm-webgpu/dumps/):
node dev/msm-webgpu/drive-persist.mjs "http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1&autorun=msm-cross-check&msm_dump=wire_n90325&sparse_reduce=1"
node dev/msm-webgpu/drive-persist.mjs "http://127.0.0.1:5198/dev/msm-webgpu/index.html?coi=1&autorun=msm-bench&reps=8&msm_dump=wire_n90325&sparse_reduce=1"  # breakdown in SAMPLES_JSON
```
Real wire dumps already in `dev/msm-webgpu/dumps/`: `wire_n23074`, `wire_n90325`,
`wire_n97487`, `wire_n131071`.

## Next steps, in order

1. Instrument v2 (debug buffer of per-slot `run`/`alg`), diff S=8 vs S=1 at logN16/seed
   12345, find + fix the S>1 divergence. Validate byte-identical (golden + the wire dumps).
2. Measure: target reduce 6.1 ms → ~1.5-2 ms on structured wires, unchanged on all-large.
3. Raise occupancy (multi-workgroup-per-window or many-windows-per-workgroup) + load-balance
   over the active-bucket work like the walker's planner.
4. Cost-model gate: only route a window to the sparse path when it pays (sparse windows);
   keep the dense tree for dense windows (window 0).
