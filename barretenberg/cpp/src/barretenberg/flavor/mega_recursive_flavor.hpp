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
    static constexpr size_t NUM_WIRES = MegaFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = MegaFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = MegaFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = MegaFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaFlavor::NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr bool HasDataBus = MegaFlavor::HasDataBus;
    static constexpr size_t NUM_BUS_COLUMNS = MegaFlavor::NUM_BUS_COLUMNS;
    // Per-relation capability bools — see flavor-codegen `RELATION_CAPABILITY_BOOLS`.
    static constexpr bool HasLogDerivLookup = MegaFlavor::HasLogDerivLookup;
    static constexpr bool HasElliptic = MegaFlavor::HasElliptic;
    static constexpr bool HasMemory = MegaFlavor::HasMemory;
    static constexpr bool HasNonNativeField = MegaFlavor::HasNonNativeField;
    static constexpr bool HasEccOpQueue = MegaFlavor::HasEccOpQueue;
    static constexpr bool UsesEtaPowers = MegaFlavor::UsesEtaPowers;
    static constexpr bool UsesBetaPowers = MegaFlavor::UsesBetaPowers;

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
    static const CommitmentLabels& commitment_labels() { return MegaFlavor::commitment_labels(); }

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
