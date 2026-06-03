# Multi-MSM batched evaluation — HANDOFF (START HERE)

Entry point for the next session. `MULTI_MSM_PLAN.md` is the full design spec;
this doc is the **current state + the exact next-step recipe + traps**. Branch:
`msm-arena-rewrite`.

## TL;DR

- **Step 1 is DONE, committed, validated**: host batch scheduler + budget
  bin-packer + a runtime batch-of-1 byte-identical check.
- **Next: step 2 + step 4, COUPLED** (global-window bid + the one-dispatch-over-
  the-union concatenated dispatch). Do **not** do step 2 alone — see "Why coupled".
  This is the bulk of the work and the highest risk; start it fresh.
- Reduce optimisation is **owned by other agents/worktrees** — do not touch it here.

## What's done (commits since the plan doc `250f48e02e`)

- **`6496810343`** — `batch_scheduler.ts` (pure host) + `batch_scheduler.test.ts`
  (22 tests). `msm_v2.ts`: `export`-only for `arenaColourSizes`/`pickReduceWg`.
- **`d0125e504c`** — runtime batch-of-1 check (`dev/msm-webgpu/main.ts`,
  `?autorun=msm-batch-check`).
- Golden logN 14–17 byte-identical + oracle-agree throughout (the `export`-only
  edits are runtime-inert).

## The scheduler API (host model — the input to step 4)

`batch_scheduler.ts`, all pure / unit-tested:

- `computeGeom(n, cfg?)` → per-MSM geometry (matches `msm_v2` create()).
- `buildUniformWindowDesc(geom)` → the 8-u32 WindowDesc rows (matches prepare()).
- `planBatch(inputs, opts?)` → **`BatchLayout`**: `descs[]` with
  `scalarBase`/`outBase`/`schedOff`/`redBase` per MSM; `windowDescTable`
  (concatenated rows); `windows[]` (each global window tagged
  `msmIdx`/`srsOffset`/`n`/`scalarBase`); `reduceOffsets` (MSM-local — add
  `desc.redBase` for the global slot); `pointTiles` (ragged); `totalRedM`,
  `totalScalarBytes`, `totalWindowSumBytes`, `footprintBytes`.
- `batchFootprintBytes(geoms, {sT,sS,srsBytes})` — pack footprint via the one
  `arenaColourSizes` source of truth with per-MSM terms summed; `sT`/`sS`/SRS once.
- `packByBudget(candidates, {budgetBytes,srsBytes})` — greedy; too-big stages solo.

**At K=1 every base is 0 and the table == the single-MSM table** (proven byte-exact
in the test). This is the invariant step 4 preserves.

## THE NEXT TASK: step 2 + step 4 (coupled)

### Why coupled (do NOT land step 2 alone)

Split-c Phase 0 **already** made the bid's window field a *global-within-MSM*
index via the `batch_window_base.x` uniform (`gwin = batch-local window +
batch_window_base.x`), and the 17-bit window field already holds any realistic
pack's window space. Therefore:

- The bid **bit layout `(window<<15)|mag` does not change**.
- What "goes global" for a pack is (a) the **value** fed via `batch_window_base.x`
  — add each MSM's `schedOff` — and (b) **sizing** the window-indexed scratch and
  `M_RED` for the concatenated space.
- Both are **no-ops at K=1** (schedOff=0, pack size == single → golden stays
  byte-identical) **and unobservable until a concatenated K>1 dispatch exists**.
  A half-flipped encoding "silently computes the wrong MSM" (memory note
  `msm-webgpu-bid-lifecycle`) and is only catchable at K>1. ⇒ the bid/scratch/
  `M_RED` change must land **with** step 4's one-dispatch path and be validated by
  batch-of-K through that dispatch.

### The real multi-MSM shape — ONE dispatch, not K instances

Step 4 runs **one set of kernels over the concatenated union** (each workgroup/
window resolves its MSM from the per-global-window table), **not K `MsmV2`
instances**. (The step-1 runtime harness tried K instances on one shared pool to
cross-check and hit an `MsmV2` instance-coexistence limit — "buffer used in submit
while destroyed". That is a *validation construct*, not the design; the single-
dispatch path sidesteps it. Don't pursue multi-instance.)

### Concrete change list

1. **Dispatch span.** One dispatch over `Σ NW` windows / the `pointTiles` work-list.
   Model it on split-c's 2-D dispatch (window = `gid.y`, the kernel reads the
   per-window table), which `classify`/`csr_to_v2_meta` already do. Set
   `batch_window_base.x = schedOff_k` for window `k`'s MSM (derive per-window from
   the table, not a single uniform).
2. **Sizing.**
   - `red_buf` → `Σ redM_k`. **`M_RED` is a compile-time constant baked into 6
     shaders** (`ba_stream_walker`, `ba_size1`, `ba_walker_combine_filter`,
     `ba_walker_combine_batched`, `ba_walker_pt_finalize`, `ba_reduce_level_bench`).
     ARENA_LAYOUT §7 route (a): pass it as a runtime uniform via the spare
     `batch_offset.y` those shaders already carry — **no new binding**.
   - `partial_*` sparse hash (`window*BW_max + mag`) → sized for `Σ NW` windows.
   - scalars / scatter / l0 / csr → concatenated (planBatch gives the offsets).
3. **Bid producers/consumers to flip in ONE coordinated step** (memory note
   `msm-webgpu-bid-lifecycle` — re-read it):
   - **red_slot decode**: `ba_stream_walker`, `ba_size1`, `ba_walker_combine_filter`,
     `ba_walker_combine_batched`, `ba_walker_pt_finalize`.
   - **flat re-index** of `offsets[]`/`partial_count[]`/`partial_offset[]`/
     `partial_write_pos[]`: `ba_stream_walker`, `ba_walker_combine_count`,
     `ba_walker_combine_scatter`, `ba_walker_combine_filter`,
     `ba_walker_combine_batched`, **`ba_walker_combine_sort_count`**,
     **`ba_walker_combine_sort_scatter`**, `ba_walker_pt_init_scan`,
     `ba_walker_pt_init_copy`.
   - **opaque payload (NO change)**: radix sort (`ba_planner_radix_*`),
     `ba_unified_combine`, `ba_walker_combine_scan`.
   - **THE TRAP**: `sort_count`/`sort_scatter` read `partial_count[bid]` and are
     easy to miss (they "sort", bid is payload). **Re-grep all of `partial_count[`
     `partial_offset[` `partial_write_pos[` `offsets[` for un-decoded bid indices
     before validating.**
4. **Point gather.** Each global window → `(msm_idx, srsOffset)` for the shared SRS
   pool. `planBatch.windows[w].srsOffset` carries it.

### Validation discipline (the bisection lever)

- After **each** adapted stage: batch-of-1 byte-identical — golden 14–17
  (`msm-arena-validate.sh`) **and `?varsched=1`** (THE variable-geometry regression
  test; uniform-only golden does not exercise per-window geometry).
- Then **batch-of-K via the concatenated dispatch == K-separate** + WASM-oracle per
  member. Extend the `msm-batch-check` harness to drive the *one-dispatch* path
  (not K instances).

## Environment & commands

- **vite** (serves this worktree; HMR picks up `.ts`, NOT `.wgsl`):
  `cd barretenberg/ts && yarn dev:msm-webgpu --host 127.0.0.1 --port 5210 --strictPort --no-open`
- **WGSL regen** (after editing any `*.template.wgsl`, BEFORE benching):
  `node src/msm_webgpu/scripts/inline-wgsl.mjs`
- **golden**: `bash /Users/zac/localclaudebox/msm-arena-validate.sh 5210`
- **batch-of-1 runtime check**:
  `node dev/msm-webgpu/drive-persist.mjs "http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1&autorun=msm-batch-check"`
  (`?logns=a,b,...` runs the K>1 construct — currently surfaces the multi-instance limit)
- **unit tests**: `yarn test src/msm_webgpu/batch_scheduler.test.ts`
  (`msm_v2.ts` imports cleanly under jest — probe-verified — so test imports from it are fine)
- **bench via `drive-persist.mjs`** (warm SRS in the persistent profile), never
  `drive-index.mjs` (cold SRS pollutes timing).

## Traps (hard-won)

- **WGSL is inlined at build.** Edit `.template.wgsl` → run `inline-wgsl.mjs` →
  then bench. Skipping regen silently runs the stale shader.
- **A half-flipped bid is a deterministic WRONG answer.** Flip the producer and
  every consumer (list above) in one commit.
- **`ba_stream_walker` is at the M2 10-storage-binding cap** → any new table access
  there must be `var<uniform>`.
- **`prepare()` identity-caches on `scalarsBuf` *reference*** (msm_v2 ~2300) and
  skips the epoch check; `create()` runs a warm-up prepare+run; the slow path
  destroys `prepBuffers` (incl. `redStaging`). These make multi-instance-on-one-
  pool fragile — **moot for step 4** (one dispatch, no multiple instances).

## Key files / anchors

- `batch_scheduler.ts` / `.test.ts` — host scheduler (DONE).
- `msm_v2.ts` — `MsmV2`/`MsmV2Pool`: `arenaColourSizes` ~72, `prepare()` ~2297,
  WindowDesc build ~2712, budget gate `estimateMem` ~2469, `encodeIntoBatch` ~3202,
  `decodeWindowSumsFromBytes` ~3505, `run()` ~3606.
- `dev/msm-webgpu/main.ts` — harness: `runBatchCheck` + `msm-batch-check` autorun;
  `generateInputs` (profiles A–E, wire dumps), `?varsched=1`.
- `MULTI_MSM_PLAN.md` — full design. `ARENA_LAYOUT.md` — arenas/budget; §7 = the
  `M_RED`/batch-local-`redBuf` reduce restructure (route (a) `batch_offset.y`).
- Memory: `msm-webgpu-bid-lifecycle` (bid producers/consumers + the sort trap),
  `msm-webgpu-arena-refactor`.

## Optional, low priority — task 8b

Dedup: rewire `create()`/`prepare()` to call `computeGeom` / `buildUniformWindowDesc`
so there is one geometry source of truth. Guarded by `batch_scheduler.test.ts`;
touches the hot path → re-validate golden after.
