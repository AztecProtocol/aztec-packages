// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to the "native" Ultra flavor (BS=1).
 */
template <typename BuilderType> class UltraRecursiveFlavor_ {
  public:
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using NativeFlavor = UltraFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    static constexpr size_t VIRTUAL_LOG_N = UltraFlavor::VIRTUAL_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = UltraFlavor::USE_SHORT_MONOMIALS;
    static constexpr bool HasZK = false;
    static constexpr bool USE_PADDING = UltraFlavor::USE_PADDING;
    static constexpr size_t INTERLEAVING_BATCH_SIZE = UltraFlavor::INTERLEAVING_BATCH_SIZE;
    static constexpr size_t INTERLEAVING_LOG_K = UltraFlavor::INTERLEAVING_LOG_K;
    static constexpr size_t NUM_WIRES = UltraFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = UltraFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = UltraFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = UltraFlavor::NUM_WITNESS_ENTITIES;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return UltraFlavor::FINAL_PCS_MSM_SIZE(log_n);
    };
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = UltraFlavor::REPEATED_COMMITMENTS;
    using OinkRounds = UltraFlavor::OinkRounds;

    // Group accessors delegate to UltraGroupAccessors_ (BS=1)
    template <typename FF_> static auto compute_lagrange_basis(std::span<const FF_> challenges)
    {
        return compute_lagrange_basis_impl<INTERLEAVING_BATCH_SIZE>(challenges);
    }

    template <typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        return UltraGroupAccessors_<INTERLEAVING_BATCH_SIZE>::template get_unshifted_groups<true>(e);
    }

    template <typename Entities> static auto get_unshifted_groups_mut(Entities& e)
    {
        return UltraGroupAccessors_<INTERLEAVING_BATCH_SIZE>::template get_unshifted_groups<false>(e);
    }

    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        return UltraGroupAccessors_<INTERLEAVING_BATCH_SIZE>::get_to_be_shifted_groups(e);
    }

    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        return UltraGroupAccessors_<INTERLEAVING_BATCH_SIZE>::get_shifted_groups(e);
    }

    using Relations = UltraFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    static constexpr size_t NUM_SUBRELATIONS = NativeFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparator = FF;

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   NativeFlavor::PrecomputedEntities<Commitment>,
                                                   typename NativeFlavor::VerificationKey>;

    class AllValues : public UltraFlavor::AllEntities<FF> {
      public:
        using Base = UltraFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using CommitmentLabels = UltraFlavor::CommitmentLabels;
    using WitnessCommitments = UltraFlavor::WitnessEntities<Commitment>;
    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

/**
 * @brief Recursive counterpart to DualUltraFlavor (BS=2 interleaved).
 */
template <typename BuilderType> class DualUltraRecursiveFlavor_ : public UltraRecursiveFlavor_<BuilderType> {
  public:
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = DualUltraFlavor;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    static constexpr size_t INTERLEAVING_BATCH_SIZE = NativeFlavor::INTERLEAVING_BATCH_SIZE;
    static constexpr size_t INTERLEAVING_LOG_K = NativeFlavor::INTERLEAVING_LOG_K;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = NativeFlavor::NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS =
        NativeFlavor::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS = NativeFlavor::NUM_ALL_INTERLEAVED_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = NativeFlavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;

    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NativeFlavor::NUM_UNSHIFTED_ENTITIES;

    static constexpr bool HasZK = false;

    using InterleavedCommitmentLabels = typename NativeFlavor::InterleavedCommitmentLabels;
    using CommitmentLabels = typename NativeFlavor::CommitmentLabels;
    static constexpr bool USE_PADDING = NativeFlavor::USE_PADDING;

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = BATCHED_RELATION_PARTIAL_LENGTH - 1;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NativeFlavor::FINAL_PCS_MSM_SIZE(log_n);
    }

    template <typename DataType>
    using InterleavedWitnessCommitments = NativeFlavor::InterleavedWitnessCommitments_<DataType>;
    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;

    template <typename DataType_>
    using InterleavedPrecomputedCommitments = NativeFlavor::InterleavedPrecomputedCommitments<DataType_>;
    using InterleavedPrecomputed = InterleavedPrecomputedCommitments<Commitment>;

    class AllValues : public UltraFlavor::AllEntities_<FF, HasZK> {
      public:
        using Base = UltraFlavor::AllEntities_<FF, HasZK>;
        using Base::Base;
    };

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   InterleavedPrecomputedCommitments<Commitment>,
                                                   NativeFlavor::VerificationKey>;

    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;
    using OinkRounds = NativeFlavor::OinkRounds;

    template <typename FF_> static auto compute_lagrange_basis(std::span<const FF_> interleaving_challenges)
    {
        return NativeFlavor::compute_lagrange_basis(interleaving_challenges);
    }

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
