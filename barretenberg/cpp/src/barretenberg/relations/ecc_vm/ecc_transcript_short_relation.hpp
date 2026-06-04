// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_short_monomial_relation_utils.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_relation.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class ECCVMTranscriptShortRelationImpl : public ECCVMTranscriptRelationImpl<FF_> {
  public:
    using FF = FF_;
    using Base = ECCVMTranscriptRelationImpl<FF>;

    // This relation covers the first 27 transcript subrelations (indices 0..26). The final 5 subrelations
    // (OFFSET_GENERATOR_X/Y, MSM_INFINITY_*) are gated entirely by `msm_transition` and live in the separate
    // ECCVMTranscriptMsmTransitionShortRelation, which the prover skips on the (overwhelming majority of) rows where
    // msm_transition == 0. The base enum was ordered to place those 5 contiguously at the end so this split preserves
    // the global subrelation order (and hence the alpha batching) expected by the verifier.
    //
    // Tightened per-subrelation partial lengths. LAMBDA_RELATION / ACCUMULATOR_X/Y_UPDATE / ACCUMULATOR_EMPTY_UPDATE
    // stay at length 8 so they can share promoted Accumulator-typed intermediates (result_is_lhs/rhs/inf,
    // opcode_is_zero). Other subrelations only share length-2 short views with the core block and can shrink to
    // their true degree+1.
    static constexpr size_t NUM_MAIN_SUBRELATIONS = Base::OFFSET_GENERATOR_X; // 27 (everything before the split)
    static constexpr std::array<size_t, NUM_MAIN_SUBRELATIONS> SUBRELATION_PARTIAL_LENGTHS{
        3, // Z1_ZERO_CHECK (deg 2)
        3, // Z2_ZERO_CHECK (deg 2)
        2, // OPCODE_WELL_FORMED (deg 1)
        5, // PC_UPDATE (deg 4)
        7, // MSM_COUNT_ZERO_AT_TRANSITION (deg 6)
        4, // MSM_TRANSITION (deg 3)
        3, // MSM_COUNT_ZERO_WHEN_NOT_MUL (deg 2)
        6, // MSM_COUNT_INCREMENT_ACROSS_ROWS (deg 5)
        3, // OPCODE_EXCLUSION (deg 2)
        6, // EQ_X_DIFF (deg 5)
        6, // EQ_Y_DIFF (deg 5)
        3, // BOUNDARY_ACCUMULATOR_EMPTY (deg 2)
        3, // BOUNDARY_MSM_COUNT_AND_PC (deg 2)
        7, // ON_CURVE_CHECK (deg 6)
        8, // LAMBDA_RELATION (deg 7)
        8, // ACCUMULATOR_X_UPDATE (deg 7)
        8, // ACCUMULATOR_Y_UPDATE (deg 7)
        8, // ACCUMULATOR_EMPTY_UPDATE (keep at 8 to share opcode_is_zero / result_is_infinity_short)
        6, // ADD_X_EQUAL_CHECK (deg 5)
        6, // ADD_Y_EQUAL_CHECK (deg 5)
        3, // HIDING_ROW_EQ (deg 2)
        3, // HIDING_ROW_RESET (deg 2)
        3, // INFINITY_BASE_PX (deg 2)
        3, // INFINITY_BASE_PY (deg 2)
        3, // INFINITY_ACC_X (deg 2)
        3, // INFINITY_ACC_Y (deg 2)
        3, // ACCUMULATOR_NOT_EMPTY_INIT (deg 2)
    };
    static_assert(NUM_MAIN_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    // Skip rows on which every one of the 27 main subrelations contributes the identically-zero polynomial.
    //
    // Predicate: skip iff the sum of these wires is_zero(): transcript_op, transcript_msm_transition,
    // transcript_msm_count, transcript_accumulator_not_empty, transcript_accumulator_x, transcript_accumulator_y,
    // lagrange_first, lagrange_second, lagrange_third, lagrange_last. On a non-randomised row each summand is a
    // boolean, region, or coordinate wire that is genuinely 0 on the honest trailing-padding rows, so the sum is 0 iff
    // each is individually 0. The four lagranges live on disjoint single rows, so they never cancel each other. On the
    // row-disabled rows the wires are randomised, so the sum is nonzero w.h.p. and those rows are never skipped (same
    // reasoning as the existing ECCVM skips).
    //
    // EVERY boundary lagrange that gates a subrelation is included: lagrange_first gates ACCUMULATOR_NOT_EMPTY_INIT;
    // lagrange_second gates HIDING_ROW_EQ and HIDING_ROW_RESET and the is_not_hiding_row factor in the eq and on-curve
    // checks; lagrange_third gates BOUNDARY_ACCUMULATOR_EMPTY and BOUNDARY_MSM_COUNT_AND_PC; lagrange_last gates the pc
    // term of BOUNDARY_MSM_COUNT_AND_PC. Omitting lagrange_third was the bug in a prior naive port: it wrongly skipped
    // the first real-op row (row 2).
    //
    // Per-subrelation soundness when the predicate fires. On such a row op == 0, which via OPCODE_WELL_FORMED forces
    // all four opcode selectors q_add, q_mul, q_eq, q_reset to 0; also msm_transition == 0, msm_count == 0,
    // accumulator_not_empty == 0 (so is_accumulator_empty == 1), accumulator_x == accumulator_y == 0, and all four
    // lagranges == 0.
    //   - Selector- and region-gated subrelations (PC_UPDATE, MSM_COUNT_ZERO_AT_TRANSITION, MSM_TRANSITION,
    //     MSM_COUNT_ZERO_WHEN_NOT_MUL, MSM_COUNT_INCREMENT_ACROSS_ROWS, OPCODE_EXCLUSION, the two eq-diff checks,
    //     ON_CURVE_CHECK, LAMBDA_RELATION, the two add-equal checks): every term carries a factor among q_add, q_mul,
    //     q_eq, q_reset, msm_transition, any_add_is_active (q_add plus msm_transition), msm_count, or is_not_first_row,
    //     all 0 here. OPCODE_WELL_FORMED equals (8 q_add plus 4 q_mul plus 2 q_eq plus q_reset) minus op, which is 0.
    //   - Boundary-lagrange-gated subrelations (BOUNDARY_ACCUMULATOR_EMPTY, BOUNDARY_MSM_COUNT_AND_PC, HIDING_ROW_EQ,
    //     HIDING_ROW_RESET, ACCUMULATOR_NOT_EMPTY_INIT): the gating lagrange is 0.
    //   - INFINITY_ACC_X and INFINITY_ACC_Y equal is_accumulator_empty times an accumulator coordinate, which is 0
    //     since the coordinate is 0. INFINITY_BASE_PX, INFINITY_BASE_PY and the two z-zero checks vanish because honest
    //     padding sets base_x, base_y, z1, z2 all to 0.
    //   - The persistent-accumulator subrelations ACCUMULATOR_X_UPDATE, ACCUMULATOR_Y_UPDATE and
    //     ACCUMULATOR_EMPTY_UPDATE reduce, once all selectors and any_add_is_active and the propagate flag are 0, to
    //     out_coord times opcode_is_zero and opcode_is_zero times (1 minus is_accumulator_empty_shift), with
    //     opcode_is_zero == 1. These read the SHIFTED accumulator wires (transcript_accumulator_x_shift,
    //     transcript_accumulator_y_shift, transcript_accumulator_not_empty_shift). Soundness here rests on the
    //     trailing-padding geometry in ECCVMFlavor::ProverPolynomials: transcript content occupies a contiguous prefix
    //     ending at the finalize row, after which all transcript wires are virtual zeros up to lagrange_last. A skipped
    //     row lies strictly inside that trailing zero block: the finalize row is never skipped because its accumulator
    //     coordinates and not_empty flag appear in the predicate, and the last real-op row precedes the finalize row
    //     and has op nonzero. Hence a skipped row's successor is also a zero or empty row, so every shifted accumulator
    //     wire is 0 there and these subrelations vanish.
    //
    // Correctness is checked end-to-end by ECCVMTests.ShortMonomialProverVerifies: a wrongly-skipped live row would
    // desynchronise the prover's sumcheck round polynomials from the verifier's recomputation.
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.transcript_op + in.transcript_msm_transition + in.transcript_msm_count +
                in.transcript_accumulator_not_empty + in.transcript_accumulator_x + in.transcript_accumulator_y +
                in.lagrange_first + in.lagrange_second + in.lagrange_third + in.lagrange_last)
            .is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMTranscriptShortRelation = Relation<ECCVMTranscriptShortRelationImpl<FF>>;

} // namespace bb
