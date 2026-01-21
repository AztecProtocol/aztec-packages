// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"

namespace bb {

/**
 * @brief The recursive counterpart of the native Translator flavor.
 * @details is flavor can be used to instantiate a recursive Translator verifier for a proof created using the
 * Translator flavor. It is similar in structure to its native counterpart with two main differences: 1) the
 * curve types are stdlib types (e.g. field_t instead of field) and 2) it does not specify any Prover related types
 * (e.g. Polynomial, ExtendedEdges, etc.) since we do not emulate prover computation in circuits, i.e. it only makes
 * sense to instantiate a Verifier with this flavor. We reuse the native flavor to initialize identical  constructions.
 * @tparam BuilderType Determines the arithmetization of the verifier circuit defined based on this flavor.
 */
class TranslatorRecursiveFlavor {

  public:
    using CircuitBuilder = UltraCircuitBuilder;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using FF = Curve::ScalarField;
    using BF = Curve::BaseField;
    static constexpr size_t NUM_SUBRELATIONS = TranslatorFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    using NativeFlavor = TranslatorFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;

    using VerifierCommitmentKey = bb::VerifierCommitmentKey<NativeFlavor::Curve>;

    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = true;
    // Translator proof size and its recursive verifier circuit are genuinely fixed, hence no padding is needed.
    static constexpr bool USE_PADDING = TranslatorFlavor::USE_PADDING;
    // None of this parameters can be changed

    // Number of bits in a binary limb
    // This is not a configurable value. Relations are sepcifically designed for it to be 68
    static constexpr size_t NUM_LIMB_BITS = NativeFlavor::NUM_LIMB_BITS;

    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We
    // often need containers of this size to hold related data, so we choose a name more agnostic than
    // `NUM_POLYNOMIALS`. Note: this number does not include the individual sorted list polynomials.
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = NativeFlavor::NUM_PRECOMPUTED_ENTITIES;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;

    // Number of wires representing the op queue whose commitments are going to be checked against those from the
    // final round of merge
    static constexpr size_t NUM_OP_QUEUE_WIRES = NativeFlavor::NUM_OP_QUEUE_WIRES;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;

    using Relations = TranslatorFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    /**
     * @brief A field element for each entity of the flavor.  These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public TranslatorFlavor::AllEntities<FF> {
      public:
        using Base = TranslatorFlavor::AllEntities<FF>;
        using Base::Base;
    };
    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witness)
     * polynomials used by the verifier.
     */
    using VerificationKey =
        FixedStdlibVKAndHash_<CircuitBuilder, TranslatorFlavor::PrecomputedEntities<Commitment>, NativeVerificationKey>;

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = TranslatorFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = TranslatorFlavor::CommitmentLabels;
    // Reuse the VerifierCommitments from Translator
    using VerifierCommitments = TranslatorFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    // Reuse the transcript from Translator
    using Transcript = UltraStdlibTranscript;

    using VKAndHash = VKAndHash_<VerificationKey, FF>;
};
} // namespace bb
