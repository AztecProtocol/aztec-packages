#pragma once

#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"

namespace bb {

/*!
\brief Child class of MegaFlavor that runs with ZK Sumcheck.
 See more in \ref docs/src/sumcheck-outline.md "Sumcheck Outline".
*/
class MegaFlavorWithZK : public bb::MegaFlavor {
  public:
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = true;
    using Commitment = MegaFlavor::Commitment;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;

    class VerificationKey : public VerificationKey_<PrecomputedEntities<Commitment>, VerifierCommitmentKey> {
      public:
        // Data pertaining to transfer of databus return data via public inputs of the proof being recursively verified
        DatabusPropagationData databus_propagation_data;

        bool operator==(const VerificationKey&) const = default;
        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : VerificationKey_(circuit_size, num_public_inputs)
        {}

        VerificationKey(const VerificationKey& vk) = default;

        void set_metadata(ProvingKey& proving_key)
        {
            this->pcs_verification_key = std::make_shared<VerifierCommitmentKey>();
            this->circuit_size = proving_key.circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = proving_key.num_public_inputs;
            this->pub_inputs_offset = proving_key.pub_inputs_offset;
            this->contains_recursive_proof = proving_key.contains_recursive_proof;
            this->recursive_proof_public_input_indices = proving_key.recursive_proof_public_input_indices;

            // Databus commitment propagation data
            this->databus_propagation_data = proving_key.databus_propagation_data;
        }

        VerificationKey(ProvingKey& proving_key)
        {
            set_metadata(proving_key);
            if (proving_key.commitment_key == nullptr) {
                proving_key.commitment_key = std::make_shared<CommitmentKey>(proving_key.circuit_size);
            }
            for (auto [polynomial, commitment] : zip_view(proving_key.polynomials.get_precomputed(), this->get_all())) {
                commitment = proving_key.commitment_key->commit(polynomial);
            }
        }

        /**
         * @brief Serialize verification key to field elements
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
            serialize_to_field_buffer(this->contains_recursive_proof, elements);
            serialize_to_field_buffer(this->recursive_proof_public_input_indices, elements);

            serialize_to_field_buffer(this->databus_propagation_data.app_return_data_public_input_idx, elements);
            serialize_to_field_buffer(this->databus_propagation_data.kernel_return_data_public_input_idx, elements);
            serialize_to_field_buffer(this->databus_propagation_data.is_kernel, elements);

            for (const Commitment& commitment : this->get_all()) {
                serialize_to_field_buffer(commitment, elements);
            }

            return elements;
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/964): Clean the boilerplate up.
        VerificationKey(const size_t circuit_size,
                        const size_t num_public_inputs,
                        const size_t pub_inputs_offset,
                        const bool contains_recursive_proof,
                        const AggregationObjectPubInputIndices& recursive_proof_public_input_indices,
                        const DatabusPropagationData& databus_propagation_data,
                        const Commitment& q_m,
                        const Commitment& q_c,
                        const Commitment& q_l,
                        const Commitment& q_r,
                        const Commitment& q_o,
                        const Commitment& q_4,
                        const Commitment& q_busread,
                        const Commitment& q_arith,
                        const Commitment& q_delta_range,
                        const Commitment& q_elliptic,
                        const Commitment& q_aux,
                        const Commitment& q_poseidon2_external,
                        const Commitment& q_poseidon2_internal,
                        const Commitment& q_lookup,
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
                        const Commitment& lagrange_last,
                        const Commitment& lagrange_ecc_op,
                        const Commitment& databus_id)
        {
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = num_public_inputs;
            this->pub_inputs_offset = pub_inputs_offset;
            this->contains_recursive_proof = contains_recursive_proof;
            this->recursive_proof_public_input_indices = recursive_proof_public_input_indices;
            this->databus_propagation_data = databus_propagation_data;
            this->q_m = q_m;
            this->q_c = q_c;
            this->q_l = q_l;
            this->q_r = q_r;
            this->q_o = q_o;
            this->q_4 = q_4;
            this->q_busread = q_busread;
            this->q_arith = q_arith;
            this->q_delta_range = q_delta_range;
            this->q_elliptic = q_elliptic;
            this->q_aux = q_aux;
            this->q_poseidon2_external = q_poseidon2_external;
            this->q_poseidon2_internal = q_poseidon2_internal;
            this->q_lookup = q_lookup;
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
            this->lagrange_ecc_op = lagrange_ecc_op;
            this->databus_id = databus_id;
        }
        MSGPACK_FIELDS(circuit_size,
                       log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
                       contains_recursive_proof,
                       recursive_proof_public_input_indices,
                       databus_propagation_data,
                       q_m,
                       q_c,
                       q_l,
                       q_r,
                       q_o,
                       q_4,
                       q_busread,
                       q_arith,
                       q_delta_range,
                       q_elliptic,
                       q_aux,
                       q_poseidon2_external,
                       q_poseidon2_internal,
                       q_lookup,
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
                       lagrange_last,
                       lagrange_ecc_op,
                       databus_id);
    };

    // VerifierCommitments contain extra elements
    template <typename Commitment, typename VerificationKey>
    class VerifierCommitments_ : public AllEntities<Commitment> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey>& verification_key,
                             const std::optional<WitnessEntities<Commitment>>& witness_commitments = std::nullopt)
        {
            // Copy the precomputed polynomial commitments into this
            for (auto [precomputed, precomputed_in] : zip_view(this->get_precomputed(), verification_key->get_all())) {
                precomputed = precomputed_in;
            }

            // If provided, copy the witness polynomial commitments into this
            if (witness_commitments.has_value()) {
                for (auto [witness, witness_in] :
                     zip_view(this->get_witness(), witness_commitments.value().get_all())) {
                    witness = witness_in;
                }
            }
        }
    };
    // Specialize for Mega (general case used in MegaRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;

    /**
     * @brief Derived class that defines proof structure for Mega proofs, as well as supporting functions.
     * Note: Made generic for use in MegaRecursive.
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/877): Remove this Commitment template parameter
     */
    template <typename Commitment> class Transcript_ : public NativeTranscript {
      public:
        uint32_t circuit_size;
        uint32_t public_input_size;
        uint32_t pub_inputs_offset;
        std::vector<FF> public_inputs;
        Commitment w_l_comm;
        Commitment w_r_comm;
        Commitment w_o_comm;
        Commitment ecc_op_wire_1_comm;
        Commitment ecc_op_wire_2_comm;
        Commitment ecc_op_wire_3_comm;
        Commitment ecc_op_wire_4_comm;
        Commitment calldata_comm;
        Commitment calldata_read_counts_comm;
        Commitment calldata_read_tags_comm;
        Commitment calldata_inverses_comm;
        Commitment secondary_calldata_comm;
        Commitment secondary_calldata_read_counts_comm;
        Commitment secondary_calldata_read_tags_comm;
        Commitment secondary_calldata_inverses_comm;
        Commitment return_data_comm;
        Commitment return_data_read_counts_comm;
        Commitment return_data_read_tags_comm;
        Commitment return_data_inverses_comm;
        Commitment w_4_comm;
        Commitment z_perm_comm;
        Commitment lookup_inverses_comm;
        Commitment lookup_read_counts_comm;
        Commitment lookup_read_tags_comm;
        std::vector<Commitment> libra_commitments;
        FF libra_sum;
        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        std::vector<FF> libra_evaluations;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
        std::vector<Commitment> gemini_fold_comms;
        std::vector<FF> gemini_fold_evals;
        Commitment shplonk_q_comm;
        Commitment kzg_w_comm;

        Transcript_() = default;

        Transcript_(const HonkProof& proof)
            : NativeTranscript(proof)
        {}

        static std::shared_ptr<Transcript_> prover_init_empty()
        {
            auto transcript = std::make_shared<Transcript_>();
            constexpr uint32_t init{ 42 }; // arbitrary
            transcript->send_to_verifier("Init", init);
            return transcript;
        };

        static std::shared_ptr<Transcript_> verifier_init_empty(const std::shared_ptr<Transcript_>& transcript)
        {
            auto verifier_transcript = std::make_shared<Transcript_>(transcript->proof_data);
            [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<uint32_t>("Init");
            return verifier_transcript;
        };

        void deserialize_full_transcript()
        {
            // take current proof and put them into the struct
            size_t num_frs_read = 0;
            circuit_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            size_t log_circuit_size = static_cast<size_t>(numeric::get_msb(circuit_size));

            public_input_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            pub_inputs_offset = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            for (size_t i = 0; i < public_input_size; ++i) {
                public_inputs.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            w_l_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_r_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_o_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            ecc_op_wire_1_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            ecc_op_wire_2_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            ecc_op_wire_3_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            ecc_op_wire_4_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            calldata_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            calldata_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            calldata_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            calldata_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            secondary_calldata_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            secondary_calldata_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            secondary_calldata_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            secondary_calldata_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            return_data_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            return_data_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            return_data_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            return_data_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_4_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            z_perm_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            for (size_t i = 0; i < log_circuit_size; i++) {
                libra_commitments.emplace_back(NativeTranscript::template deserialize_from_buffer<Commitment>(
                    NativeTranscript::proof_data, num_frs_read));
            };
            libra_sum =
                NativeTranscript::template deserialize_from_buffer<FF>(NativeTranscript::proof_data, num_frs_read);

            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                sumcheck_univariates.push_back(
                    deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                 num_frs_read));
            }
            for (size_t i = 0; i < log_circuit_size; i++) {
                libra_evaluations.emplace_back(
                    NativeTranscript::template deserialize_from_buffer<FF>(NativeTranscript::proof_data, num_frs_read));
            }
            sumcheck_evaluations = deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                gemini_fold_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                gemini_fold_evals.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            shplonk_q_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

            kzg_w_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        void serialize_full_transcript()
        {
            size_t old_proof_length = proof_data.size();
            size_t log_circuit_size = static_cast<size_t>(numeric::get_msb(circuit_size));
            proof_data.clear();
            serialize_to_buffer(circuit_size, proof_data);
            serialize_to_buffer(public_input_size, proof_data);
            serialize_to_buffer(pub_inputs_offset, proof_data);
            for (size_t i = 0; i < public_input_size; ++i) {
                serialize_to_buffer(public_inputs[i], proof_data);
            }
            serialize_to_buffer(w_l_comm, proof_data);
            serialize_to_buffer(w_r_comm, proof_data);
            serialize_to_buffer(w_o_comm, proof_data);
            serialize_to_buffer(ecc_op_wire_1_comm, proof_data);
            serialize_to_buffer(ecc_op_wire_2_comm, proof_data);
            serialize_to_buffer(ecc_op_wire_3_comm, proof_data);
            serialize_to_buffer(ecc_op_wire_4_comm, proof_data);
            serialize_to_buffer(calldata_comm, proof_data);
            serialize_to_buffer(calldata_read_counts_comm, proof_data);
            serialize_to_buffer(calldata_read_tags_comm, proof_data);
            serialize_to_buffer(calldata_inverses_comm, proof_data);
            serialize_to_buffer(secondary_calldata_comm, proof_data);
            serialize_to_buffer(secondary_calldata_read_counts_comm, proof_data);
            serialize_to_buffer(secondary_calldata_read_tags_comm, proof_data);
            serialize_to_buffer(secondary_calldata_inverses_comm, proof_data);
            serialize_to_buffer(return_data_comm, proof_data);
            serialize_to_buffer(return_data_read_counts_comm, proof_data);
            serialize_to_buffer(return_data_read_tags_comm, proof_data);
            serialize_to_buffer(return_data_inverses_comm, proof_data);
            serialize_to_buffer(lookup_read_counts_comm, proof_data);
            serialize_to_buffer(lookup_read_tags_comm, proof_data);
            serialize_to_buffer(w_4_comm, proof_data);
            serialize_to_buffer(lookup_inverses_comm, proof_data);
            serialize_to_buffer(z_perm_comm, proof_data);

            for (size_t i = 0; i < log_circuit_size; ++i) {
                NativeTranscript::template serialize_to_buffer(libra_commitments[i], NativeTranscript::proof_data);
            }
            NativeTranscript::template serialize_to_buffer(libra_sum, NativeTranscript::proof_data);

            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(sumcheck_univariates[i], proof_data);
            }
            for (size_t i = 0; i < log_circuit_size; ++i) {
                NativeTranscript::template serialize_to_buffer(libra_evaluations[i], NativeTranscript::proof_data);
            }

            serialize_to_buffer(sumcheck_evaluations, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                serialize_to_buffer(gemini_fold_comms[i], proof_data);
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(gemini_fold_evals[i], proof_data);
            }
            serialize_to_buffer(shplonk_q_comm, proof_data);
            serialize_to_buffer(kzg_w_comm, proof_data);

            ASSERT(proof_data.size() == old_proof_length);
        }
    };
    // Specialize for Mega (general case used in MegaRecursive).
    using Transcript = Transcript_<Commitment>;
};

} // namespace bb