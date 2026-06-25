// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/relations/ecc_vm/ecc_bools_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_short_monomial_relation_utils.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Transcript-family half of the ECCVM short-monomial booleanity checks.
 *
 * @details The monolithic ECCVMBoolsRelation checks 23 columns are boolean. The short-monomial flavor splits those
 * checks by subtable family so each half can carry a region skip. This half holds the 13 transcript-family checks
 * (base subrelation indices 0..12, in order), so that the concatenation of this relation followed by
 * ECCVMBoolsMsmShortRelation reproduces the verifier's monolithic 0..22 subrelation sequence (the alpha batching is
 * unchanged).
 */
template <typename FF_> class ECCVMBoolsTranscriptShortRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 13> SUBRELATION_PARTIAL_LENGTHS{ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 };

    /**
     * @brief Skip the transcript booleanity checks where every transcript boolean column is zero across the edge.
     *
     * @details Each check is `w * (w - 1)` with no shift, so its per-edge contribution is the zero polynomial exactly
     * when `w` is the constant 0 (or constant 1) linear edge. The summed-wire predicate is_zero() holds iff every
     * column in this group is zero at both edge endpoints, in which case each `w` is the zero linear edge and every
     * `w*(w-1)` vanishes. ECCVM keeps all ZK masking in the disabled head [0, TRACE_OFFSET), so off-region rows in the
     * skip-governed range are genuinely zero; a boundary edge (a zero row adjacent to an active row) has a non-zero
     * summed edge and is correctly not skipped. Same predicate shape as the transcript and wnaf short skips.
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.transcript_eq + in.transcript_add + in.transcript_mul + in.transcript_reset_accumulator +
                in.transcript_msm_transition + in.transcript_accumulator_not_empty + in.transcript_z1zero +
                in.transcript_z2zero + in.transcript_add_x_equal + in.transcript_add_y_equal +
                in.transcript_base_infinity + in.transcript_msm_infinity + in.transcript_msm_count_zero_at_transition)
            .is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

/**
 * @brief MSM/precompute-family half of the ECCVM short-monomial booleanity checks.
 *
 * @details Holds the 10 msm/precompute-family checks (base subrelation indices 13..22, in order). See
 * ECCVMBoolsTranscriptShortRelationImpl for the split rationale and the skip soundness argument.
 */
template <typename FF_> class ECCVMBoolsMsmShortRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 10> SUBRELATION_PARTIAL_LENGTHS{ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 };

    /**
     * @brief Skip the msm/precompute booleanity checks where every column in this group is zero across the edge.
     *
     * @details Same argument as ECCVMBoolsTranscriptShortRelationImpl::skip.
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.msm_transition + in.precompute_point_transition + in.msm_add + in.msm_double + in.msm_skew +
                in.precompute_select + in.msm_add1 + in.msm_add2 + in.msm_add3 + in.msm_add4)
            .is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMBoolsTranscriptShortRelation = Relation<ECCVMBoolsTranscriptShortRelationImpl<FF>>;

template <typename FF> using ECCVMBoolsMsmShortRelation = Relation<ECCVMBoolsMsmShortRelationImpl<FF>>;

} // namespace bb
