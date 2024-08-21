#pragma once
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"

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
    using NativeVerificationKey = NativeFlavor::VerificationKey;

    // Note(luke): Eventually this may not be needed at all
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<NativeFlavor::Curve>;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    static constexpr size_t NUM_WIRES = MegaFlavor::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    // Note: this number does not include the individual sorted list polynomials.
    static constexpr size_t NUM_ALL_ENTITIES = MegaFlavor::NUM_ALL_ENTITIES;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = MegaFlavor::NUM_PRECOMPUTED_ENTITIES;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = MegaFlavor::NUM_WITNESS_ENTITIES;

    // define the tuple of Relations that comprise the Sumcheck relation
    // Reuse the Relations from Mega
    using Relations = MegaFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t BATCHED_RELATION_TOTAL_LENGTH = MAX_TOTAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenge for each
    // subrelation. This is because using powers of alpha would increase the degree of Protogalaxy polynomial $G$ (the
    // combiner) to much.
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using RelationSeparator = std::array<FF, NUM_SUBRELATIONS - 1>;

    // define the container for storing the univariate contribution from each relation in Sumcheck
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials evaluated
     * at one point.
     */
    class AllValues : public MegaFlavor::AllEntities<FF> {
      public:
        using Base = MegaFlavor::AllEntities<FF>;
        using Base::Base;
    };
    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     * This differs from Mega in how we construct the commitments.
     */
    class VerificationKey
        : public VerificationKey_<MegaFlavor::PrecomputedEntities<Commitment>, VerifierCommitmentKey> {
      public:
        // Data pertaining to transfer of databus return data via public inputs of the proof
        DatabusPropagationData databus_propagation_data;

        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
        {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/983): Think about if these should be witnesses
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(circuit_size);
            this->num_public_inputs = num_public_inputs;
        };
        /**
         * @brief Construct a new Verification Key with stdlib types from a provided native verification
         * key
         *
         * @param builder
         * @param native_key Native verification key from which to extract the precomputed commitments
         */
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
            this->pcs_verification_key = native_key->pcs_verification_key;
            this->circuit_size = native_key->circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = native_key->num_public_inputs;
            this->pub_inputs_offset = native_key->pub_inputs_offset;
            this->contains_recursive_proof = native_key->contains_recursive_proof;
            this->recursive_proof_public_input_indices = native_key->recursive_proof_public_input_indices;
            this->databus_propagation_data = native_key->databus_propagation_data;

            // Generate stdlib commitments (biggroup) from the native counterparts
            for (auto [commitment, native_commitment] : zip_view(this->get_all(), native_key->get_all())) {
                commitment = Commitment::from_witness(builder, native_commitment);
            }
        };

        /**
         * @brief Deserialize a verification key from a vector of field elements
         *
         * @param builder
         * @param elements
         */
        VerificationKey(CircuitBuilder& builder, std::span<FF> elements)
        {
            // deserialize circuit size
            size_t num_frs_read = 0;
            size_t num_frs_FF = bb::stdlib::field_conversion::calc_num_bn254_frs<CircuitBuilder, FF>();
            size_t num_frs_Comm = bb::stdlib::field_conversion::calc_num_bn254_frs<CircuitBuilder, Commitment>();

            this->circuit_size = uint64_t(stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, FF>(
                                              builder, elements.subspan(num_frs_read, num_frs_FF))
                                              .get_value());
            num_frs_read += num_frs_FF;
            this->num_public_inputs = uint64_t(stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, FF>(
                                                   builder, elements.subspan(num_frs_read, num_frs_FF))
                                                   .get_value());
            num_frs_read += num_frs_FF;

            this->pub_inputs_offset = uint64_t(stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, FF>(
                                                   builder, elements.subspan(num_frs_read, num_frs_FF))
                                                   .get_value());
            num_frs_read += num_frs_FF;
            this->contains_recursive_proof = bool(stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, FF>(
                                                      builder, elements.subspan(num_frs_read, num_frs_FF))
                                                      .get_value());
            num_frs_read += num_frs_FF;

            for (uint32_t i = 0; i < bb::AGGREGATION_OBJECT_SIZE; ++i) {
                this->recursive_proof_public_input_indices[i] =
                    uint32_t(stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, FF>(
                                 builder, elements.subspan(num_frs_read, num_frs_FF))
                                 .get_value());
                num_frs_read += num_frs_FF;
            }

            for (Commitment& comm : this->get_all()) {
                comm = bb::stdlib::field_conversion::convert_from_bn254_frs<CircuitBuilder, Commitment>(
                    builder, elements.subspan(num_frs_read, num_frs_Comm));
                num_frs_read += num_frs_Comm;
            }
        }
    };

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = MegaFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = MegaFlavor::CommitmentLabels;
    // Reuse the VerifierCommitments from Mega
    using VerifierCommitments = MegaFlavor::VerifierCommitments_<Commitment, VerificationKey>;

    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;
};

} // namespace bb