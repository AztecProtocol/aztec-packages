# GPU memory + bandwidth reduction — analysis & plan

Branch `sb/multipass-sumcheck-opt`. Numbers at **2^17 = 131072 edges**, base column = `n·32 B = 4.0 MiB`.
Memory profiler baseline (matches the task brief):

| engine | peak live | columns | scratch | col allocs |
|---|---|---|---|---|
| SS-hybrid | 1296 MB | 1110 MB | 182 MB | 28 |
| multi-pass | 1666 MB | 1480 MB | 182 MB | 252 |

---

## Step 0 — the real shared-vs-duplicated column picture (confirmed)

`descriptors.ts` builds columns **per relation** (`buildInputs` → independent RNG stream per relation),
so the resident set is `Σ numEdges = 185` column buffers. This is a **benchmarking artifact** carried over
from the standalone per-relation suites (each suite diffs its relation against its own polynomial golden,
so it needs its own random columns). The integrated sumcheck has no such constraint: telescoping holds for
*any* multilinear inputs, so the rounds suite passes whether or not relations share columns.

In a real MegaFlavor witness (authoritative, from `cpp/.../flavor/mega_flavor.hpp` cross-checked against all
14 WGSL templates) there are exactly **67 entities**: 35 precomputed + 27 witness + **5 shifted**. The 14
relations read **slices of this one set**:

```
185 per-relation columns  →  67 distinct MegaFlavor entities   (2.76× fewer)
```

Sharing map (how many relations read each entity — the duplication being paid for today):

```
w_r ×13   w_l ×12   w_o ×12   w_4 ×10                       (wires)
w_l_shift ×11  w_4_shift ×10  w_r_shift ×10  w_o_shift ×10  (4 of the 5 shifts)
q_r ×9  q_o ×9  q_l ×8  q_m ×7  q_4 ×7  q_c ×4              (shared selectors)
…the remaining 52 entities are read by exactly 1 relation each
  (gate selectors, sigma/id/table, lookup cols, ecc-op wires, 20 databus bus cols, z_perm[_shift]).
```

**Only 5 entities are shifted** — `w_l_shift, w_r_shift, w_o_shift, w_4_shift` (= +1 of the wires) and
`z_perm_shift` (= +1 of `z_perm`). No selector/table/lookup/databus entity is shifted. The **42** shift
columns materialized across relations today collapse to **5** under sharing.

Per-relation global-entity index arrays (canonical order: 62 unshifted at 0–61, then shifts at 62–66) are
baked into `descriptors.ts` (`globalEntityIndices`) by the Idea-1 change below.

---

## Idea 1 — shared resident column set  ★ headline, ~708 MB

**Change.** Upload **one** resident set of 67 entity columns (column-major Montgomery, length n) instead of
185 per-relation copies. Each relation's accumulate kernel reads its entities through a small per-relation
`entity_map: array<u32>` (length numEdges) that maps local edge index → global entity index. The fold then
folds **67** columns/round instead of 185.

Mechanism: the accumulate `ld(row, j)` computes the column block as `(j>>1)·col_len`. With sharing it becomes
`entity_map[j>>1]·col_len` into the shared buffer. There is **no shader-free shortcut** — relations need
non-contiguous entity subsets in different orders, which a single buffer-offset binding can't express; the
indirection binding is required.

**Footprint (ping-pong A full + B half = 1.5× base):**

| | columns | save |
|---|---|---|
| SS current | 1.5·185·4 = **1110 MB** | — |
| SS shared | 1.5·67·4 = **402 MB** | **−708 MB** |
| multi-pass shared (+ Idea 4) | **402 MB** (28 allocs) | −1078 MB |

**Bandwidth/round.** Fold read+write drops `185 → 67` columns = **2.76× less fold traffic** (round 0:
1110 MB → 402 MB read+write). *Honest caveat:* accumulate **reads** are unchanged — each relation still
reads its entities, so a shared entity read by k relations is still read k times (≈740 MB/round). The wins
are footprint + fold traffic (+ likely better L2 reuse since `w_l` is now one buffer, not 12).

**Correctness.** Telescoping-preserving for the benchmark (any mapping yields a valid sumcheck). Touches all
14 relation templates + `shader_manager` binding plumbing + both engines + descriptors → **must be validated
on GPU** (M4 Pro/Chrome). De-risked here by: a mustache `shared` toggle so the standalone/integration suites
render byte-identical WGSL (zero regression), and `naga` validation of every generated shared shader.

---

## Idea 2 — shifts as +1 views (round 0 only)  ~20 MB on top of Idea 1

Barretenberg stores a shifted poly as an offset **view** into the base's memory *before* sumcheck, then folds
it as its **own** polynomial. After round 0 `shifted'[k] = base[2k+1] + u·(base[2k+2]−base[2k+1])`, which is
**not** any slice of `base'` — so shift-as-view is **round-0 only**; from round 1 each shift is a standalone
folded column. (This is why "keep shift-as-offset through all rounds" is not achievable — the C++ prover
doesn't either; it just shares round-0 *input* memory.)

Because **Idea 1 already collapses 42 shift columns to 5**, the marginal benefit here is small: at the round-0
peak, the 5 shift bases need not be stored full (read base at +1 instead), so `A = 62 full` not `67 full`:

```
peak = 62·4 (A) + 67·2 (B) = 248 + 134 = 382 MB   vs Idea-1's 402 MB   →  −20 MB
```

Plus it removes the round-0 upload + read of 5 full shift columns. **Recommendation:** land Idea 1 first;
add Idea 2 as a follow-up (it needs a round-0-vs-round-≥1 entity-map swap + a `+1` bounds-guarded read in the
shader — extra shader logic for 20 MB, best done once Idea 1 is GPU-confirmed).

---

## Idea 4 — multi-pass ping-pong fold  ★ safe, independent, −370 MB + 252→28 allocs

`gpu_pipeline.ts` allocates a **fresh** folded-column set every round (`create_sb` in `fold`) and never frees
it → `≈2n` per relation (1480 MB, 252 allocs). Switch to the SS engine's ping-pong (one full `colA`, one
half-size `colB`, reused each round) → `1.5n` per relation:

```
1480 MB / 252 allocs  →  1110 MB / 28 allocs     (−370 MB, before Idea 1; → 402 MB after)
```

Pure engine change, reuses the existing fold kernel unchanged → **correctness-preserving**. Gated by
`suite_rounds` + `suite_fold`. *This is implemented in this pass* (lowest risk, immediate A/B).

> Note on true in-place (dropping below 1.5×): the fold writes `dst[k]` from `src[2k],src[2k+1]`; with
> `dst===src`, thread k clobbers `col[k]` while thread `k/2` may still read it — a GPU data race with no
> ordering guarantee. So 1.5× (full + half ping-pong) is the safe minimum; not pursued.

---

## Idea 5 — fuse accumulate→reduce  ★ kills 180 MB scratch + ~1.4 GB/round scratch traffic

Scratch breakdown: `perEdge = (n/2)·maxOutLen·32`, `maxOutLen = 90` (databus) → **180 MB** = essentially the
entire 182 MB scratch (`scalScratch` 2 MB, `partsScratch` 0.18 MB are noise). `perEdge` materializes every
relation's per-edge outputs to global memory, then `reduce` reads them back.

**Change.** Fuse the per-edge accumulate with the first reduce level: each accumulate workgroup keeps its
partial sums in workgroup/registers and writes only the `≤REDUCE_GROUPS·outLen` partials — the full
`(n/2)·outLen` array never touches global memory. Removes the 180 MB buffer **and** a full `perEdge`
write+read per relation per round (round-0 scratch traffic ≈ `2·(n/2)·345·32 ≈ 1.38 GB`).

**Cost/risk.** Bigger kernel redesign: a workgroup-reduction epilogue in all 14 relation templates → **needs
GPU validation**. Highest bandwidth win after Idea 1; **documented follow-up** (not in this pass).

---

## Idea 3 — implicit / sparse columns  small, deferred

- `id_1..id_4` (4 cols): affine in row index → compute from `global_id`, store nothing.
- `lagrange_first/last`, `lagrange_ecc_op` (3 cols): nonzero in one row → scalar + index test.
- selectors `q_*`: frequently 0/small → compact upload expanded on read (measure density first).

7 implicit candidates × 4 MiB = **~28 MB** at round 0 + their reads. All become non-affine/non-sparse after a
fold, so round-0-only (cross-round is complex). Smallest lever — **deferred**.

---

## What landed in this pass (validate on GPU before relying on it)

All changes are off by default or fully correctness-preserving; nothing existing changes unless a
flag is set. I have **no GPU here** — I validated with `naga` (all 28 generated shaders compile),
`tsgo` (clean, exit 0), and proved the per-relation shaders are byte-identical to HEAD. The runtime
shared-engine path needs the user's on-GPU suite run to confirm correctness.

1. **Idea 4 — multi-pass ping-pong fold** (`gpu_pipeline.ts`). Done. Reuses the fold kernel; the
   resident column set goes 252→28 allocs (~1480→1110 MB). Correctness-preserving (same fold output,
   reused buffers). The final readback was also switched from `read_from_gpu` (reads the whole buffer)
   to a sized `copyBufferToBuffer` of just `numEdges*curLen` per column — without this the ping-pong's
   full-length reused buffer is staged back wholesale (~370 MB at 2^16), erasing the win. Gate:
   `suite_rounds`, `suite_fold`, memory tab.

2. **Idea 1 — shared 67-entity columns** (foundation + SS engine). Done behind `sharedColumns`:
   - `descriptors.ts`: `globalEntityIndices` per relation + `GLOBAL_ENTITIES`/`NUM_GLOBAL_ENTITIES`
     (+ `SHIFT_BASE` for Idea 2) + a consistency assert.
   - 14 relation templates + `shader_manager` gained a `shared` mustache toggle (entity_map
     indirection). **Non-shared output is byte-identical to HEAD** (proven by diff) so the standalone
     and integration suites are untouched.
   - `single_submit.ts`: the SS engine reads one resident set of 67 columns (one ping-pong buffer pair
     + per-relation `entity_map`) and folds it in a single dispatch when `sharedColumns` is set; returns
     per-relation `finalColBytes` gathered from the shared buffer so the purported anchor is unchanged.
   - `bench.ts` `runMemoryProfile`: now runs the SS engine **both** ways and logs the delta — expect
     columns `1110 → 402 MB`, allocs `28 → 2`, peak live `1296 → ~588 MB`.
   - `suite_singlesubmit.ts`: validates the per-relation **and** shared engine (the CPU reference gathers
     each relation's columns from the one shared witness via `globalEntityIndices`). **Run this on GPU to
     confirm the shared path before trusting the memory numbers.**

## Follow-ups (designed, not yet implemented)

- **Idea 1 for the multi-pass engine** — identical mechanism to the SS shared path (one 67-column
  buffer + entity maps + single-dispatch fold). The `suite_rounds` CPU reference needs the same
  shared-witness gather. ~1110 → 402 MB once landed.
- **Idea 2** (shift-as-view, round 0) — ~20 MB on top of Idea 1; needs a round-0-vs-≥1 entity-map swap
  + a `+1` bounds-guarded read. `SHIFT_BASE` in `descriptors.ts` already has the base indices.
- **Idea 5** (fuse accumulate→reduce) — removes the 180 MB `perEdge` scratch + ~1.4 GB/round scratch
  traffic; needs a workgroup-reduction epilogue in the 14 relation kernels (biggest remaining bandwidth win).
- **Idea 3** (implicit id/lagrange columns) — ~28 MB, round-0 only; smallest lever.

Re-run the bench **Memory** tab after each step.
