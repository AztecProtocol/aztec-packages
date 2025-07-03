// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

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

    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;

    // indicates when evaluating sumcheck, edges can be left as degree-1 monomials
    static constexpr bool USE_SHORT_MONOMIALS = MegaFlavor::USE_SHORT_MONOMIALS;
    // Note(luke): Eventually this may not be needed at all
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<NativeFlavor::Curve>;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = MegaFlavor::USE_PADDING;
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
    // Total number of folded polynomials, which is just all polynomials except the shifts
    static constexpr size_t NUM_FOLDED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;

    // define the tuple of Relations that comprise the Sumcheck relation
    // Reuse the Relations from Mega
    using Relations = MegaFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = MegaFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenge for each
    // subrelation. This is because using powers of alpha would increase the degree of Protogalaxy polynomial $G$ (the
    // combiner) to much.
    static constexpr size_t NUM_SUBRELATIONS = MegaFlavor::NUM_SUBRELATIONS;
    using RelationSeparator = std::array<FF, NUM_SUBRELATIONS>;

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
    class VerificationKey : public StdlibVerificationKey_<BuilderType, MegaFlavor::PrecomputedEntities<Commitment>> {

      public:
        using NativeVerificationKey = NativeFlavor::VerificationKey;
        // Data pertaining to transfer of databus return data via public inputs of the proof
        DatabusPropagationData databus_propagation_data;

        /**
         * @brief Construct a new Verification Key with stdlib types from a provided native verification
         * key
         *
         * @param builder
         * @param native_key Native verification key from which to extract the precomputed commitments
         */
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
            this->circuit_size = FF::from_witness(builder, native_key->circuit_size);
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1283): Use stdlib get_msb.
            this->log_circuit_size = FF::from_witness(builder, numeric::get_msb(native_key->circuit_size));
            this->num_public_inputs = FF::from_witness(builder, native_key->num_public_inputs);
            this->pub_inputs_offset = FF::from_witness(builder, native_key->pub_inputs_offset);
            this->pairing_inputs_public_input_key = native_key->pairing_inputs_public_input_key;
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
            using namespace bb::stdlib::field_conversion;

            size_t num_frs_read = 0;

            this->circuit_size = deserialize_from_frs<FF>(builder, elements, num_frs_read);
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1283): Use stdlib get_msb.
            this->log_circuit_size = numeric::get_msb(static_cast<uint32_t>(this->circuit_size.get_value()));
            this->num_public_inputs = deserialize_from_frs<FF>(builder, elements, num_frs_read);
            this->pub_inputs_offset = deserialize_from_frs<FF>(builder, elements, num_frs_read);

            this->pairing_inputs_public_input_key.start_idx =
                uint32_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());

            this->databus_propagation_data.app_return_data_commitment_pub_input_key.start_idx =
                uint32_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());
            this->databus_propagation_data.kernel_return_data_commitment_pub_input_key.start_idx =
                uint32_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());
            this->databus_propagation_data.is_kernel =
                bool(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());

            for (Commitment& commitment : this->get_all()) {
                commitment = deserialize_from_frs<Commitment>(builder, elements, num_frs_read);
            }

            if (num_frs_read != elements.size()) {
                info("Warning: Invalid buffer length in VerificationKey constuctor from fields!");
                ASSERT(false);
            }
        }

        /**
         * @brief Serialize verification key to field elements. Overrides the base class definition to include
         * databus_propagation_data.
         *
         * @return std::vector<FF>
         */
        std::vector<FF> to_field_elements() const override
        {
            using namespace bb::stdlib::field_conversion;

            auto serialize_to_field_buffer = []<typename T>(const T& input, std::vector<FF>& buffer) {
                std::vector<FF> input_fields = convert_to_bn254_frs<CircuitBuilder, T>(input);
                buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
            };

            std::vector<FF> elements;

            CircuitBuilder* builder = this->circuit_size.context;
            serialize_to_field_buffer(this->circuit_size, elements);
            serialize_to_field_buffer(this->num_public_inputs, elements);
            serialize_to_field_buffer(this->pub_inputs_offset, elements);

            FF pairing_points_start_idx(this->pairing_inputs_public_input_key.start_idx);
            pairing_points_start_idx.convert_constant_to_fixed_witness(builder);
            serialize_to_field_buffer(pairing_points_start_idx, elements);

            FF app_return_data_commitment_start_idx(
                this->databus_propagation_data.app_return_data_commitment_pub_input_key.start_idx);
            app_return_data_commitment_start_idx.convert_constant_to_fixed_witness(builder);
            serialize_to_field_buffer(app_return_data_commitment_start_idx, elements);

            FF kernel_return_data_commitment_start_idx(
                this->databus_propagation_data.kernel_return_data_commitment_pub_input_key.start_idx);
            kernel_return_data_commitment_start_idx.convert_constant_to_fixed_witness(builder);
            serialize_to_field_buffer(kernel_return_data_commitment_start_idx, elements);

            FF databus_is_kernel_start_idx(this->databus_propagation_data.is_kernel);
            databus_is_kernel_start_idx.convert_constant_to_fixed_witness(builder);
            serialize_to_field_buffer(databus_is_kernel_start_idx, elements);

            for (const Commitment& commitment : this->get_all()) {
                serialize_to_field_buffer(commitment, elements);
            }

            return elements;
        }

        /**
         * @brief Adds the verification key witnesses directly to the transcript. Overrides the base class
         * implementation to include the databus propagation data.
         * @details Needed to make sure the Origin Tag system works. Rather than converting into a vector of fields
         * and submitting that, we want to submit the values directly to the transcript.
         *
         * @param domain_separator
         * @param transcript
         */
        void add_to_transcript(const std::string& domain_separator, Transcript& transcript) override
        {
            transcript.add_to_hash_buffer(domain_separator + "vk_circuit_size", this->circuit_size);
            transcript.add_to_hash_buffer(domain_separator + "vk_num_public_inputs", this->num_public_inputs);
            transcript.add_to_hash_buffer(domain_separator + "vk_pub_inputs_offset", this->pub_inputs_offset);
            FF pairing_points_start_idx(this->pairing_inputs_public_input_key.start_idx);
            CircuitBuilder* builder = this->circuit_size.context;
            pairing_points_start_idx.convert_constant_to_fixed_witness(builder);
            transcript.add_to_hash_buffer(domain_separator + "vk_pairing_points_start_idx", pairing_points_start_idx);
            FF app_return_data_commitment_start_idx(
                this->databus_propagation_data.app_return_data_commitment_pub_input_key.start_idx);
            app_return_data_commitment_start_idx.convert_constant_to_fixed_witness(builder);
            transcript.add_to_hash_buffer(domain_separator + "vk_app_return_data_commitment_start_idx",
                                          app_return_data_commitment_start_idx);
            FF kernel_return_data_commitment_start_idx(
                this->databus_propagation_data.kernel_return_data_commitment_pub_input_key.start_idx);
            kernel_return_data_commitment_start_idx.convert_constant_to_fixed_witness(builder);
            transcript.add_to_hash_buffer(domain_separator + "vk_kernel_return_data_commitment_start_idx",
                                          kernel_return_data_commitment_start_idx);
            FF databus_is_kernel_start_idx(this->databus_propagation_data.is_kernel);
            databus_is_kernel_start_idx.convert_constant_to_fixed_witness(builder);
            transcript.add_to_hash_buffer(domain_separator + "vk_is_kernel", databus_is_kernel_start_idx);
            for (const Commitment& commitment : this->get_all()) {
                transcript.add_to_hash_buffer(domain_separator + "vk_commitment", commitment);
            }
        }

        /**
         * @brief Construct a VerificationKey from a set of corresponding witness indices
         *
         * @param builder
         * @param witness_indices
         * @return VerificationKey
         */
        static VerificationKey from_witness_indices(CircuitBuilder& builder,
                                                    const std::span<const uint32_t>& witness_indices)
        {
            std::vector<FF> vk_fields;
            vk_fields.reserve(witness_indices.size());
            for (const auto& idx : witness_indices) {
                vk_fields.emplace_back(FF::from_witness_index(&builder, idx));
            }
            return VerificationKey(builder, vk_fields);
        }
    };

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = MegaFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = MegaFlavor::CommitmentLabels;
    // Reuse the VerifierCommitments from Mega
    using VerifierCommitments = MegaFlavor::VerifierCommitments_<Commitment, VerificationKey>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
