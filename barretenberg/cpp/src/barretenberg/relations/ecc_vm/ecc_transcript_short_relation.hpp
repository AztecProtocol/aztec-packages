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

    // Tightened per-subrelation partial lengths. LAMBDA_RELATION / ACCUMULATOR_X/Y_UPDATE / ACCUMULATOR_EMPTY_UPDATE
    // stay at length 8 so they can share promoted Accumulator-typed intermediates (result_is_lhs/rhs/inf,
    // opcode_is_zero). Other subrelations only share length-2 short views with the core block and can shrink to
    // their true degree+1.
    static constexpr std::array<size_t, Base::NUM_SUBRELATIONS> SUBRELATION_PARTIAL_LENGTHS{
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
        6, // OFFSET_GENERATOR_X (deg 5)
        6, // OFFSET_GENERATOR_Y (deg 5)
        4, // MSM_INFINITY_X_DIFF (deg 3)
        4, // MSM_INFINITY_Y_SUM (deg 3)
        5, // MSM_INFINITY_INVERSE (deg 4)
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
    static_assert(Base::NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMTranscriptShortRelation = Relation<ECCVMTranscriptShortRelationImpl<FF>>;

} // namespace bb
