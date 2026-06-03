# Multi-MSM batched evaluation — HANDOFF (START HERE)

Entry point for the next session. `MULTI_MSM_PLAN.md` is the full design spec;
this doc is the **current state + the exact next-step recipe + traps**. Branch:
`msm-arena-rewrite`.

## TL;DR

- **Step 1 DONE** (host scheduler + bin-packer + batch-of-1 check).
- **Step 2 + step 4 DONE for HOMOGENEOUS packs** — committed `b8fdde2103`.
  K MSMs of the **same n/c** run as ONE dispatch over the concatenated union
  (one `MsmV2.prepareBatch`, `numWindows = Σ NW`). Validated batch-of-K ≡
  K-separate byte-identical for K=1..4, c=8 and c=13, profiles A/C/D/E, ≤128
  windows; single-MSM golden + `?varsched` unchanged. See "What step 2+4 landed".
- **Next: HETEROGENEOUS packs** (different n and/or c) + the bridge wiring +
  the perf bench. See "Remaining work". The homogeneous path is the plan's named
  "easy win" and the production path after size-class grouping; heterogeneous
  adds per-window n / BW / srsOffset.
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

## What step 2+4 landed (homogeneous union) — commit `b8fdde2103`

The big realisation: for a **homogeneous** pack (same n/c) the super-MSM is just a
single `MsmV2` with `numWindows = Σ NW`, concatenated scalars, where the only
per-MSM fact is each window's **scalarBase**. Everything downstream of `decompose`
already indexes the global bucket space (`bTotal`/`redM`) — the split-c work made
the whole pipeline per-window-table-driven — so the planner radix/partition,
walker, combine, pair-tree and reduce **pool all members' buckets into one
balanced dispatch with no body change**. The bid bit layout `(window<<15)|mag`
never changed; the window field is the GLOBAL window (classify ran over the
concatenated columns) and `batch_offset.x = 0`.

What actually changed:
- **`decompose`** reads per-window `scalar_base` (u32 words) from `WindowDesc[+6]`;
  lookback gates on `bit_base>0` (the MSM-local bottom window) — byte-identical for
  a single MSM. (The other point stages need no change: scatter layout is
  `global_window*n + point`, uniform because n is the same per member.)
- **`M_RED` → runtime uniform** in the 5 writers (`stream_walker`, `size1`,
  `combine_filter`, `combine_batched`, `pt_finalize`) via the spare **`.z`** of the
  `batch_offset`/`params` uniform each already binds (`.z` was provably unread).
  `ba_reduce_level_bench` already took its `M` from `cparams.x` — only 5 shaders,
  not 6. No new binding; single-MSM sets `.z = redM` (byte-identical).
- **`batch_scheduler.planBatch`**: `windowDescTable` now carries GLOBAL
  `work_off`/`reduce_off` prefixes + `scalarBase` at +6; `bit_base` stays MSM-local.
- **`MsmV2.prepareBatch(members, scalars, windowDescTable, reduceOffsets)`** drives
  `prepare()` via a `batchCtx` that overrides `numWindows`/`bTotal`/`redM`/
  **`numRadixTiles`** (the create-time-from-bTotal trap — the radix sort tiles the
  WHOLE concatenated space), does per-member host init-counts, uploads the global
  table, forces `numBatches=1` / no region-split / no fast-path. Every consumer is
  `batchCtx`-guarded ⇒ single-MSM path is byte-identical by construction.
- **`runBatchCheck`** drives the real one-dispatch union (replacing the K-instance
  construct that tripped Dawn's submit-while-destroyed), asserting each member's
  per-window sums are byte-identical union vs solo.

Validated: K=1..4, c=8 & c=13, profiles A/C/D/E, up to 128 windows; golden 14–17 +
`?varsched` unchanged; `batch_scheduler.test.ts` 22/22.

## Remaining work (next session)

1. **HETEROGENEOUS packs (the big one).** Different n and/or c in one pack:
   - **Per-window n**: `decompose` `input_size` + `transpose` `row_stride` (and the
     scatter layout `window*n+point`) assume a single n. Either pad every member to
     the size-class max n (keeps the layout uniform — simplest, the plan's "group by
     size class") or go truly ragged via the `pointTiles` work-list + a per-window
     point-region base in `WindowDesc`.
   - **Per-window BW** for the `partial_*` sparse hash (`window*BW + mag`): the
     combine kernels bake one `BW`. Different-c members need per-window BW (or a
     `BW_max` envelope).
   - **srsOffset** per window for the point gather: `stream_walker`/`size1` read
     `point_x[pt]` by absolute index. Homogeneous used the shared SRS prefix
     (srsOffset 0); a real pack folds each member's `srsOffset` into the point index
     (at scatter, or add at load via a per-window `WindowDesc` field).
2. **>128-window packs.** The at-cap consumers' `window_desc` is a
   `var<uniform> array<vec4,256>` = **128 rows** (`prepareBatch` asserts this). Many
   tiny MSMs (small c ⇒ large NW) overflow it. Options: widen the uniform (storage-
   binding budget), second-level batching, or cap K in the packer.
3. **Bridge wiring + budget gate**: `runBatchMsm` calls `packByBudget` to choose K,
   then drives the union from ChonkApi's real MSM mix; bench the 505-MSM dump E2E.
4. **PERF bench (the acceptance criterion).** This session validated CORRECTNESS,
   not the saturation win. Bench a homogeneous small-MSM pack vs K-separate on
   M2/phone and confirm the solo-starved stages now saturate — and that profiles
   D/E (hard rule #0) stay fast under packing.

### Validation discipline (the bisection lever)

- Single-MSM byte-identical after any shared-path change: golden 14–17
  (`msm-arena-validate.sh`) **and `?varsched=1`** (uniform-only golden does not
  exercise per-window geometry).
- Multi-MSM: `msm-batch-check?logns=a,a,...` (repeated logN — homogeneous) asserts
  batch-of-K ≡ K-separate per member. Add `&scalar_dist=profile&profile=E` for the
  giant-bucket path. (Heterogeneous logns currently returns "needs homogeneous n".)

## Environment & commands

- **vite** (serves this worktree; HMR picks up `.ts`, NOT `.wgsl`):
  `cd barretenberg/ts && yarn dev:msm-webgpu --host 127.0.0.1 --port 5210 --strictPort --no-open`
- **WGSL regen** (after editing any `*.template.wgsl`, BEFORE benching):
  `node src/msm_webgpu/scripts/inline-wgsl.mjs`
- **golden**: `bash /Users/zac/localclaudebox/msm-arena-validate.sh 5210`
- **batch-of-K union check** (the real one-dispatch path via `prepareBatch`):
  `node dev/msm-webgpu/drive-persist.mjs "http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1&autorun=msm-batch-check&logns=16,16"`
  (`logns` = repeated logN for a homogeneous K-pack; add `&scalar_dist=profile&profile=E`)
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

- `batch_scheduler.ts` / `.test.ts` — host scheduler (global table + scalarBase).
- `msm_v2.ts` — `MsmV2`/`MsmV2Pool`: `BatchMember`/`BatchPrepCtx` interfaces +
  `batchCtx` field (the union switch), **`prepareBatch()`** (just before
  `prepare()`), the 6 `if (this.batchCtx)` injection points in `prepare()`
  (scalars view, geometry+`numRadixTiles` override / skip split-c, per-member
  init-counts, force `numBatches=1`, skip fast-path, WindowDesc from layout).
- `dev/msm-webgpu/main.ts` — `runBatchCheck` (union via `prepareBatch`) +
  `msm-batch-check` autorun; `generateInputs` (profiles A–E), `?varsched=1`.
- `MULTI_MSM_PLAN.md` — full design. `ARENA_LAYOUT.md` — arenas/budget; §7 = the
  `M_RED`/batch-local-`redBuf` reduce restructure (route (a) `batch_offset.y`).
- Memory: `msm-webgpu-bid-lifecycle` (bid producers/consumers + the sort trap),
  `msm-webgpu-arena-refactor`.

## Optional, low priority — task 8b

Dedup: rewire `create()`/`prepare()` to call `computeGeom` / `buildUniformWindowDesc`
so there is one geometry source of truth. Guarded by `batch_scheduler.test.ts`;
touches the hot path → re-validate golden after.
