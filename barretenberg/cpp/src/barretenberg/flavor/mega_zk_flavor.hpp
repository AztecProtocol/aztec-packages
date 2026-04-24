// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"

namespace bb {

/**
 * @brief Child class of MegaFlavor that runs with ZK Sumcheck.
 *
 * @details MegaZKFlavor enables ZK sumcheck (Libra masking, row-disabling, extended relation degree)
 * but does NOT include a Gemini masking polynomial in its entities. In the batched Chonk context,
 * the translator's masking polynomial (sized at 2^17 = joint circuit size) serves as the single
 * Gemini masking polynomial for the joint PCS.
 */
class MegaZKFlavor : public bb::MegaFlavor {
  public:
    // MegaZK is only used in production to prove the Hiding Kernel
    static constexpr size_t VIRTUAL_LOG_N = HIDING_KERNEL_LOG_N;

    // Indicates that this flavor runs with ZK Sumcheck.
    static constexpr bool HasZK = true;

    // MegaZK does not include a Gemini masking polynomial in its entities; the translator provides one
    // at the correct joint circuit size in the batched Chonk flow.
    static constexpr bool HasGeminiMasking = false;

    // Extend MegaFlavor's relation set with `MegaEccOpBoundaryRelation` to enforce `ecc_op_wire_j(x) = 0` on rows 0..3.
    template <typename FF>
    using Relations_ = decltype(std::tuple_cat(std::declval<MegaFlavor::Relations_<FF>>(),
                                               std::declval<std::tuple<MegaEccOpBoundaryRelation<FF>>>()));
    using Relations = Relations_<FF>;

    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    // +1 for the pow-β factor, +1 for the Row Disabling Polynomial.
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 2;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to MegaZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");

    // Shplemini's remove_repeated_commitments uses offset = HasZK ? 2 : 1. Since MegaZK has HasZK=true
    // but no masking poly in its entities, the offset is 1 larger than the actual entity layout.
    // Compensate by shifting indices by -1 relative to MegaFlavor's REPEATED_COMMITMENTS.
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData(
        NUM_PRECOMPUTED_ENTITIES - 1, NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES - 1, NUM_SHIFTED_ENTITIES);

    // Size of the final PCS MSM for ZK = non-ZK size + NUM_LIBRA_COMMITMENTS (3)
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_LIBRA_COMMITMENTS;
    }

    using Transcript = NativeTranscript;
    using VKAndHash = MegaFlavor::VKAndHash;
};

} // namespace bb
