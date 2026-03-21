#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/mega_v2_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb {

/**
 * @brief Recursive counterpart to MegaV2Flavor.
 *
 * @details Reuses all entity types from MegaV2Flavor but with stdlib commitment types.
 * Follows the exact same pattern as MegaRecursiveFlavor_ but based on MegaV2Flavor
 * (which adds poseidon2_op_wire columns, logup relation, and lagrange_poseidon2_op).
 */
template <typename BuilderType> class MegaV2RecursiveFlavor_ {
  public:
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = MegaV2Flavor;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    static constexpr size_t VIRTUAL_LOG_N = MegaV2Flavor::VIRTUAL_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = MegaV2Flavor::USE_SHORT_MONOMIALS;
    static constexpr bool HasZK = false;
    static constexpr bool USE_PADDING = MegaV2Flavor::USE_PADDING;
    static constexpr size_t NUM_WIRES = MegaV2Flavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = MegaV2Flavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = MegaV2Flavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = MegaV2Flavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaV2Flavor::NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaV2Flavor::NUM_UNSHIFTED_ENTITIES;

    using Relations = MegaV2Flavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return MegaV2Flavor::FINAL_PCS_MSM_SIZE(log_n);
    };
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = MegaV2Flavor::REPEATED_COMMITMENTS;

    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = MegaV2Flavor::NUM_SUBRELATIONS;
    using SubrelationSeparator = FF;

    class AllValues : public MegaV2Flavor::AllEntities<FF> {
      public:
        using Base = MegaV2Flavor::AllEntities<FF>;
        using Base::Base;
    };

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   NativeFlavor::PrecomputedEntities<Commitment>,
                                                   NativeFlavor::VerificationKey>;

    using WitnessCommitments = MegaV2Flavor::WitnessEntities<Commitment>;
    using CommitmentLabels = MegaV2Flavor::CommitmentLabels;
    using VerifierCommitments = MegaV2Flavor::VerifierCommitments_<Commitment, VerificationKey>;
    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
