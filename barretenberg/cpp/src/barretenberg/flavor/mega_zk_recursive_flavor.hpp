// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/relations/mega_offset_boundary_relation.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to MegaZKFlavor.
 * @details Adds ZK overrides (HasZK, BATCHED_RELATION_PARTIAL_LENGTH) on top of MegaRecursiveFlavor_.
 * Entities are the same as MegaRecursiveFlavor_ (no Gemini masking polynomial).
 */
template <typename BuilderType> class MegaZKRecursiveFlavor_ : public MegaRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = MegaZKFlavor;
    using Commitment = typename MegaRecursiveFlavor_<BuilderType>::Commitment;
    using VerificationKey = typename MegaRecursiveFlavor_<BuilderType>::VerificationKey;
    using FF = typename MegaRecursiveFlavor_<BuilderType>::FF;

    static constexpr bool HasZK = true;
    static constexpr bool HasGeminiMasking = false;

    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;

    // Match MegaZKFlavor: append the ecc-op offset-boundary relation so the recursive
    // verifier accumulates the same relation set as the native prover.
    using Relations = decltype(std::tuple_cat(std::declval<MegaFlavor::Relations_<FF>>(),
                                              std::declval<std::tuple<MegaEccOpBoundaryRelation<FF>>>()));

    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NativeFlavor::FINAL_PCS_MSM_SIZE(log_n);
    }
};

} // namespace bb
