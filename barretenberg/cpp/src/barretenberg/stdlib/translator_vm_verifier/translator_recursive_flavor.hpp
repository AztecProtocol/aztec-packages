// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
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

    // Indicates that this flavor runs with ZK Sumcheck.
    static constexpr bool HasZK = true;

    // Number of bits in a binary limb
    // This is not a configurable value. Relations are specifically designed for it to be 68
    static constexpr size_t NUM_LIMB_BITS = NativeFlavor::NUM_LIMB_BITS;

    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts).
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;

    // Mid-sumcheck minicircuit wire evaluation constants
    static constexpr size_t NUM_MINICIRCUIT_EVALUATIONS = NativeFlavor::NUM_MINICIRCUIT_EVALUATIONS;
    static constexpr size_t NUM_FULL_CIRCUIT_EVALUATIONS = NativeFlavor::NUM_FULL_CIRCUIT_EVALUATIONS;
    static constexpr size_t LOG_MINI_CIRCUIT_SIZE = NativeFlavor::LOG_MINI_CIRCUIT_SIZE;

    template <typename FFType>
    static void set_minicircuit_evaluations(NativeFlavor::AllEntities<FFType>& evals,
                                            const std::array<FFType, NUM_MINICIRCUIT_EVALUATIONS>& mid)
    {
        NativeFlavor::set_minicircuit_evaluations(evals, mid);
    }

    template <typename FFType>
    static void complete_full_circuit_evaluations(NativeFlavor::AllEntities<FFType>& evals,
                                                  const std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS>& full_circuit,
                                                  std::span<const FFType> challenge)
    {
        NativeFlavor::complete_full_circuit_evaluations(evals, full_circuit, challenge);
    }

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
        FixedStdlibVKAndHash_<CircuitBuilder, TranslatorFlavor::VKEntities<Commitment>, NativeVerificationKey>;

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = TranslatorFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = TranslatorFlavor::CommitmentLabels;
    // Reuse the VerifierCommitments from Translator
    using VerifierCommitments = TranslatorFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    using Transcript = UltraStdlibTranscript;
};
} // namespace bb
