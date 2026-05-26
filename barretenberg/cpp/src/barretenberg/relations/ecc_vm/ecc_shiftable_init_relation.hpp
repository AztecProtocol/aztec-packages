// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Pins every shiftable wire to 0 at the `lagrange_first` row (TRACE_OFFSET).
 *
 * @details
 * ECCVM has 26 shiftable witness columns (see `WireToBeShiftedWithoutAccumulatorsEntities`,
 * `WireToBeShiftedAccumulatorEntities`, and `DerivedWitnessEntities` for `z_perm` in
 * `eccvm_flavor.hpp`). Honest builders zero all of them at the `lagrange_first` row
 * (`TRACE_OFFSET`) — the dead header that sits between the leading zero/masking head and
 * the first active row.
 *
 * Shiftability is a *polynomial-structure* property — it enforces `col[0] = 0` (the leading
 * zero row of the trace), but it does **not** structurally enforce
 * `col[lagrange_first row] = 0`. A malicious prover can commit a polynomial whose value
 * there is non-zero. The constraint at the preceding row that would have pinned the
 * lagrange_first row's value via `col_shift` sits in the disabled-head region (the first
 * `NUM_DISABLED_ROWS_IN_SUMCHECK` rows have a vanishing gate separator), so it does not
 * fire.
 *
 * This relation enforces `lagrange_first · col = 0` for every shiftable column whose value
 * at the lagrange_first row is not already pinned to 0 by some other constraint. Some such
 * constraints exist (see the per-column rationale below), in which case we document where
 * the pinning happens and omit a subrelation here.
 *
 * Without this defense, at least the following gaps existed:
 *  - `precompute_select`: phantom 1-row scalar at lagrange_first with unbounded scalar_sum
 *    propagating to the transcript-side `z1` (load-bearing for soundness).
 *  - `transcript_mul`: spurious second-term-multiset denominator factor at lagrange_first
 *    with attacker-controlled fingerprint (load-bearing).
 *  - `transcript_pc`: composes with `transcript_mul` above (load-bearing).
 *
 * For columns whose value at the lagrange_first row is free but not currently read by any
 * firing constraint, we still pin to 0 here as defense-in-depth so that the invariant is
 * explicit, robust to future relation changes, and easy to reason about.
 *
 * Skipped here (pinned by *cascade* in another relation — DO NOT remove the cited
 * constraint without revisiting):
 *  - `transcript_accumulator_x`, `transcript_accumulator_y` ← pinned by cascade through
 *    `is_accumulator_empty · transcript_accumulator_{x,y} = 0` in
 *    `ecc_transcript_relation_impl.hpp`. With
 *    `transcript_accumulator_not_empty = 0` at lagrange_first from
 *    `TRANSCRIPT_ACCUMULATOR_NOT_EMPTY_INIT` below, `is_accumulator_empty = 1` there and
 *    both coordinates are forced to 0.
 *  - `precompute_pc` ← `INACTIVE_PC` in `ecc_wnaf_relation_impl.hpp` (cascade through
 *    `precompute_select = 0` at lagrange_first, which we pin below).
 *  - `precompute_round` ← `INACTIVE_ROUND` in `ecc_wnaf_relation_impl.hpp` (same cascade).
 *  - `precompute_s1hi` ← `INACTIVE_SLICE_W0` plus the 2-bit range constraints
 *    `RANGE_S1HI`, `RANGE_S1LO` in `ecc_wnaf_relation_impl.hpp` (same cascade — at
 *    `precompute_select = 0`, the wNAF digit `w_0` is forced to -15, which combined with
 *    the range constraints on `s1hi` and `s1lo` forces both to 0).
 *
 * @tparam FF
 */
template <typename FF_> class ECCVMShiftableInitRelationImpl {
  public:
    using FF = FF_;

    enum SubrelationIndex : size_t {
        // Load-bearing for soundness:
        //
        // Z_PERM_INIT and TRANSCRIPT_ACCUMULATOR_NOT_EMPTY_INIT were previously housed in
        // ECCVMSetRelation and ECCVMTranscriptRelation respectively; centralizing them here
        // keeps every direct `lagrange_first · col = 0` constraint in one place.
        Z_PERM_INIT = 0,
        TRANSCRIPT_ACCUMULATOR_NOT_EMPTY_INIT = 1,
        PRECOMPUTE_SELECT_INIT = 2,
        TRANSCRIPT_MUL_INIT = 3,
        TRANSCRIPT_PC_INIT = 4,

        // Defense-in-depth (values not currently read at lagrange_first, but pinning makes
        // the invariant explicit and robust to future relation changes):
        PRECOMPUTE_SCALAR_SUM_INIT = 5,
        PRECOMPUTE_DX_INIT = 6,
        PRECOMPUTE_DY_INIT = 7,
        PRECOMPUTE_TX_INIT = 8,
        PRECOMPUTE_TY_INIT = 9,
        MSM_TRANSITION_INIT = 10,
        MSM_ADD_INIT = 11,
        MSM_DOUBLE_INIT = 12,
        MSM_SKEW_INIT = 13,
        MSM_ACCUMULATOR_X_INIT = 14,
        MSM_ACCUMULATOR_Y_INIT = 15,
        MSM_COUNT_INIT = 16,
        MSM_ROUND_INIT = 17,
        MSM_ADD1_INIT = 18,
        MSM_PC_INIT = 19,
        TRANSCRIPT_MSM_COUNT_INIT = 20,
        NUM_SUBRELATIONS,
    };

    // Every subrelation is `lagrange_first · col · scaling_factor` (degree 2 in witnesses → partial length 3).
    static constexpr std::array<size_t, 21> SUBRELATION_PARTIAL_LENGTHS{ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
                                                                         3, 3, 3, 3, 3, 3, 3, 3, 3, 3 };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    // skip after lagrange_first row
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.lagrange_first.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& /* unused */,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMShiftableInitRelation = Relation<ECCVMShiftableInitRelationImpl<FF>>;

} // namespace bb
