// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to UltraZKFlavor (BS=1).
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
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;

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

    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;
};

/**
 * @brief Recursive counterpart to DualUltraZKFlavor (BS=2 interleaved + ZK).
 */
template <typename BuilderType> class DualUltraZKRecursiveFlavor_ : public DualUltraRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = DualUltraZKFlavor;
    using Commitment = typename DualUltraRecursiveFlavor_<BuilderType>::Commitment;
    using VerificationKey = typename DualUltraRecursiveFlavor_<BuilderType>::VerificationKey;
    using FF = typename DualUltraRecursiveFlavor_<BuilderType>::FF;

    static constexpr bool HasZK = true;
    static constexpr bool HasGeminiMasking = false;

    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NativeFlavor::FINAL_PCS_MSM_SIZE(log_n);
    }

    class AllValues : public NativeFlavor::template AllEntities<FF> {
      public:
        using Base = NativeFlavor::template AllEntities<FF>;
        using Base::Base;
    };

    using VerifierCommitments = DualUltraFlavor::VerifierCommitments_<Commitment, VerificationKey, false>;
    using InterleavedPrecomputed = typename DualUltraRecursiveFlavor_<BuilderType>::InterleavedPrecomputed;
};

} // namespace bb
