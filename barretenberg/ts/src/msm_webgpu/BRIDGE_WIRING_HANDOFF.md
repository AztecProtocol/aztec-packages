# Bridge wiring — HANDOFF (START HERE for the next step)

Wire the **validated, perf-measured union path** into the production bridge so
ChonkApi's real MSM mix gets the saturation win. Branch: `msm-arena-rewrite`.
Read alongside `MULTI_MSM_HANDOFF.md` (union internals) and `MULTI_MSM_PERF.md`
(the win this realises).

## TL;DR

- The union is **correct** (byte-identical, all profiles + heterogeneous, n and c)
  and the **M2 perf win is measured** (3.5–14×, genuine saturation — `MULTI_MSM_PERF.md`).
  Both are exercised today only by the dev harnesses (`msm-batch-check` /
  `msm-batch-bench`), **not by the production bridge.**
- `bridge/main.ts runBatchMsm()` still runs **per-MSM, sequentially** (one `MsmV2`
  per n via `getOrCreateMsm`; GPU executes the passes back-to-back). It amortises
  submit/mapAsync but gets **zero** saturation. This task replaces that with
  `packByBudget → prepareBatch → one union dispatch per pack → scatter results`.
- The union MATH is done. The work here is **plumbing** (descriptor decode, scalars
  concat, per-member result/meta scatter) + **budget reconciliation** + **E2E
  validation**. No WGSL changes (don't regen shaders unless you touch a `.template`).

## What's proven vs what's left

| | status |
|---|---|
| union one-dispatch, arbitrary n & c, no padding | ✅ done (`prepareBatch`) |
| byte-identical union≡solo (all profiles, heterogeneous) | ✅ done |
| M2 saturation win measured (3.5–14×, per-stage, K-scaling) | ✅ done (`MULTI_MSM_PERF.md`) |
| 160 MiB runtime budget gate | ✅ enforced (`prepareBatch`, msm_v2.ts:2678) |
| **`runBatchMsm` drives the union** | ❌ **this task** |
| host packer ↔ runtime budget agree | ❌ this task (sub-task below) |
| E2E on the 505-MSM ChonkApi dump | ❌ this task |
| phone (Adreno/Mali) bench | ❌ separate follow-up |

## Current bridge shape (what you're replacing)

`bridge/main.ts`:
- One **shared SRS pool** `this.pool` (`MsmV2Pool` at `this.srsN`, the published SRS
  prefix). Instances bind to it via `getOrCreateMsm(n)` (srsN-sized pinned `srsMsm`
  + an LRU of per-n instances), all `combineOnHost:false` (yield per-window sums for
  the C++ Horner combine).
- `runBatchMsm()` (line ~438): reads `batchCount` **descriptors**, 20 B = 5×u32:
  `[0]n [1]srsOffset [2]scalarsOff(bytes into scalarsBase) [3]resultOff(bytes into
  resultsBase) [4]reserved(off-SRS ptr, always 0)`. Two sequential paths
  (no-collision single-encoder; same-N per-MSM submits).
- Per MSM writeback: results → `resultsBase+resultOff` as `numWindows × 64` canonical
  LE bytes (`writeBigIntLE(out, w*64, x, 32)`, `+32` for y); meta → `metaBase + i*8`
  = (`numWindows`, `c`) so the C++ hook Horner-combines in native bb::g1.

## Target shape (the recipe)

In `runBatchMsm`, after decoding descriptors:

1. **Split candidates.** Keep on the **existing per-MSM path** any member with
   `srsOffset≠0` or `reserved≠0` (the union assumes the SRS prefix `[0,n)`; srsOffset
   folding is deferred). Most commitment MSMs are `srsOffset==0` → packable.
2. **Pack.** `packByBudget(candidates, {budgetBytes: MEM_BUDGET, srsBytes: this.pool.poolX.size + this.pool.poolY.size, sT, sS})`
   → `BatchLayout[]`. **`srsBytes` MUST be the real shared-pool size** (see the trap
   on srsBytes below — this is the one non-obvious budget fact). A too-big member is
   emitted solo by the packer → runs on the per-MSM path.
3. **Per pack** (process one at a time — peak GPU mem = pool + one pack's arena):
   a. Get a union `MsmV2` sized to the pack's **maxN** bound to `this.pool`
      (maxN ≤ srsN always). Reuse-by-maxN cache or create-per-pack (create ≈ tens of
      ms; the union saves far more). **Don't reuse `srsMsm`** if `srsN ≫ maxN` — its
      baked envelope over-sizes every dispatch grid.
   b. **Build the concatenated scalars in planBatch's layout** (mirror
      `measurePack`/`runBatchCheck` in `dev/msm-webgpu/main.ts`):
      `concat = new Uint8Array(plan.totalScalarBytes)`; for each member copy
      `n_k×32` from WASM `scalarsBase+scalarsOff_k` → `concat[desc.scalarBase]`.
      (Descriptor `scalarsOff` is the C++ batch layout; `planBatch` computes its OWN
      `scalarBase` — they are NOT guaranteed equal, so the copy is required.)
   c. `inst.prepareBatch(members, concat, plan.windowDescTable, plan.reduceOffsets)`,
      `members = plan.descs.map(d => ({n:d.n, scalarBaseBytes:d.scalarBase, schedOff:d.schedOff, numWindows:d.numWindows}))`.
   d. Run the union (one submit). Either `inst.run()` or `encodeIntoBatch` into a
      shared results staging (keep the batched-mapAsync amortisation: one pack = one
      submit + one mapAsync).
   e. **Scatter.** Union `windowSums` = Σ NW windows; member k owns
      `[schedOff_k, schedOff_k+numWindows_k)`. Write that slice → `resultsBase+resultOff_k`
      (same LE format as today), and `metaBase + globalIdx_k*8` =
      (`numWindows_k`, **`c_k`** = the member's own c = `plan.descs[k].geom.c`, NOT the
      union envelope c).
4. **Fallback path.** Excluded members (step 1) + solo packs → existing per-MSM code.

Add a flag (e.g. SAB slot or `?union_bridge=0`) to force the old path for A/B and
instant revert if a prove diverges.

## Budget reconciliation (the sub-task — get this right)

`packByBudget`/`batchFootprintBytes` (host, `batch_scheduler.ts`) must agree with the
runtime `estimateMem` (`msm_v2.ts:2634-2659`) so the packer never picks a pack the
runtime then **throws** on (`prepareBatch: union footprint … exceeds … budget`,
msm_v2.ts:2680). Exact divergences for a heterogeneous pack (homogeneous already
agrees):

| term | runtime union (source of truth) | host `batchFootprintBytes` | effect |
|---|---|---|---|
| `l0Slots` | `(ΣNW)·maxN` (partials matrix, dispatch-sized from class max n) | `Σ_k NW_k·n_k` | host **under**-counts |
| `batchSlots` | `totalPoints = Σ n_k` | `Σ_k NW_k·n_k` | host **over**-counts |
| `srsBytes` | `pool.poolX.size+poolY.size` (full shared pool) | `opts.srsBytes` (caller-supplied) | must pass the real pool size |

**Recommended fix:** add a union-accurate estimator that mirrors the runtime branch
*exactly* (`batchSlots=Σn_k`, `l0Slots=(ΣNW)·maxN`, `scalarsBytes=Σ scalarBytes`,
`srsBytes`=pool, and **`sT`/`sS` from the union instance's `streamNumThreads`/`streamS`,
not `DEFAULT_ST`/`DEFAULT_SS`** — the THREAD-zone term `a(2·sT·sS·4)+a(sT·(sS+1)·2·4)`
diverges if they differ) rather than the per-member-sum approximation — the runtime IS
the spec, so replicate its formula. **AND** keep a defensive `try/catch` around
`prepareBatch`: on the budget throw, drop the last member and re-pack, so a model
miss degrades gracefully instead of erroring a prove.

## The srsBytes trap → K will be lower than `MULTI_MSM_PERF.md`

`MULTI_MSM_PERF.md` packed with `srsBytes=0` and a pool sized to the *pack's* maxN
(tiny). The **bridge's shared pool is srsN-sized** (could be tens of MB) and the
runtime counts it (`srsBytes = poolX+poolY`). So peak = bigPool + pack arena, and the
**achievable K per pack is lower** than the perf doc's pool-free K-ceilings (e.g. the
"K=64 @ 133 MiB" cell assumed a 512-point pool; with a large resident SRS pool that
same arena + pool overflows 160 MiB).

**This is fine, and the K-scaling result tells you why:** the saturation curve
**plateaus by K≈16–32** (`MULTI_MSM_PERF.md`), so a budget-limited K≈16–24 still
captures ~5–8× — most of the win. Don't chase huge K; the win is mostly in by K≈16.
Re-measure the real achievable K once `this.pool` is srsN-sized (or just let
`packByBudget` pick it with the correct `srsBytes`).

## Validation (red/green — the plumbing is the risk, not the math)

The union math is byte-identical already; **don't re-validate it.** Validate the
NEW plumbing (descriptor decode, scalars-concat order, per-member result/meta scatter):

1. **Browser harness (preferred bisection lever).** Extract the pack→prepareBatch→
   scatter core into a function that takes (descriptor array, scalars bytes, pool,
   device) → per-member windowSums, and add a dev autorun (mirror `msm-batch-check`)
   that builds a synthetic descriptor batch and asserts each member's scattered
   result == its solo run, **byte-identical**, for a mixed-n batch incl. a profile-E
   member. This keeps the byte-identical-bisection discipline on the bridge code.
   (jest `protocol.test.ts` only covers the SAB protocol — no WebGPU in node.)
2. **E2E acceptance.** The 505-MSM ChonkApi dump (`ecdsar1+transfer_1_recursions`):
   prove with `union_bridge` on vs off; assert **identical proof bytes** and measure
   the MSM-phase wall (the per-MSM 3.5–14× should surface as a prove-time drop).
   Dev page has `?msm_dump=<name>` for the scalar distributions; the full E2E is via
   the C++ prove path (see `barretenberg/CLAUDE.md` IVC/e2e).

## Key files / anchors

- `bridge/main.ts` — `runBatchMsm` (~438), `getOrCreateMsm` (274), `this.pool`/`srsN`
  (73–74), descriptor format (comment ~423), per-MSM writeback (~586–597).
- `msm_v2.ts` — `prepareBatch` (2367), union budget gate + `estimateMem`
  (2634–2688, the throw at 2680), `srsBytes = pool.poolX+poolY` (2633).
- `batch_scheduler.ts` — `packByBudget` (413), `batchFootprintBytes` (255),
  `planBatch` (305), `MsmPackInput` ({n, srsOffset?, geomConfig?}).
- `dev/msm-webgpu/main.ts` — **`measurePack`/`runBatchCheck` are the reference
  implementation** of concat-build + prepareBatch + per-member scatter; mirror them.
- `MULTI_MSM_PERF.md` — the win; the K-scaling that says K≈16–24 is enough.
- `MULTI_MSM_HANDOFF.md` — union internals, the byte-identical-at-homogeneous lever,
  `point_offsets`/`windowCs`/`reduceOffsets` plumbing.

## Traps (carried over + new)

- **Scalars layout copy is mandatory** (descriptor `scalarsOff` ≠ planBatch
  `scalarBase`). Mirror `measurePack`.
- **`c` is per-member** in a heterogeneous pack — write `geom.c` per member into meta,
  not the union envelope c.
- **`srsOffset≠0` / `reserved≠0` → exclude from packs** (union assumes SRS prefix).
- **`srsBytes` = the real shared pool** in `packByBudget`, or the packer over-packs and
  the runtime throws (and K will be lower than the perf doc — by design, see above).
- **Don't over-size the union instance** to `srsN` if the pack's maxN is smaller.
- **No WGSL edits** in this task → no `inline-wgsl.mjs` needed. (If you do touch a
  `.template.wgsl`, regen — hard rule.)
- **Keep the per-MSM path** as the fallback + behind the A/B flag.
