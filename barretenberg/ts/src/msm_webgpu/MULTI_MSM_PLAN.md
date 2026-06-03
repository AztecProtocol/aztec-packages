# Multi-MSM batched evaluation — plan

## Status — START HERE (next session)

- **Done & committed** (`msm-arena-rewrite`): split-c walker-cut decision lever
  (`4c36ee35ad`) + `.wip.wgsl` generator skip (`274e9c139c`). Reduce investigation
  concluded — it's near its compute floor at the production c; reduce optimisation
  is **owned by other agents/worktrees**, do NOT work on it here.
- **This doc is the plan.** Approved framing: the acceptance criterion is the
  operator's (no starvation of the solo-small-MSM-starved stages); the mechanism
  (concatenated super-MSM, one dispatch over the pack, adapt-don't-rewrite) is the
  proposed means and is justified below.
- **Next action: ROLLOUT step 1** — batch scheduler + per-global-window tables +
  arena layout for K packed MSMs + budget bin-packer. Validate via the
  **batch-of-1 ≡ single-MSM byte-identical** invariant (the bisection lever).
- **Open follow-on, separate & lower priority:** split-c large-`c_lo` buffer sizing
  (region-split buffers are sized for `c_w ≤ pickC`; the decision lever is gated
  behind a fits-guard until they're sized). Does NOT block multi-MSM.
- **Environment:** vite serves this worktree on **:5210** (restart if down:
  `cd barretenberg/ts && yarn dev:msm-webgpu --host 127.0.0.1 --port 5210
  --strictPort --no-open`). Validate: `bash ~/localclaudebox/msm-arena-validate.sh
  5210` (golden logN 14–17). Real wire dumps in `dev/msm-webgpu/dumps/`
  (`wire_n23074/90325/97487/119203/131071`). Bench/cross-check via
  `node dev/msm-webgpu/drive-persist.mjs "<url>"`. After ANY `.template.wgsl` edit:
  `node src/msm_webgpu/scripts/inline-wgsl.mjs` then re-test.

## Goal & acceptance criterion

Evaluate **K MSMs concurrently**, packing as many as fit the GPU memory budget.

> **Acceptance criterion (the operator's, and the only hard requirement): every
> pipeline stage that is thread-starved for a single small MSM must no longer be
> starved in the batched case.** A packed small MSM must not underfill the GPU at
> the stages where a solo small MSM does.

Everything below — concatenation, one-dispatch-over-the-pack, adapt-vs-rewrite — is
*proposed mechanism* to meet that criterion, and is open to revision.

## Design principle (proposed — the means, not a mandate)

WebGPU compute dispatches within a queue execute **sequentially**: submitting K
MSMs back-to-back does not overlap their GPU compute (the slot-pool experiment
confirmed this — 0.78× → 0.58×, reverted, "the GPU still executes passes within one
command buffer sequentially"). So the *only* way to get cross-MSM concurrency at a
stage is to place multiple MSMs' work in the **same dispatch** — the GPU scheduler
then runs workgroups from different MSMs across its execution units.

Hence the proposal: **each starved stage's dispatch spans the work of all packed
MSMs** (one dispatch over the budget-fitting pack), so pooled work saturates the
GPU. For tiny MSMs effectively *every* stage starves, so in practice every stage
packs — but that's a consequence of the criterion, not a separate rule.

Motivation: `ChonkAPI::prove` issues ~505 MSMs, most tiny (n = 1, 4, 127, 874,
2888, …). Each badly underfills the GPU at every stage; per-MSM launch +
under-occupancy aggregate to a large fraction of prove time. The existing batched
path (`bridge/main.ts runBatchMsm`) amortizes submit/mapAsync but runs GPU compute
sequentially — so the win has to come from packing the work into the dispatches.

## Core reframing: a batch is one "super-MSM" over concatenated windows

The bucket method treats windows independently until the final per-MSM Horner
combine. So **a batch of K MSMs is one MSM with `Σ NW_k` windows, each window
tagged with its MSM's geometry and point-source via per-window tables.**

The pipeline already became per-window-geometry-driven during the split-c work
(`WindowDesc`, `reduce_sched`, the packed bid). Multi-MSM extends that table with
the only genuinely new per-MSM facts:

- per global window → `(local_window, window_bits, bit_base, num_buckets,
  reduce_off, num_columns)` — **already in `WindowDesc`**.
- **NEW** per global window → `(msm_idx, srsOffset_k, n_k, scalar_base_k)`.

Everything downstream of `decompose` indexes a **global** window/bucket; tagging
each global window with its MSM is what makes the union work. The packed bid
becomes `(global_window << K) | mag`, with `global_window` spanning all packed MSMs.

## Approach: adapt (table-driven), do NOT write new kernels

Reuse the proven, perf-tuned compute verbatim (CIOS montmul, safegcd inversion,
the branchless reduce schedule, the stream-walker, the affine-add tree). Change
only:
- **parameter source**: per-MSM *uniforms* (n, c, num_windows, batch_offset) →
  per-(global-window) *table* reads;
- **buffer layout**: concatenate per-MSM regions;
- **dispatch span**: one dispatch over the union;
- **+ a batch scheduler** that builds the tables / work-lists.

New kernels would duplicate the compute (two copies to keep in sync = silent wrong
results; a full re-tune of register pressure/occupancy/montmul-per-device;
re-validation from scratch) for **zero extra parallelism** — the saturation comes
entirely from the dispatch spanning the union, which is independent of
adapt-vs-rewrite. One possible purpose-build exception is flagged under the planner.

## Stage-by-stage (classification from the kernel audit)

| class | stages | why | multi-MSM change |
|---|---|---|---|
| **EASY** | `ba_reduce_level` | already per-window-table-driven (`reduce_sched` carries each window's `red_buf` base) | concatenate windows, dispatch `Σ NW`. ~No body change — point `base` at MSM *k*'s region. |
| **MODERATE** | `decompose` (+`_upper`), `transpose_*` (+`_upper`), `csr_to_v2_meta`/`active_sums`, `size1` | per-MSM scalars come from *uniforms* (n, c, batch_offset); geometry already from `WindowDesc` | uniform → per-(global-window) table read + a flattened work-tile list over the union. |
| **HARD** | planner (`classify`/`radix_*`/`cumsum`/`partition_*`), `stream_walker`, `walker_combine_*`/`unified_combine`, pair-tree (`pt_*`) | each builds a global structure (radix sort, sorted-bucket-list, pair-tree hierarchy) over **one MSM's bucket distribution** | operate on the **concatenated bucket space** (global bid) — see below. |

### How the HARD stages become multi-MSM (the crux — not hand-waved)

All four are *bucket-set* stages. They go multi-MSM by operating on the
**concatenated bucket space** rather than one MSM's:

1. **Bid encoding extension.** `bid = (global_window << K) | mag`, where
   `global_window` now spans all packed MSMs (`local_window` of MSM *k* offset by
   `Σ_{j<k} NW_j`). A coordinated flip across every bid producer/consumer — the
   exact exercise split-c Phase 0.2 already did once, so the pattern is known.
2. **Radix sort** sorts the **concatenated** dense-bucket list. The sort key
   (bucket count, for work-balancing) is content-agnostic → it extends directly;
   the histogram/scan span the global count space. **This pooling IS the
   saturation win** — every packed MSM's dense buckets land in one balanced
   partition, so a pack of small MSMs fills the GPU that a single one cannot.
3. **Partition / `task_cuts`** balance the **concatenated** work across threads —
   small MSMs' buckets pooled → full occupancy in `stream_walker`.
4. **Walker / combine / pair-tree** process the concatenated sorted / active / hot
   lists. Each bucket's `global_window` → `(msm_idx, srsOffset)` for the point
   gather (shared SRS, see below). Compute unchanged; only the index space and the
   point-source table are extended. The pair-tree's hot buckets pool across MSMs →
   *more* hot buckets → better pt parallelism than any single small MSM.
5. **`planner_meta` atomics** → **global** counters over the union; the indirect
   dispatch args derive from global counts (one set of args for the whole pack).

*Possible purpose-build:* if the global radix key space proves awkward (e.g. we
want buckets grouped by MSM *and* count), a 2-level `(msm, count)` sort — but reuse
the radix *primitive*, not a new compute body. Settle this empirically in step 4.

## Shared SRS — a memory tailwind (not a compute simplification)

All commitment MSMs use the published SRS; the bridge already shares one point
pool (`points_ptr == 0` ⇒ SRS prefix, `srsOffset` threaded per MSM). So packing K
MSMs costs **K× scalars (`n·32`) + per-MSM bucket/red_buf**, but the **points stay
one shared pool** (`n·64`, the single biggest buffer). The arena IN zone is
**scalars-only** → materially more MSMs fit a given budget.

Shared SRS does **not** simplify the hard stages — they're driven by per-MSM
*bucket distributions* (from per-MSM *scalars*), which are point-independent (the
planner never reads a point). And it does not open a scatter shortcut: small MSMs
have small `c` ⇒ few buckets ⇒ *many* points/bucket ⇒ heavy contention, and EC
accumulation isn't integer-atomic, so the sort-and-batch planner/walker is needed
even for them. The benefit is purely the budget gate — which is exactly what
"evaluate multiple if they fit the budget" turns on.

## The new pieces (where the real work is)

1. **Batch scheduler.** From K `MsmDesc`s, build: the per-global-window table
   (geometry + `msm_idx`/`srsOffset`/`n`/`scalar_base`), the concatenated buffer
   offsets, and the per-stage work-tile lists. Host-side first (like the current
   per-MSM `prepare`); GPU-resident is a later optimization.
2. **Budget bin-packer.** Decide K. Footprint = `Σ scalars + Σ per-MSM
   bucket/red_buf/working` (points shared, not summed). Greedy-pack into the
   budget; a too-big MSM stages **solo** (ARENA §6 residency: process a large
   MSM's tiles consecutively, close it before opening the next). Reuse the existing
   `estimateMem` machinery, extended over the pack.
3. **Bid encoding extension** (global-window field) — the coordinated flip.
4. **Arena layout for K packed MSMs**: per-MSM IN (scalars) + RED + bucket
   regions; shared GRID/THREAD work-lists + shared point pool.
5. **Bridge wiring**: `runBatchMsm` builds one pack → one prepare → one set of
   dispatches → one submit → one readback.

## Ragged point-iteration

`decompose`/`transpose`/`walker` iterate an MSM's points, and `n_k` differs per
MSM. Pack via a **work-tile list** of `(msm_idx, point-tile)` covering the union
(tight, no wasted threads), each tile reading its MSM's `n`/`scalar_base`/window
range from the table — rather than a padded `(msm, max_n)` grid that wastes threads
on small MSMs. (Measure both; default to the work-tile list.)

## Validation discipline

- **Batch-of-1 ≡ single-MSM, byte-identical, at every stage's output.** This is
  the bisection lever: any divergence localizes to the stage that broke the
  concatenation. Run it after each stage's adaptation.
- **Batch-of-K ≡ K MSMs run separately** — each packed MSM's result byte-identical
  to its solo run, and oracle-agree (WASM MT) per MSM.
- Test packs: homogeneous-small (the easy win), mixed-size, and a pack that
  straddles the budget (forces solo staging).

## Staged rollout

The pipeline is a chain (a multi-MSM reduce needs a multi-MSM walker upstream), so
build the concatenation framing for the whole pipeline but land + validate
incrementally via the batch-of-1 invariant:

1. **Scheduler + per-global-window tables + arena layout + bin-packer** (infra;
   batch-of-1 reproduces the single-MSM path exactly).
2. **Bid encoding extension** (global window) — validate byte-identical
   (split-c Phase 0.2 pattern: every bid producer/consumer in one coordinated step).
3. **EASY + MODERATE stages** on the concatenated tables (reduce, decompose,
   transpose, csr, size1) — batch-of-1 byte-identical.
4. **HARD stages** (planner radix/partition, walker, combine, pt) on the
   concatenated bucket space — batch-of-1 byte-identical, then batch-of-K vs
   separate. **This is the bulk of the work and the highest risk.**
5. **Bridge wiring** (`runBatchMsm`) + budget gate; bench the real Chonk MSM mix
   (the 505-MSM `ecdsar1+transfer_1_recursions` dump) end-to-end.

## Open questions / risks

- **Bid bit-budget.** `global_window` field vs max pack size. ~10 bits covers
  ~10 MSMs × ~64 windows; a pack of hundreds of tiny MSMs (small `c` ⇒ large NW)
  could need more — but small `c` also means small `mag`, so the field split can
  adapt per-pack to the max `c`. Must keep total ≤ 32 bits; cap K or widen
  otherwise.
- **Radix global key space**: adapt-in-place vs 2-level — the one genuine
  adapt-vs-purpose-build call; settle in step 4.
- **Budget model accuracy**: the bin-packer must size to per-MSM high-water and
  not over-pack (OOM); reuse `estimateMem`'s conservatism.
- **Interaction with split-c large-c_lo** (currently gated off): if it lands, a
  large-`c_lo` MSM inflates its bucket footprint → fewer fit per pass; but large
  MSMs stage solo anyway, so the interaction is confined to the large-wire path.
- **Foundation reuse**: this builds directly on split-c's per-window-table
  machinery (`WindowDesc`/`reduce_sched`/packed bid) — that work is the table-driven
  groundwork multi-MSM extends, not an orthogonal detour.
