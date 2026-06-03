# Multi-MSM batched evaluation — HANDOFF (START HERE)

Entry point for the next session. `MULTI_MSM_PLAN.md` is the full design spec;
this doc is the **current state + the exact next-step recipe + traps**. Branch:
`msm-arena-rewrite`.

## TL;DR

- **Step 1 DONE** (host scheduler + bin-packer + batch-of-1 check).
- **Step 2 + step 4 DONE for HOMOGENEOUS packs** — `b8fdde2103`. K MSMs of the
  **same n/c** run as ONE dispatch over the concatenated union (one
  `MsmV2.prepareBatch`, `numWindows = Σ NW`). Batch-of-K ≡ K-separate byte-
  identical (K=1..4, c=8/13, profiles A/C/D/E); single-MSM golden + `?varsched`
  unchanged. Perf: ~1.7–3.4× union vs K-separate (bigger for smaller/structured).
- **Budget enforced + windowDesc accounted** — `7b1492ab64`. The union runs the
  same `estimateMem` 160MB gate and throws if a pack overflows (instead of OOM).
- **128-window cap REMOVED** — `59cfc48c27` (walker) + `979e039299` (rest). It was
  a binding-count artifact, not memory: `window_desc` is now a storage `array<u32>`
  in every consumer. The 3 at-cap kernels (walker, combine_filter, combine_batched)
  bind their colour-arena **monolith** once (A0 / A2 sub-ranges addressed by offset)
  to free the slot. Validated: a 256-window pack (impossible before) is byte-
  identical; a 330MiB pack is rejected by the budget gate. The real limit is now
  the 160MB budget, not a window count.
- **Next: HETEROGENEOUS packs** (different n and/or c in one union) — the recipe is
  in "Remaining work". Reduce optimisation is owned elsewhere — don't touch it here.

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

1. **HETEROGENEOUS packs — different n and/or c in one union (the big one).**
   KEY INSIGHT: split-c already made the *geometry* per-window (c, stride, BW=
   num_columns, work_off, reduce_off all come from the WindowDesc table), so the
   planner/walker/combine/reduce already handle different-c windows. Heterogeneous
   reduces to the **point-write stages** + sizing:
   - **Per-window n + scatter base.** `decompose`/`transpose_count`/
     `transpose_scatter`/`csr_to_v2_active_sums` use `input_size = n` (uniform) and
     the layout `bucket_and_sign[window*n + p]`. Add a small **`point_offsets`**
     buffer = the scatter-base prefix, length `Σ NW + 1` (window w's region starts
     at `point_offsets[w]`; `n_w = point_offsets[w+1] - point_offsets[w]`). These
     kernels are NOT at the binding cap, so just add the binding. **Byte-identical
     at homogeneous** (`point_offsets[w] = w*n` ⇒ same layout, n_w = n) — that's the
     validation lever. Build it in `planBatch` (and the single-MSM `prepare` fill,
     = `w*n` prefix). Replace `window*n+p` with `point_offsets[w]+p` and `input_size`
     with `n_w`.
   - **Dispatch grids over max_n** (padded; per-window early-out `p >= n_w`).
     `nXposePts = ceil(max_n/WGI)`, transpose tiles cover max_n, each window clamps
     to its n_w (already clamps to input_size). Byte-identical at homogeneous.
   - **Sizing.** When c differs, `bTotal`/`redM` are `Σ` per member (not
     `numWindows·BW`); the combine `partial_*` hash uses the **envelope BW = max BW**
     across the pack (the split-c convention). `prepareBatch` builds these from the
     layout; relax its `m.n === this.n` assertion to per-member geometry.
   - **srsOffset = 0** for shared-SRS commitment MSMs (every member uses the SRS
     prefix `[0,n_k)`), so NO srsOffset field is needed for the common case. Only
     sub-MSMs with a nonzero start_index need it — fold at scatter (write the global
     point index into val_idx); defer until a real case appears.
   - Validate: golden byte-identical after each kernel (homogeneous), then a true
     different-n / different-c union vs K-separate. The harness needs a path that
     packs members of different n (extend `runBatchCheck` past the `every(n===n0)`
     guard once the kernels are converted).
2. **Bridge wiring + budget gate**: `runBatchMsm` calls `packByBudget` (now budget-
   accurate) to choose K, drives the union from ChonkApi's real MSM mix; bench the
   505-MSM dump E2E.
3. **PERF bench on phone/M2** (the acceptance criterion at scale): confirm the
   solo-starved stages saturate under packing and profiles D/E stay fast (hard
   rule #0). This session measured ~1.7–3.4× on M2 single-run; the rigorous bench
   is still open.

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
