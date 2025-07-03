// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"

namespace bb {

/**
 * @brief The recursive counterpart of the native Translator flavor.
 * @details is flavor can be used to instantiate a recursive Translator verifier for a proof created using the
 * Translator flavor. It is similar in structure to its native counterpart with two main differences: 1) the
 * curve types are stdlib types (e.g. field_t instead of field) and 2) it does not specify any Prover related types
 * (e.g. Polynomial, ExtendedEdges, etc.) since we do not emulate prover computation in circuits, i.e. it only makes
 * sense to instantiate a Verifier with this flavor. We reuse the native flavor to initialise identical  constructions.
 * @tparam BuilderType Determines the arithmetization of the verifier circuit defined based on this flavor.
 */
template <typename BuilderType> class TranslatorRecursiveFlavor_ {

  public:
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/990): Establish whether mini_circuit_size pattern is
    // needed
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using FF = Curve::ScalarField;
    using BF = Curve::BaseField;
    using RelationSeparator = FF;

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
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // define the containers for storing the contributions from each relation in Sumcheck
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

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
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to
     * resolve that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for
     * portability of our circuits.
     */
    class VerificationKey
        : public StdlibVerificationKey_<BuilderType, TranslatorFlavor::PrecomputedEntities<Commitment>> {
      public:
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1324): Remove `circuit_size` and
            // `log_circuit_size` from MSGPACK and the verification key.
            this->circuit_size = FF{ 1UL << TranslatorFlavor::CONST_TRANSLATOR_LOG_N };
            this->circuit_size.convert_constant_to_fixed_witness(builder);
            this->log_circuit_size = FF{ uint64_t(TranslatorFlavor::CONST_TRANSLATOR_LOG_N) };
            this->log_circuit_size.convert_constant_to_fixed_witness(builder);
            this->num_public_inputs = FF::from_witness(builder, native_key->num_public_inputs);
            this->pub_inputs_offset = FF::from_witness(builder, native_key->pub_inputs_offset);

            for (auto [native_comm, comm] : zip_view(native_key->get_all(), this->get_all())) {
                comm = Commitment::from_witness(builder, native_comm);
            }
        }
    };

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = TranslatorFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = TranslatorFlavor::CommitmentLabels;
    // Reuse the VerifierCommitments from Translator
    using VerifierCommitments = TranslatorFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    // Reuse the transcript from Translator
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;

    using VKAndHash = VKAndHash_<VerificationKey, FF>;
};
} // namespace bb
