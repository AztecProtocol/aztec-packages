#pragma once
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"

namespace bb {

class UltraRollupFlavor : public bb::UltraFlavor {
  public:
    // Proof length formula:
    // 1. HONK_PROOF_PUBLIC_INPUT_OFFSET are the circuit_size, num_public_inputs, pub_inputs_offset
    // 2. PAIRING_POINT_ACCUMULATOR_SIZE public inputs for pairing point accumulator
    // 3. IPA_CLAIM_SIZE public inputs for IPA claim
    // 4. NUM_WITNESS_ENTITIES commitments
    // 5. CONST_PROOF_SIZE_LOG_N sumcheck univariates
    // 6. NUM_ALL_ENTITIES sumcheck evaluations
    // 7. CONST_PROOF_SIZE_LOG_N Gemini Fold commitments
    // 8. CONST_PROOF_SIZE_LOG_N Gemini a evaluations
    // 9. KZG W commitment
    static constexpr size_t num_frs_comm = bb::field_conversion::calc_num_bn254_frs<Commitment>();
    static constexpr size_t num_frs_fr = bb::field_conversion::calc_num_bn254_frs<FF>();
    static constexpr size_t PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS =
        HONK_PROOF_PUBLIC_INPUT_OFFSET + PAIRING_POINT_ACCUMULATOR_SIZE + IPA_CLAIM_SIZE +
        NUM_WITNESS_ENTITIES * num_frs_comm + CONST_PROOF_SIZE_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * num_frs_fr +
        NUM_ALL_ENTITIES * num_frs_fr + CONST_PROOF_SIZE_LOG_N * num_frs_comm + CONST_PROOF_SIZE_LOG_N * num_frs_fr +
        num_frs_comm;

    using UltraFlavor::UltraFlavor;
    class ProvingKey : public UltraFlavor::ProvingKey {
      public:
        using UltraFlavor::ProvingKey::ProvingKey;
        bool contains_ipa_claim;
        IPAClaimPubInputIndices ipa_claim_public_input_indices;
        HonkProof ipa_proof;
    };

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    class VerificationKey : public VerificationKey_<PrecomputedEntities<Commitment>, VerifierCommitmentKey> {
      public:
        virtual ~VerificationKey() = default;
        bool contains_ipa_claim;
        IPAClaimPubInputIndices ipa_claim_public_input_indices;

        bool operator==(const VerificationKey&) const = default;
        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : VerificationKey_(circuit_size, num_public_inputs)
        {}

        /**
         * @brief Serialize verification key to field elements
         *
         * @return std::vector<FF>
         */
        std::vector<FF> to_field_elements() const
        {
            using namespace bb::field_conversion;

            auto serialize_to_field_buffer = [](const auto& input, std::vector<FF>& buffer) {
                std::vector<FF> input_fields = convert_to_bn254_frs(input);
                buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
            };

            std::vector<FF> elements;

            serialize_to_field_buffer(this->circuit_size, elements);
            serialize_to_field_buffer(this->num_public_inputs, elements);
            serialize_to_field_buffer(this->pub_inputs_offset, elements);
            serialize_to_field_buffer(this->contains_pairing_point_accumulator, elements);
            serialize_to_field_buffer(this->pairing_point_accumulator_public_input_indices, elements);
            serialize_to_field_buffer(contains_ipa_claim, elements);
            serialize_to_field_buffer(ipa_claim_public_input_indices, elements);

            for (const Commitment& commitment : this->get_all()) {
                serialize_to_field_buffer(commitment, elements);
            }

            return elements;
        }

        VerificationKey(ProvingKey& proving_key)
            : contains_ipa_claim(proving_key.contains_ipa_claim)
            , ipa_claim_public_input_indices(proving_key.ipa_claim_public_input_indices)
        {
            this->pcs_verification_key = std::make_shared<VerifierCommitmentKey>();
            this->circuit_size = proving_key.circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = proving_key.num_public_inputs;
            this->pub_inputs_offset = proving_key.pub_inputs_offset;
            this->contains_pairing_point_accumulator = proving_key.contains_pairing_point_accumulator;
            this->pairing_point_accumulator_public_input_indices =
                proving_key.pairing_point_accumulator_public_input_indices;

            if (proving_key.commitment_key == nullptr) {
                proving_key.commitment_key = std::make_shared<CommitmentKey>(proving_key.circuit_size);
            }
            for (auto [polynomial, commitment] : zip_view(proving_key.polynomials.get_precomputed(), this->get_all())) {
                commitment = proving_key.commitment_key->commit(polynomial);
            }
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/964): Clean the boilerplate
        // up.
        VerificationKey(const uint64_t circuit_size,
                        const uint64_t num_public_inputs,
                        const uint64_t pub_inputs_offset,
                        const bool contains_pairing_point_accumulator,
                        const PairingPointAccumulatorPubInputIndices& pairing_point_accumulator_public_input_indices,
                        const bool contains_ipa_claim,
                        const IPAClaimPubInputIndices& ipa_claim_public_input_indices,
                        const Commitment& q_m,
                        const Commitment& q_c,
                        const Commitment& q_l,
                        const Commitment& q_r,
                        const Commitment& q_o,
                        const Commitment& q_4,
                        const Commitment& q_lookup,
                        const Commitment& q_arith,
                        const Commitment& q_delta_range,
                        const Commitment& q_elliptic,
                        const Commitment& q_aux,
                        const Commitment& q_poseidon2_external,
                        const Commitment& q_poseidon2_internal,
                        const Commitment& sigma_1,
                        const Commitment& sigma_2,
                        const Commitment& sigma_3,
                        const Commitment& sigma_4,
                        const Commitment& id_1,
                        const Commitment& id_2,
                        const Commitment& id_3,
                        const Commitment& id_4,
                        const Commitment& table_1,
                        const Commitment& table_2,
                        const Commitment& table_3,
                        const Commitment& table_4,
                        const Commitment& lagrange_first,
                        const Commitment& lagrange_last)
            : contains_ipa_claim(contains_ipa_claim)
            , ipa_claim_public_input_indices(ipa_claim_public_input_indices)
        {
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = num_public_inputs;
            this->pub_inputs_offset = pub_inputs_offset;
            this->contains_pairing_point_accumulator = contains_pairing_point_accumulator;
            this->pairing_point_accumulator_public_input_indices = pairing_point_accumulator_public_input_indices;
            this->q_m = q_m;
            this->q_c = q_c;
            this->q_l = q_l;
            this->q_r = q_r;
            this->q_o = q_o;
            this->q_4 = q_4;
            this->q_lookup = q_lookup;
            this->q_arith = q_arith;
            this->q_delta_range = q_delta_range;
            this->q_elliptic = q_elliptic;
            this->q_aux = q_aux;
            this->q_poseidon2_external = q_poseidon2_external;
            this->q_poseidon2_internal = q_poseidon2_internal;
            this->sigma_1 = sigma_1;
            this->sigma_2 = sigma_2;
            this->sigma_3 = sigma_3;
            this->sigma_4 = sigma_4;
            this->id_1 = id_1;
            this->id_2 = id_2;
            this->id_3 = id_3;
            this->id_4 = id_4;
            this->table_1 = table_1;
            this->table_2 = table_2;
            this->table_3 = table_3;
            this->table_4 = table_4;
            this->lagrange_first = lagrange_first;
            this->lagrange_last = lagrange_last;
        }

        // For serialising and deserialising data
        MSGPACK_FIELDS(circuit_size,
                       log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
                       contains_pairing_point_accumulator,
                       pairing_point_accumulator_public_input_indices,
                       contains_ipa_claim,
                       ipa_claim_public_input_indices,
                       q_m,
                       q_c,
                       q_l,
                       q_r,
                       q_o,
                       q_4,
                       q_lookup,
                       q_arith,
                       q_delta_range,
                       q_elliptic,
                       q_aux,
                       q_poseidon2_external,
                       q_poseidon2_internal,
                       sigma_1,
                       sigma_2,
                       sigma_3,
                       sigma_4,
                       id_1,
                       id_2,
                       id_3,
                       id_4,
                       table_1,
                       table_2,
                       table_3,
                       table_4,
                       lagrange_first,
                       lagrange_last);
    };

    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb
