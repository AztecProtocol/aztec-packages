# ECCVM short-relation skippable-split plan

## Goal

Reduce ECCVM prover sumcheck cost by splitting each **short** ECCVM relation into sub-relations grouped by their
activation condition, so each group can be **skipped** (`Relation::skip(edges)`) on the rows where it is identically
zero. Many ECCVM subrelations are expensive (degree 4–7 curve arithmetic) yet gated by a selector that is set on a
small fraction of rows (e.g. `q_skew` is 1 on ~1/32 of MSM rows); today they are evaluated on every active row.

The transcript relation has already been done — use it as the worked reference (see "Reference implementation").

## Scope / what you may change

- **Short relations only** (`*_short_relation{,_impl}.hpp` and the `ECCVMShortMonomialFlavor` tuple). Add new short
  relation classes, each with a `skip()` predicate.
- **Legacy relations**: the ONLY permitted change is **reordering the `SubrelationIndex` enum** (and the matching
  `SUBRELATION_PARTIAL_LENGTHS` entries) so that each skippable group occupies a **contiguous** index range. Do NOT
  change legacy relation algebra, gating, or the verifier. Legacy `accumulate` uses named `std::get<NAME>` so it
  follows an enum reorder automatically; if `SUBRELATION_PARTIAL_LENGTHS` is non-uniform, reorder its entries to match.
- Do NOT touch the verifier, recursive verifier, proof layout, VK derivation, or any non-ECCVM relation.

## Why this is safe

This is a **prover-only optimization**. A wrong `skip()` (skipping a row that actually contributes) makes the prover's
round univariate inconsistent and the proof fails to verify — a completeness failure caught immediately by
`ECCVMTests.ShortMonomialProverVerifies`. It can never affect soundness. So correctness is validated by "the proof
still verifies", not by audit.

## The load-bearing invariant: global subrelation order

Alpha/separator batching is assigned by a **flat global subrelation counter** traversing the flavor's `Relations`
tuple in order (`relations/utils.hpp::scale_univariates`). The monolithic verifier (legacy `ECCVMFlavor`) and the
split short prover must agree on the (subrelation -> alpha power) map. Therefore:

- A relation split into N short relations MUST cover a **contiguous** global index range, with the N pieces placed
  **adjacently and in order** in the short flavor's `Relations` tuple, exactly where the original relation sat.
- Equivalently: after any legacy enum reorder, the short pieces must reproduce indices `[k, k+1, ..., k+m]` in order.
- `NUM_SUBRELATIONS` (total) and `MAX_PARTIAL_RELATION_LENGTH` must be unchanged — the short flavor static_asserts
  against `ECCVMFlavor` enforce this. Splitting never adds/removes subrelations; it only regroups them.

## Reference implementation (already landed): transcript

`OFFSET_GENERATOR_X/Y`, `MSM_INFINITY_X_DIFF/Y_SUM/INVERSE` are all gated by `msm_transition` (1 on ~one row per MSM)
but are degree-3–5. Steps taken:

1. Reordered `ECCVMTranscriptRelationImpl` enum to place those 5 contiguously at indices 27–31 (they were 17–21,
   straddling the shared accumulator block). Partial lengths are uniform 8 in legacy, so no array reorder needed.
2. Main short relation `ECCVMTranscriptShortRelation` now covers 0–26 (`NUM_MAIN_SUBRELATIONS = OFFSET_GENERATOR_X`).
3. New `ECCVMTranscriptMsmTransitionShortRelation` (local indices 0–4) computes the 5, with
   `skip(in) { return in.transcript_msm_transition.is_zero(); }`.
4. Flavor tuple: `<...TranscriptShort, TranscriptMsmTransitionShort, PointTableShort, ...>` (adjacent, in order).

Result: `eccvm_short_monomial_sumcheck/15` 434 -> 403 ms (-7.1%), growing with size.

## How `skip()` works

In `SumcheckProverRound::accumulate_relation_univariates`, for each relation: if `isSkippable<Relation, edges>` (the
relation defines a matching `static bool skip(const AllEntities&)`), the prover calls `skip(extended_edges)` and omits
`accumulate` when it returns true. For short flavors the edges are length-2; `in.<column>.is_zero()` checks both rows
of the edge-pair. Choose the gating column(s) such that `skip()==true` implies every subrelation in the group is
identically zero on that edge-pair (include shifted gating columns where a subrelation reads shifts).

## Per-relation work items (priority order)

### 1. MSM relation — HIGHEST VALUE
`ecc_msm_short_relation{,_impl}.hpp`, enum in `ecc_msm_relation.hpp`.

The phase selectors `q_add`, `q_double`, `q_skew` are mutually exclusive — exactly one fires per MSM row — yet the
ADD, DOUBLE and SKEW accumulator+slope chains (all degree 4–7 EC arithmetic) are currently all computed on every row.
Split into three skippable groups:
- **ADD group**: `ADD_ACC_X/Y`, `ADD_SLOPE_1..4`. `skip = q_add.is_zero()`. (~½ of MSM rows.)
- **DOUBLE group**: `DOUBLE_ACC_X/Y`, `DOUBLE_SLOPE_1..4`. `skip = q_double.is_zero()`. (~½ of rows.)
- **SKEW group**: `SKEW_ACC_X/Y`, `SKEW_SLOPE_1..4`. `skip = q_skew.is_zero()`. (~1/32 of rows — biggest win; degree 6–7.)

Complications to handle:
- The `ADD_SLOPE_2/3/4`, `DOUBLE_SLOPE_2/3/4`, `SKEW_SLOPE_2/3/4` subrelations are currently scattered at the end
  (indices ~36–44, split off "to prevent cancellation"). Reorder the legacy enum so each phase's 6 subrelations are
  contiguous, then split. `SUBRELATION_PARTIAL_LENGTHS` is uniform 8 in legacy — reorder is enum-only.
- `COLLISION_CHECK_1..4` use both the add-chain and skew-chain collision relations (`x_i_collision_relation` and
  `x_i_skew_collision_relation`), so they couple ADD and SKEW. Options: keep COLLISION in a non-skipped "shared" group
  that recomputes the (cheap) collision deltas, or fold each collision contribution into the ADD/SKEW groups. Pick
  whichever keeps the expensive `add`/`dbl`/`first_add` chains in exactly one group each.
- The remaining tail (PHASE_SELECTOR_MUTUAL_EXCLUSIVITY, ROUND_TRANSITION_*, COUNT_*, *_CONTINUITY, ADD1_DECOMPOSITION,
  IDLE_ROW_PRESERVES_ACC, INACTIVE_SLICE) is cheap (degree ≤ 3); leave it as one group (optionally `skip` IDLE_ROW
  when any phase selector is set — it's the complementary no-op-row constraint).

### 2. Point table relation — MODEST
`ecc_point_table_short_relation`, enum in `ecc_point_table_relation.hpp` (6 subrels).

- **DOUBLE group**: `DOUBLE_X` (deg 5), `DOUBLE_Y` (deg 4), gated by `precompute_point_transition` (1 once per 8 rows).
  `skip = precompute_point_transition.is_zero()`. Already at indices 0–1 (contiguous) — split cleanly.
- `D_PROPAGATE_X/Y`, `ADD_X/Y` are gated by `(1 - point_transition)` so active on the complementary 7/8 rows — keep as
  the main group (no useful skip beyond the precompute-subtable tail, which the row-skip prefix already trims).

### 3. Set / Lookup / Bools — LOW
- **Set** already defines a whole-relation `skip()`. Leave as-is.
- **Lookup**: 2 subrels (logderivative). Optionally add a whole-relation `skip` when `precompute_select`, `msm_add`,
  `msm_skew` all vanish; marginal.
- **Bools**: 23 degree-2 subrels — cheap; the row-skip prefix already trims the tail. Skip unless worthwhile.

### 4. WNAF — LOW
`ecc_wnaf_short_relation`. The expensive part (8 degree-4 `RANGE_S*` checks) is active on every `precompute_select==1`
row, so there is no expensive-and-sparse group. The `INACTIVE_*` group (degree-2, gated by `precompute_select==0`) is
cheap. Skip unless profiling says otherwise.

## Per-relation procedure

For each split:
1. If the target group is not contiguous, reorder the legacy `SubrelationIndex` enum (and matching partial-length
   entries) to make it contiguous — ideally at the start or end of the relation's range. Update any test that
   references a subrelation by hard-coded index to use the enum name (see `eccvm_relation_corruption.test.cpp`).
2. In the short relation, reduce the main `SUBRELATION_PARTIAL_LENGTHS` to the non-split range, and move the group's
   accumulate code into a new `*ShortRelation` with local indices `0..g-1`, its own partial lengths, and a `skip()`.
3. Wire the new relation into `ECCVMShortMonomialFlavor::Relations_` adjacent to its parent, preserving global order.
4. Keep the expensive shared intermediates in exactly one group; if two groups need a cheap shared value, recompute it
   (the recompute must cost less than the skip saves — verify by bench).

## Validation (run after each relation)

```
cd barretenberg/cpp
cmake --build build --target eccvm_tests
./build/bin/eccvm_tests        # must be 45/45; ShortMonomialProverVerifies proves the split verifies,
                               # relation-corruption tests prove the legacy reorder is consistent
```
Then measure:
```
./scripts/benchmark_remote.sh eccvm_bench   # compare eccvm_short_monomial_sumcheck/* vs the previous commit
```
Keep a split only if `eccvm_short_monomial_sumcheck` improves (or is neutral and clearly cleaner). Note that the win
grows with circuit size (more skippable rows). MSM is expected to dominate the gains.

## Done criteria

- MSM ADD/DOUBLE/SKEW split landed (the primary win), point-table DOUBLE split landed.
- All splits keep `eccvm_tests` at 45/45 and do not regress `eccvm_short_monomial_*` benchmarks.
- `NUM_SUBRELATIONS` / `MAX_PARTIAL_RELATION_LENGTH` static_asserts against `ECCVMFlavor` still hold.
- No changes to legacy relation algebra or the verifier; legacy enum reorders only.
