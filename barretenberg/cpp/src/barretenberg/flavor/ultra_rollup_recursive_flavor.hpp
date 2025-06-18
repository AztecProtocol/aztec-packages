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
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to the "native" UltraRollupFlavor.
 * @details This flavor can be used to instantiate a recursive Mega Honk verifier for a proof created using the
 * MegaZKFlavor. It is similar in structure to its native counterpart with two main differences: 1) the
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
template <typename BuilderType> class UltraRollupRecursiveFlavor_ : public UltraRecursiveFlavor_<BuilderType> {
  public:
    using CircuitBuilder = BuilderType; // Determines arithmetization of circuit instantiated with this flavor
    using NativeFlavor = UltraRollupFlavor;
    using Curve = UltraRecursiveFlavor_<BuilderType>::Curve;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<NativeFlavor::Curve>;
    using NativeVerificationKey = NativeFlavor::VerificationKey;

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    class VerificationKey
        : public StdlibVerificationKey_<BuilderType, FF, UltraFlavor::PrecomputedEntities<Commitment>> {
      public:
        PublicComponentKey ipa_claim_public_input_key; // needs to be a circuit constant

        /**
         * @brief Construct a new Verification Key with stdlib types from a provided native verification key
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
            this->ipa_claim_public_input_key = native_key->ipa_claim_public_input_key;

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
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1364): Improve VKs. log_circuit_size must be a
            // witness to make the Recursive Verifier circuit constant. Seems that other members also need to be turned
            // into witnesses.
            this->log_circuit_size =
                FF::from_witness(&builder, numeric::get_msb(static_cast<uint32_t>(this->circuit_size.get_value())));
            this->num_public_inputs = deserialize_from_frs<FF>(builder, elements, num_frs_read);
            this->pub_inputs_offset = deserialize_from_frs<FF>(builder, elements, num_frs_read);

            this->pairing_inputs_public_input_key.start_idx =
                uint32_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());

            this->ipa_claim_public_input_key.start_idx =
                uint32_t(deserialize_from_frs<FF>(builder, elements, num_frs_read).get_value());

            for (Commitment& commitment : this->get_all()) {
                commitment = deserialize_from_frs<Commitment>(builder, elements, num_frs_read);
            }
        }

        /**
         * @brief Serialize verification key to field elements. Overrides the base class definition to include
         * ipa_claim_public_input_key.
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
            pairing_points_start_idx.convert_constant_to_fixed_witness(
                builder); // TODO(https://github.com/AztecProtocol/barretenberg/issues/1413): We can't use poseidon2
                          // with constants.
            serialize_to_field_buffer(pairing_points_start_idx, elements);

            FF ipa_claim_start_idx(this->ipa_claim_public_input_key.start_idx);
            ipa_claim_start_idx.convert_constant_to_fixed_witness(builder); // We can't use poseidon2 with constants.
            serialize_to_field_buffer(ipa_claim_start_idx, elements);

            for (const Commitment& commitment : this->get_all()) {
                serialize_to_field_buffer(commitment, elements);
            }

            return elements;
        }

        /**
         * @brief Adds the verification key witnesses directly to the transcript. Overrides the base class
         * implementation to include the ipa claim public input key.
         * @details Only needed to make sure the Origin Tag system works. Rather than converting into a vector of fields
         * and submitting that, we want to submit the values directly to the transcript.
         *
         * @param domain_separator
         * @param transcript
         */
        template <typename Transcript>
        void add_to_transcript(const std::string& domain_separator, std::shared_ptr<Transcript>& transcript)
        {
            transcript->add_to_hash_buffer(domain_separator + "vkey_circuit_size", this->circuit_size);
            transcript->add_to_hash_buffer(domain_separator + "vkey_num_public_inputs", this->num_public_inputs);
            transcript->add_to_hash_buffer(domain_separator + "vkey_pub_inputs_offset", this->pub_inputs_offset);
            FF pairing_points_start_idx(this->pairing_inputs_public_input_key.start_idx);
            CircuitBuilder* builder = this->circuit_size.context;
            pairing_points_start_idx.convert_constant_to_fixed_witness(
                builder); // We can't use poseidon2 with constants.
            transcript->add_to_hash_buffer(domain_separator + "vkey_pairing_points_start_idx",
                                           pairing_points_start_idx);
            FF ipa_claim_start_idx(this->ipa_claim_public_input_key.start_idx);
            ipa_claim_start_idx.convert_constant_to_fixed_witness(builder); // We can't use poseidon2 with constants.
            transcript->add_to_hash_buffer(domain_separator + "vkey_ipa_claim_start_idx", ipa_claim_start_idx);
            for (const Commitment& commitment : this->get_all()) {
                transcript->add_to_hash_buffer(domain_separator + "vkey_commitment", commitment);
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
                                                    const std::span<const uint32_t> witness_indices)
        {
            std::vector<FF> vkey_fields;
            vkey_fields.reserve(witness_indices.size());
            for (const auto& idx : witness_indices) {
                vkey_fields.emplace_back(FF::from_witness_index(&builder, idx));
            }
            return VerificationKey(builder, vkey_fields);
        }
    };

    // Reuse the VerifierCommitments from Ultra
    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb
