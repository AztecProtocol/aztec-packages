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

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMTranscriptShortRelation = Relation<ECCVMTranscriptShortRelationImpl<FF>>;

} // namespace bb
