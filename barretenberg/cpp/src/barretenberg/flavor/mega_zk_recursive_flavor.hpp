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

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NativeFlavor::FINAL_PCS_MSM_SIZE(log_n);
    }
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
    static constexpr bool HasGeminiMasking = false;

    // VIRTUAL_LOG_N differs from parent (HIDING_KERNEL_LOG_N vs CONST_FOLDING_LOG_N)
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

    // Use false for masking parameter — MegaZK has no masking entities (translator provides masking)
    using VerifierCommitments = MultiMegaFlavor::VerifierCommitments_<Commitment, VerificationKey, false>;
    using InterleavedPrecomputed = typename MultiMegaRecursiveFlavor_<BuilderType>::InterleavedPrecomputed;
};

/**
 * @brief Recursive counterpart to DualMegaZKFlavor (BS=2 interleaved + ZK).
 */
template <typename BuilderType> class DualMegaZKRecursiveFlavor_ : public DualMegaRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = DualMegaZKFlavor;
    using Commitment = typename DualMegaRecursiveFlavor_<BuilderType>::Commitment;
    using VerificationKey = typename DualMegaRecursiveFlavor_<BuilderType>::VerificationKey;
    using FF = typename DualMegaRecursiveFlavor_<BuilderType>::FF;

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

    // Use false for masking parameter — MegaZK has no masking entities (translator provides masking)
    using VerifierCommitments = DualMegaFlavor::VerifierCommitments_<Commitment, VerificationKey, false>;
    using InterleavedPrecomputed = typename DualMegaRecursiveFlavor_<BuilderType>::InterleavedPrecomputed;
};

} // namespace bb
