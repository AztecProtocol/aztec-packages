// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to the "native" Mega flavor.
 * @details This flavor can be used to instantiate a recursive Ultra Honk verifier for a proof created using the
 * Mega flavor. It is similar in structure to its native counterpart with two main differences: 1) the
 * curve types are stdlib types (e.g. field_t instead of field) and 2) it does not specify any Prover related types
 * (e.g. Polynomial, ExtendedEdges, etc.) since we do not emulate prover computation in circuits, i.e. it only makes
 * sense to instantiate a Verifier with this flavor.
 *
 * @note Unlike conventional flavors, "recursive" flavors are templated by a builder (much like native vs stdlib types).
 * This is because the flavor itself determines the details of the underlying verifier algorithm (i.e. the set of
 * relations), while the Builder determines the arithmetization of that algorithm into a circuit.
 *
 * @tparam BuilderType Determines the arithmetization of the verifier circuit defined based on this flavor.
 */
template <typename BuilderType> class MegaRecursiveFlavor_ {
  public:
    using CircuitBuilder = BuilderType; // Determines arithmetization of circuit instantiated with this flavor
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = MegaFlavor;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    static constexpr size_t VIRTUAL_LOG_N = MegaFlavor::VIRTUAL_LOG_N;
    // indicates when evaluating sumcheck, edges can be left as degree-1 monomials
    static constexpr bool USE_SHORT_MONOMIALS = MegaFlavor::USE_SHORT_MONOMIALS;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = MegaFlavor::USE_PADDING;
    static constexpr size_t INTERLEAVING_BATCH_SIZE = MegaFlavor::INTERLEAVING_BATCH_SIZE;
    static constexpr size_t INTERLEAVING_LOG_K = MegaFlavor::INTERLEAVING_LOG_K;
    static constexpr size_t NUM_WIRES = MegaFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = MegaFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = MegaFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = MegaFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaFlavor::NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaFlavor::NUM_UNSHIFTED_ENTITIES;

    // define the tuple of Relations that comprise the Sumcheck relation
    // Reuse the Relations from Mega
    using Relations = MegaFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return MegaFlavor::FINAL_PCS_MSM_SIZE(log_n);
    };
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = MegaFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // A challenge whose powers are used to batch subrelation contributions during Sumcheck
    static constexpr size_t NUM_SUBRELATIONS = MegaFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparator = FF;

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials evaluated
     * at one point.
     */
    class AllValues : public MegaFlavor::AllEntities<FF> {
      public:
        using Base = MegaFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   NativeFlavor::PrecomputedEntities<Commitment>,
                                                   NativeFlavor::VerificationKey>;

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = MegaFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = MegaFlavor::CommitmentLabels;
    // Reuse the VerifierCommitments from Mega
    using VerifierCommitments = MegaFlavor::VerifierCommitments_<Commitment, VerificationKey>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

/**
 * @brief Recursive counterpart to MultiMegaFlavor with interleaved commitments.
 * @details Handles interleaved witness/precomputed commitments and Lagrange basis evaluation batching.
 */
template <typename BuilderType> class MultiMegaRecursiveFlavor_ : public MegaRecursiveFlavor_<BuilderType> {
  public:
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = MultiMegaFlavor;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    // Inherit interleaving parameters from native flavor
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

    // Labels are string-based and can be inherited directly from the native flavor
    using InterleavedCommitmentLabels = typename NativeFlavor::InterleavedCommitmentLabels;
    using CommitmentLabels = typename NativeFlavor::CommitmentLabels;
    static constexpr bool USE_PADDING = NativeFlavor::USE_PADDING;

    // BATCHED_RELATION_PARTIAL_LENGTH must match native flavor
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = BATCHED_RELATION_PARTIAL_LENGTH + 1;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NativeFlavor::FINAL_PCS_MSM_SIZE(log_n);
    }

    // Reuse native flavor's InterleavedWitnessCommitments template
    template <typename DataType>
    using InterleavedWitnessCommitments = NativeFlavor::InterleavedWitnessCommitments_<DataType, HasZK>;
    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;

    template <typename DataType_>
    using InterleavedPrecomputedCommitments = NativeFlavor::InterleavedPrecomputedCommitments<DataType_>;
    using InterleavedPrecomputed = InterleavedPrecomputedCommitments<Commitment>;

    class AllValues : public MegaFlavor::AllEntities_<FF, HasZK> {
      public:
        using Base = MegaFlavor::AllEntities_<FF, HasZK>;
        using Base::Base;
    };

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   InterleavedPrecomputedCommitments<Commitment>,
                                                   NativeFlavor::VerificationKey>;

    using VerifierCommitments = MegaFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;

    // Forward compute_lagrange_basis to native flavor
    template <typename FF_> static auto compute_lagrange_basis(const FF_& u0, const FF_& u1)
    {
        return NativeFlavor::compute_lagrange_basis(u0, u1);
    }

    // Forward static group methods to the native flavor
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
