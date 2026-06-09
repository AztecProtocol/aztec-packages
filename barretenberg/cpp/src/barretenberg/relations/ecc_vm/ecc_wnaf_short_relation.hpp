// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_short_monomial_relation_utils.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_relation.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class ECCVMWnafShortRelationImpl : public ECCVMWnafRelationImpl<FF_> {
  public:
    using FF = FF_;
    using Base = ECCVMWnafRelationImpl<FF>;

    // Tightened partial lengths per actual subrelation degree. The base relation declares all 5; many subrelations
    // are deg 2 or deg 3 and only need partial length 3 or 4. The deepest (RANGE_S* and FIRST_SLICE_POSITIVE) stay
    // at 5, so MAX_PARTIAL_RELATION_LENGTH at the flavor level is unchanged.
    static constexpr std::array<size_t, Base::NUM_SUBRELATIONS> SUBRELATION_PARTIAL_LENGTHS{
        5, 5, 5, 5, 5, 5, 5, 5, // RANGE_S1HI..RANGE_S4LO (deg 4)
        4,                      // SCALAR_SUM_CHECK (deg 3)
        4,                      // ROUND_CHECK (deg 3)
        4,                      // ROUND_SHIFT_ZERO (deg 3)
        4,                      // SCALAR_SUM_SHIFT_ZERO (deg 3)
        4,                      // PC_CHECK (deg 3)
        4,                      // SKEW_RANGE (deg 3)
        3, 3, 3, 3,             // INACTIVE_SLICE_W0..W3 (deg 2)
        3,                      // INACTIVE_ROUND (deg 2)
        3,                      // INACTIVE_PC (deg 2)
        5,                      // FIRST_SLICE_POSITIVE (deg 4)
        3,                      // INACTIVE_POINT_TRANSITION (deg 2)
        4,                      // PRECOMPUTE_SELECT_SHAPE (deg 3)
    };
    static_assert(Base::NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    /**
     * @brief Skip rows on which every subrelation contributes the identically-zero polynomial.
     *
     * The wNAF relation is local to the precompute (point-table) region, gated by the boolean column
     * `precompute_select`, which has shape `0 1 1 ... 1 0 ... 0` (0 at the region's initial row, 1 across the active
     * rows, 0 elsewhere). Predicate: skip iff `precompute_select == 0 && precompute_select_shift == 0`. Both columns
     * are constrained boolean by ECCVMBoolsRelation, so on any non-randomised row their sum is 0 iff both are 0 (no
     * field cancellation). On the row-disabled rows the selectors are randomised, so the sum is nonzero w.h.p. and
     * those rows are never skipped.
     *
     * Per-subrelation soundness when `precompute_select == 0 && precompute_select_shift == 0` on an honest row:
     *  - precompute_select-gated (SCALAR_SUM_CHECK, ROUND_CHECK, PC_CHECK, SKEW_RANGE): explicit precompute_select
     *    factor is 0.
     *  - precompute_select_shift gates FIRST_SLICE_POSITIVE and PRECOMPUTE_SELECT_SHAPE: explicit factor is 0.
     *    The shift must be in the predicate because at the region's initial row precompute_select == 0 yet
     *    precompute_select_shift == 1, where both subrelations are live, so that row is not skipped.
     *  - ROUND_SHIFT_ZERO / SCALAR_SUM_SHIFT_ZERO carry factor `precompute_select * q_transition + lagrange_first`.
     *    With precompute_select == 0 this is `lagrange_first`. The region begins at row 0, so precompute_select_shift
     *    == 1 on the lagrange_first row; hence the predicate is false there and that row is never skipped. On every
     *    skipped row lagrange_first == 0, so the factor is 0.
     *  - ungated RANGE_S* `((s-1)^2-1)((s-2)^2-1)` and complement-gated INACTIVE_* (SLICE_W*, ROUND, PC,
     *    POINT_TRANSITION): the base relation forces all region body wires (slices, round, pc, point_transition) to 0
     *    on inactive rows, so on an honest skipped row every slice is 0 (RANGE_S* = ((0-1)^2-1)((0-2)^2-1) = 0) and
     *    every inactive body is 0.
     *
     * Correctness is checked end-to-end by ECCVMTests.ShortMonomialProverVerifies (a wrongly-skipped live row would
     * desynchronise the prover's sumcheck round polynomials from the verifier's recomputation).
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.precompute_select + in.precompute_select_shift).is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMWnafShortRelation = Relation<ECCVMWnafShortRelationImpl<FF>>;

} // namespace bb
