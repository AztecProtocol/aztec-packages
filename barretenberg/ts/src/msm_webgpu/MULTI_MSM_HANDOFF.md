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
- **FULL HETEROGENEOUS DONE — arbitrary n AND c in one union, no padding**
  (`fdc602c1ae` per-window-n + `5946df0cd0` different-c). A `point_offsets` table
  gives each global window its own scatter base + n_w (decompose/transpose/convMeta
  read it); the instance is created at the pack's max n so its baked BW/stride/c are
  the envelope maxima; `windowCs` comes from the table (per-window c); `bTotal` is
  the envelope (numWindows·max-BW), `redM` the tight Σ stride_w. Byte-identical at
  homogeneous (`point_offsets[w]=w·n`), so golden + `?varsched` stayed byte-identical
  through every kernel. Validated union≡solo: different n (logN16+17), different c
  (14+16, 14+17), THREE different c (14+15+16), all + profile E (hard rule #0).
- Reduce optimisation is owned elsewhere — don't touch it here.

## What's done (commits since the plan doc `250f48e02e`)

Step 1 (host scheduler):
- **`6496810343`** — `batch_scheduler.ts` + `.test.ts` (22 tests).
- **`d0125e504c`** — runtime batch-of-1 check (`?autorun=msm-batch-check`).

Steps 2+4 + cap + heterogeneous (this session, newest last):
- **`b8fdde2103`** — homogeneous union (scalarBase, M_RED→`.z`, global table,
  `prepareBatch`/`batchCtx`).
- **`7b1492ab64`** — union budget gate + `windowDesc` accounted.
- **`59cfc48c27`** + **`979e039299`** — 128-window cap removed (`window_desc` →
  storage; at-cap kernels bind the A0/A2 arena monolith).
- **`373cfd8d30`** — heterogeneous-n via padding (superseded by ↓).
- **`fdc602c1ae`** — per-window-n (no padding): `point_offsets` through
  decompose/transpose/convMeta.
- **`5946df0cd0`** — different-c: envelope sizing, `windowCs` from table, tight `redM`.

Golden logN 14–17 + `?varsched` byte-identical + oracle-agree throughout (the
byte-identical-at-homogeneous invariant was validated after every kernel).

## The scheduler API (host model — the input to step 4)

`batch_scheduler.ts`, all pure / unit-tested:

- `computeGeom(n, cfg?)` → per-MSM geometry (matches `msm_v2` create()).
- `buildUniformWindowDesc(geom)` → the 8-u32 WindowDesc rows (matches prepare()).
- `planBatch(inputs, opts?)` → **`BatchLayout`**: `descs[]` with
  `scalarBase`/`outBase`/`schedOff`/`redBase` per MSM; `windowDescTable`
  (concatenated rows, GLOBAL `work_off`/`reduce_off` + `scalarBase` at +6,
  MSM-local `bit_base`); `windows[]`; `reduceOffsets` (GLOBAL — already includes
  each MSM's `redBase`); `totalRedM`, `totalScalarBytes`, `footprintBytes`.
  `buildUniformWindowDesc(geom, bases?)` takes optional `{workOffBase, redBase,
  scalarBaseWords}` (default 0 ⇒ standalone single-MSM table).
- `batchFootprintBytes(geoms, {sT,sS,srsBytes})` — pack footprint via the one
  `arenaColourSizes` source of truth with per-MSM terms summed; `sT`/`sS`/SRS once.
- `packByBudget(candidates, {budgetBytes,srsBytes})` — greedy; too-big stages solo.

**At K=1 every base is 0 and the table == the single-MSM table** (proven byte-exact
in the test). This is the invariant step 4 preserves.

## What step 2+4 landed (homogeneous union) — commit `b8fdde2103`

> This section is the FIRST landing (homogeneous). It was later extended by the cap
> removal (`window_desc` → storage) and full heterogeneity (`point_offsets` +
> envelope sizing) — see the TL;DR. Two claims below are superseded and flagged.

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
  a single MSM. (~~The other point stages need no change~~ — SUPERSEDED: they now
  read a per-window `point_offsets` table for the scatter base + n_w, which is what
  lets members of different n/c pack with no padding. See the TL;DR.)
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

Validated (at that commit): K=1..4, c=8 & c=13, profiles A/C/D/E; golden 14–17 +
`?varsched` unchanged; `batch_scheduler.test.ts` 22/22. (The ~~128-window~~ limit
that applied here was removed later — `window_desc` is storage now.)

## Remaining work (next session)

The union pipeline is now feature-complete for correctness (homogeneous → full
heterogeneous, n and c). What's left is wiring it into production + perf + a couple
of efficiency refinements:

1. **Bridge wiring + budget gate**: `runBatchMsm` calls `packByBudget` to choose K,
   drives the union from ChonkApi's real MSM mix; bench the 505-MSM dump E2E. NOTE:
   `packByBudget`/`batchFootprintBytes` (host) and the runtime `estimateMem` (prepare)
   don't fully agree for heterogeneous packs — the host under-counts the l0/partials
   matrix (it's dispatch-sized from the class max n, not Σ n_w) while the runtime
   counts it. Reconcile them so the packer's choice always passes the runtime gate.
2. **PERF bench on phone/M2** (the acceptance criterion at scale): confirm the
   solo-starved stages saturate under packing and profiles D/E stay fast (hard
   rule #0). This session measured ~1.7–3.4× on M2 single-run; the rigorous bench
   is still open.
3. **Efficiency refinements (optional):**
   - The combine `partial_*` sparse hash uses the **envelope BW = max BW** across the
     pack, so a skewed pack (one big-c member + many small-c) over-allocates that
     hash + the CSR buffers. A per-window-BW (work_off-based) partial hash would
     tighten it — but it touches the combine `flat_bid` and the count/scatter/sort.
   - **srsOffset** is assumed 0 (every member uses the SRS prefix `[0,n_k)`), true
     for commitment MSMs. A sub-MSM with a nonzero start_index needs it folded into
     the point index at scatter (write the global index into val_idx); defer until
     a real case appears.

### Validation discipline (the bisection lever)

- Single-MSM byte-identical after any shared-path change: golden 14–17
  (`msm-arena-validate.sh`) **and `?varsched=1`** (uniform-only golden does not
  exercise per-window geometry).
- Multi-MSM: `msm-batch-check?logns=a,b,...` asserts batch-of-K ≡ K-separate per
  member (each member's per-window sums byte-identical union-vs-solo; the solo runs
  are golden/oracle-validated, so this is transitively oracle-agree). `logns` may
  mix sizes freely: repeated (`16,16` homogeneous), same-c different-n (`16,17`),
  different-c (`14,16`, `14,17`), or three c's (`14,15,16`). Add
  `&scalar_dist=profile&profile=E` for the giant-bucket path (hard rule #0). The
  harness also asserts the members have **distinct scalars** so `scalarBase`/
  `point_offsets` aren't validated vacuously. A pack over 160MB is rejected by the
  runtime budget gate ("exceeds the …MiB budget").

## Environment & commands

- **vite** (serves this worktree; HMR picks up `.ts`, NOT `.wgsl`):
  `cd barretenberg/ts && yarn dev:msm-webgpu --host 127.0.0.1 --port 5210 --strictPort --no-open`
- **WGSL regen** (after editing any `*.template.wgsl`, BEFORE benching):
  `node src/msm_webgpu/scripts/inline-wgsl.mjs`
- **golden**: `bash /Users/zac/localclaudebox/msm-arena-validate.sh 5210`
- **batch-of-K union check** (the real one-dispatch path via `prepareBatch`):
  `node dev/msm-webgpu/drive-persist.mjs "http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1&autorun=msm-batch-check&logns=16,16"`
  (`logns` is any comma-list — `16,16` homogeneous, `16,17` same-c diff-n, `14,16`
  diff-c, `14,15,16` three c's; add `&scalar_dist=profile&profile=E` for giant buckets)
- **unit tests**: `yarn test src/msm_webgpu/batch_scheduler.test.ts`
  (`msm_v2.ts` imports cleanly under jest — probe-verified — so test imports from it are fine)
- **bench via `drive-persist.mjs`** (warm SRS in the persistent profile), never
  `drive-index.mjs` (cold SRS pollutes timing).

## Traps (hard-won)

- **WGSL is inlined at build.** Edit `.template.wgsl` → run `inline-wgsl.mjs` →
  then bench. Skipping regen silently runs the stale shader. (Every commit this
  session regenerated `wgsl/_generated/shaders.ts` before validating.)
- **The 10-storage-buffer cap is real, but `window_desc` is no longer uniform.**
  The walker / combine_filter / combine_batched sat at 10; they now bind their
  colour-arena **monolith** once (A0 holds sorted_count_list+l0_index for the
  walker; A2 holds partial_count+partial_layout for the combines — addressed via an
  `arena_off` uniform), freeing the slot so `window_desc` is `var<storage,read>
  array<u32>` (full stride-8 rows, work_off=+3 / reduce_off=+4). A *new* storage
  binding in an at-cap kernel needs the same monolith trick (and a guard that the
  buffers actually share that arena colour — `offsets`/`partial_offset` are
  standalone/A5, not A0/A2). `slotBuf`/`slotOff` give the arena handle + element
  offset.
- **Byte-identical-at-homogeneous is the bisection lever.** Every shared-path change
  (M_RED uniform, scalarBase, point_offsets, the arena rebinds) was built to be
  byte-identical when the pack is one MSM (`point_offsets[w]=w·n`, `scalarBase=0`,
  `.z=redM`), so golden 14–17 + `?varsched` catch a mistake on the FIRST kernel,
  long before any K>1 run. Keep this property when extending.
- **`prepare()` identity-caches on `scalarsBuf` *reference*** (msm_v2 ~2300);
  `prepareBatch()` sets `this.preparedFor = null` to force the slow rebuild.

## Key files / anchors

- `batch_scheduler.ts` / `.test.ts` — host scheduler (global table + scalarBase).
- `msm_v2.ts` — `MsmV2`/`MsmV2Pool`. The union is driven entirely by the
  **`batchCtx`** field (`BatchPrepCtx` = numWindows/bTotal/redM/windowDescTable/
  reduceOffsets/`pointOffsets`/`totalPoints`/members); **`prepareBatch(members,
  scalars, windowDescTable, reduceOffsets)`** sets it (builds `point_offsets` from
  member n, `redM` = tight Σ stride_w, asserts c≤this.c & n≤this.n) and calls
  `prepare()`. Every `if (this.batchCtx)` branch in `prepare()` is the union path
  (grep it): scalars view, geometry override (numWindows/bTotal=envelope/redM/
  `windowCs` from table/`numRadixTiles`), per-member init-counts, `batchSlots`=
  `totalPoints`, force `numBatches=1`/no split/no fast-path, WindowDesc + the
  `point_offsets` buffer (also bound by decompose/transpose/convMeta), `estimateMem`
  union terms + the budget throw. Single-MSM (batchCtx=null) is unchanged.
- WGSL: `point_offsets` is read by `decompose_scalars_booth`, `transpose_count_tiled`,
  `transpose_scatter_tiled` (the `params[1]==0` sentinel = "use point_offsets"; the
  split-c upper region passes n_large), `csr_to_v2_meta`. `window_desc` is storage in
  all consumers; the at-cap kernels bind the arena monolith + `arena_off`.
- `dev/msm-webgpu/main.ts` — `runBatchCheck` (union via `prepareBatch`, any logns
  mix) + `msm-batch-check` autorun; `generateInputs` (profiles A–E), `?varsched=1`.
- `MULTI_MSM_PLAN.md` — full design. `ARENA_LAYOUT.md` — arenas/budget; §7 = the
  `M_RED` restructure (the doc says route (a) `batch_offset.y`; the impl used
  `batch_offset.z` / `params.z`, the provably-unread field — same idea).
- Memory: `msm-webgpu-bid-lifecycle` (bid producers/consumers + the sort trap),
  `msm-webgpu-arena-refactor`.

## Optional, low priority — task 8b

Dedup: rewire `create()`/`prepare()` to call `computeGeom` / `buildUniformWindowDesc`
so there is one geometry source of truth. Guarded by `batch_scheduler.test.ts`;
touches the hot path → re-validate golden after.
