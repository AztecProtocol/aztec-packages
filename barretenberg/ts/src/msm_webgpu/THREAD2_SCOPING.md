# Thread 2 scoping: high-memory A/B-pingpong backend

**Decision: do it as option (b) — a mode inside `msm_v2`, not a dual-backend factory.**
Below is the evidence (three parallel source/target explorations) and a step plan.

## What Thread 2 actually is

`wt/structure`'s `msm_high_memory.ts` (2883 LOC) is a full MSM pipeline whose
*bucket-sum* stage is a **multi-dispatch A/B ping-pong pair-tree** instead of the
stream-walker + combine. Flow: decompose → tiled-transpose CSR → `csr_to_v2`
convert to bucket-major `active_sums` (in `bufA`) → a 2-pass GPU planner
(`ba_planner_v2_offsets/emit`) emits per-level pair/scatter/carry plans → each
tree level is **one flat parallel dispatch over all active pairs across all hot
buckets**, affine-adding pairs and ping-ponging `bufA`↔`bufB` until every bucket
is count-1 → `ba_finalize_accumulate` harvests bucket sums (point-chunked when M
exceeds budget) → bucket→window reduction is **all-Jacobian** (inversion-free).

Two reasons it matters:
1. Faster for **small MSMs** (saturates the GPU that the serial walker starves).
2. The flat per-level dispatch is exactly the shape **CLAUDE.md hard-rule #0**
   prescribes for profiles D/E (giant buckets) — the current single-thread-per-
   bucket pair-tree serialises log₂N levels in ONE thread (~100 ms on profile E).
   So this is a candidate fix for the profile-E problem, not only a small-MSM path.

**Key insight: in *this* branch the high-mem path shares ~70% of the machinery
already present** — SRS pool, decompose/transpose preprocess, `csr_to_v2`
convert (LIVE, `msm_v2.ts:2484/2488`), the **Jacobian reduce (DONE in Thread 1)**,
and the arena. The genuinely-new part is the ping-pong bucket-sum stage that
*replaces walker+combine+pairtree* (NOT the reduce).

## What's already wired vs what must be ported

Present in `msm_v2.ts` (pre-wired skeleton):
- `bufA`/`bufB` standalone buffers, **stubbed to 4 B** (`:1036-1037`), sized off
  `M1 = batchWindows*wstride1+3` when revived; pad-trio bookkeeping at `:1338`.
- Field skeleton: `fusedPipe`/`carryPipe`/`finalizePipe`(+L0) (`:1664-1669`),
  `prefScratchBuf`, `fusedTile`, `fusedTiles` bind type, plan-ring + counts/
  offsets fields in `SharedScratch`. **`fusedPipe` etc. are declared-but-never-
  assigned dead fields** (no compile, no dispatch — verified).
- `csr_to_v2_active_sums`/`csr_to_v2_meta` — LIVE and shared with the walker path.

Must be ported from `wt/structure` (7 kernels + gen + WGSL):
`ba_fused_super_bench`, `ba_fused_tail_coop`, `ba_carry_copy_bench`,
`ba_finalize_copy_bench`, `ba_finalize_accumulate_bench`,
`ba_planner_v2_offsets`, `ba_planner_v2_emit`.
- **One-program blockers (bake geometry → need size-independence):**
  `ba_planner_v2_offsets` + `ba_planner_v2_emit` bake `BW=2^(c-1)`,
  `num_windows`, `per_thread` into the WGSL string
  (`wt/structure shader_manager.ts:624-631/669-677`); the transpose trio bakes
  `tile=min(BW,8192)` / `workgroup_size=numWindows`. Move these to uniforms (same
  pattern as Thread-1 / the PIPELINE_GEOMETRY work). The fused/carry/finalize
  kernels take only fixed knobs (WGI/S/kind/variant) and port clean.
- Revive `bufA`/`bufB` to real `soaSize(M1)` + the plan rings
  (`pairBlockPlanRing`/`scatterPlanRing`/`carryPlanRing`) + `countsBufs`/
  `offsetsBufs`/`prefScratchBuf` to real sizes. **Keep them standalone (NOT
  arena-carved)** — the 6-colour arena count is Dawn-correctness-critical; bufA/bufB
  are already standalone, so reviving them doesn't perturb the carve.

## (a) vs (b) — why (b)

| | (a) dual-backend factory | (b) mode inside msm_v2 |
|---|---|---|
| union/bridge/oracle | **must invent a backend interface** + edit ~7 concrete `MsmV2.create`/`MsmV2Pool.create` sites in `bridge/main.ts` (`266,299,309,321,398,927`) + `union_runner.ts` + `index.ts` — all the *newest, most fragile* code | **untouched** — they already call `MsmV2` generically; a mode is invisible |
| shared machinery | **duplicated** — a 2nd class re-does arena + reduce_sched + one-program + preprocess (a Thread-1-scale re-port of 2883 LOC) | **reused** — pool/preprocess/convert/Jacobian-reduce/arena all shared |
| pre-wiring | none | bufA/bufB + plan-ring/counts/offsets/fused-pipe field skeleton already present |
| source isolation | high-mem `run()` is self-contained (easy to lift) | …same isolation makes the *algorithm* easy to lift into a mode |

The target's union/bridge is **hard-bound to the concrete `MsmV2` class with no
backend abstraction** — that is the decisive factor. (a) pays its whole cost up
front to build that abstraction; (b) avoids it entirely and reuses the Jacobian
reduce Thread 1 just landed. The source's clean `prepare/run/encodeIntoBatch`
isolation is a red herring for the *factory* — it instead makes the ping-pong
algorithm easy to **lift into** the (b) mode.

## Step plan for (b)

1. **Port the 7 WGSL kernels** into `wgsl/cuzk/`, make `planner_v2_offsets/emit`
   (and the transpose trio, if msm_v2's existing transpose can't be reused as-is)
   size-independent (geometry → uniforms). Add 7 `gen_*` to `cuzk/shader_manager.ts`.
   Regenerate `_generated/shaders.ts`.
2. **Revive the buffer skeleton**: bufA/bufB → `soaSize(M1)`; plan rings +
   counts/offsets/prefScratch to real sizes (standalone). Un-stub the `if (!bufA
   || dims.M1 > cur.M1)` block (`:1028`).
3. **Compile + bind** the 7 pipelines (fused/carry/finalize ×{L0,normal},
   planner ×2) in `create()`; build their bind groups in `prepare()`.
4. **Graft the ping-pong dispatch loop** as an *alternate bucket-sum stage* in
   `encodeIntoBatch` — replacing [planner → walker → combine → pair-tree]
   (`:4084-4216`) with [convert → planner_v2 → ping-pong levels →
   finalize_accumulate] for small N. The existing **Jacobian reduce stays**.
   Gate on a small-N threshold (new config, e.g. `pingpongBelow`; device-tunable).
5. **Validate**: byte-identical logN 10/14/(17) with the mode forced on; **profile
   E is the headline** (the multi-dispatch tree must beat the serial pair-tree);
   one-program compile count; budget ≤ 160 MB; default path unchanged.

## Open questions / risks
- **Small-N gate**: where does ping-pong actually beat the walker? Device-specific
  — needs a sweep, default off until characterised.
- **Transpose reuse**: confirm msm_v2's LIVE transpose feeds `active_sums` the way
  high-mem expects, or port high-mem's transpose variant (extra size-independence).
- **Memory**: the 2nd ping-pong plane + plan rings is the "high-memory" cost
  (~2–3× a single-buffer reduce) — fine because it's gated to small N, but verify
  the budget gate (`chooseBudgetMpw`) accounts for revived bufA/bufB.
- **Scope**: this is the largest of the three threads (~7 kernels + buffer revival
  + dispatch loop). Consider landing it in sub-steps (kernels+revival first behind
  a forced flag, then the gate + profile-E tuning).
