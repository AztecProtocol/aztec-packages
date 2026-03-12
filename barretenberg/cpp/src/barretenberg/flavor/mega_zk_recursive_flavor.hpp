// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to MegaZKFlavor.
 * @details Adds ZK overrides (HasZK, BATCHED_RELATION_PARTIAL_LENGTH, AllValues with masking entities)
 * on top of MegaRecursiveFlavor_.
 */
template <typename BuilderType> class MegaZKRecursiveFlavor_ : public MegaRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = MegaZKFlavor;
    using Commitment = typename MegaRecursiveFlavor_<BuilderType>::Commitment;
    using VerificationKey = typename MegaRecursiveFlavor_<BuilderType>::VerificationKey;
    using FF = typename MegaRecursiveFlavor_<BuilderType>::FF;

    static constexpr bool HasZK = true;

    // Get constants from NativeFlavor to ensure consistency
    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NativeFlavor::FINAL_PCS_MSM_SIZE(log_n);
    }

    // Override to include ZK entities
    class AllValues : public MegaFlavor::AllEntities_<FF, HasZK> {
      public:
        using Base = MegaFlavor::AllEntities_<FF, HasZK>;
        using Base::Base;
    };

    using VerifierCommitments = MegaFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;
};

/**
 * @brief Recursive counterpart to MultiMegaZKFlavor with interleaved commitments and ZK.
 * @details Used to instantiate a recursive verifier for ZK proofs created using MultiMegaZKFlavor
 * (the hiding kernel in Chonk IVC).
 */
template <typename BuilderType> class MultiMegaZKRecursiveFlavor_ : public MultiMegaRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = MultiMegaZKFlavor;
    using Commitment = typename MultiMegaRecursiveFlavor_<BuilderType>::Commitment;
    using VerificationKey = typename MultiMegaRecursiveFlavor_<BuilderType>::VerificationKey;
    using FF = typename MultiMegaRecursiveFlavor_<BuilderType>::FF;

    static constexpr bool HasZK = true;

    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NativeFlavor::NUM_UNSHIFTED_ENTITIES;

    static constexpr size_t INTERLEAVING_BATCH_SIZE = NativeFlavor::INTERLEAVING_BATCH_SIZE;
    static constexpr size_t INTERLEAVING_LOG_K = NativeFlavor::INTERLEAVING_LOG_K;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = NativeFlavor::NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS =
        NativeFlavor::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS = NativeFlavor::NUM_ALL_INTERLEAVED_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = NativeFlavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;

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

    using VerifierCommitments = MultiMegaFlavor::VerifierCommitments_<Commitment, VerificationKey, true>;

    using InterleavedCommitments = typename MultiMegaFlavor::template InterleavedWitnessCommitments_<Commitment, true>;
    using InterleavedCommitmentLabels = typename NativeFlavor::InterleavedCommitmentLabels;
    using InterleavedPrecomputed = typename MultiMegaRecursiveFlavor_<BuilderType>::InterleavedPrecomputed;

    template <typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        return NativeFlavor::get_unshifted_groups(e);
    }
    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        return NativeFlavor::get_to_be_shifted_groups(e);
    }
    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        return NativeFlavor::get_shifted_groups(e);
    }
};

} // namespace bb
