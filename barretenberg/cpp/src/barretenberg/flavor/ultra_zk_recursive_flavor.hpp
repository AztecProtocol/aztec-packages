// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to UltraZKFlavor.
 * @details Adds ZK overrides (HasZK, BATCHED_RELATION_PARTIAL_LENGTH, AllValues with masking entities)
 * on top of UltraRecursiveFlavor_.
 */
template <typename BuilderType> class UltraZKRecursiveFlavor_ : public UltraRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = UltraZKFlavor;
    using Commitment = typename UltraRecursiveFlavor_<BuilderType>::Commitment;
    using VerificationKey = typename UltraRecursiveFlavor_<BuilderType>::VerificationKey;
    using FF = typename UltraRecursiveFlavor_<BuilderType>::FF;

    static constexpr bool HasZK = true;

    // Get constants from NativeFlavor to ensure consistency
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = UltraRecursiveFlavor_<BuilderType>::VIRTUAL_LOG_N)
    {
        return NativeFlavor::FINAL_PCS_MSM_SIZE(log_n);
    }

    // Override to include ZK entities
    class AllValues : public UltraFlavor::AllEntities_<FF, HasZK> {
      public:
        using Base = UltraFlavor::AllEntities_<FF, HasZK>;
        using Base::Base;
    };

    static_assert(gemini_masking_layout_consistent<UltraZKRecursiveFlavor_>(),
                  "UltraZKRecursiveFlavor gemini masking flag must match its entity layout");
};

} // namespace bb
