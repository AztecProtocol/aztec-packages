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

/**
 * @brief The msm_transition-gated tail of the ECCVM transcript relation, split out for prover-side skipping.
 *
 * @details The offset-generator subtraction and MSM-infinity checks (transcript subrelations OFFSET_GENERATOR_X/Y,
 * MSM_INFINITY_X_DIFF/Y_SUM/INVERSE) are each multiplied by `msm_transition`, which is 1 on at most one row per MSM.
 * They are grouped contiguously at the end of the base transcript subrelation enum (indices 27..31) so that pulling
 * them into this separate short relation preserves the global subrelation ordering — and therefore the alpha batching
 * — expected by the (monolithic) verifier. The prover then skips this relation entirely on the (overwhelming
 * majority of) edge-pairs where `msm_transition` is identically zero.
 *
 * This is a prover-only optimization: a wrong skip would make the prover's round univariate inconsistent and the proof
 * would fail to verify, but it can never affect soundness.
 */
template <typename FF_> class ECCVMTranscriptMsmTransitionShortRelationImpl {
  public:
    using FF = FF_;

    // Local subrelation indices; map in order onto base transcript subrelations 27..31.
    enum SubrelationIndex : size_t {
        OFFSET_GENERATOR_X = 0,
        OFFSET_GENERATOR_Y = 1,
        MSM_INFINITY_X_DIFF = 2,
        MSM_INFINITY_Y_SUM = 3,
        MSM_INFINITY_INVERSE = 4,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 5> SUBRELATION_PARTIAL_LENGTHS{
        6, // OFFSET_GENERATOR_X (deg 5)
        6, // OFFSET_GENERATOR_Y (deg 5)
        4, // MSM_INFINITY_X_DIFF (deg 3)
        4, // MSM_INFINITY_Y_SUM (deg 3)
        5, // MSM_INFINITY_INVERSE (deg 4)
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    /**
     * @brief Skip when `msm_transition` vanishes on both rows of the edge-pair — every subrelation here is gated by it.
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.transcript_msm_transition.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF>
using ECCVMTranscriptMsmTransitionShortRelation = Relation<ECCVMTranscriptMsmTransitionShortRelationImpl<FF>>;

} // namespace bb
