#pragma once

#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"

namespace bb {

/*!
\brief Child class of MegaFlavor that runs with ZK Sumcheck.
 See more in \ref docs/src/sumcheck-outline.md "Sumcheck Outline".
*/
class MegaZKFlavor : public bb::MegaFlavor {
  public:
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = true;
    // The degree has to be increased because the relation is multiplied by the Row Disabling Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MegaFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    /**
     * @brief Derived class that defines proof structure for Mega proofs, as well as supporting functions.
     * Note: Made generic for use in MegaRecursive.
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/877): Remove this Commitment template parameter
     */
    class Transcript : public MegaFlavor::Transcript {
      public:
        // Note: we have a different vector of univariates because the degree for ZK flavors differs
        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> zk_sumcheck_univariates;
        Commitment libra_concatenation_commitment;
        FF libra_sum;
        FF libra_claimed_evaluation;
        Commitment libra_big_sum_commitment;
        Commitment libra_quotient_commitment;
        FF libra_concatenation_eval;
        FF libra_shifted_big_sum_eval;
        FF libra_big_sum_eval;
        FF libra_quotient_eval;
        Commitment hiding_polynomial_commitment;
        FF hiding_polynomial_eval;

        Transcript() = default;

        Transcript(const HonkProof& proof)
            : MegaFlavor::Transcript(proof)
        {}

        static std::shared_ptr<Transcript> prover_init_empty()
        {
            auto transcript = std::make_shared<Transcript>();
            constexpr uint32_t init{ 42 }; // arbitrary
            transcript->send_to_verifier("Init", init);
            return transcript;
        };

        static std::shared_ptr<Transcript> verifier_init_empty(const std::shared_ptr<Transcript>& transcript)
        {
            auto verifier_transcript = std::make_shared<Transcript>(transcript->proof_data);
            [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<uint32_t>("Init");
            return verifier_transcript;
        };

        void deserialize_full_transcript()
        {
            // take current proof and put them into the struct
            size_t num_frs_read = 0;
            this->circuit_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);

            this->public_input_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            this->pub_inputs_offset = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            for (size_t i = 0; i < public_input_size; ++i) {
                this->public_inputs.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            this->w_l_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->w_r_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->w_o_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->ecc_op_wire_1_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->ecc_op_wire_2_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->ecc_op_wire_3_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->ecc_op_wire_4_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->calldata_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->calldata_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->calldata_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->calldata_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->secondary_calldata_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->secondary_calldata_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->secondary_calldata_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->secondary_calldata_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->return_data_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->return_data_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->return_data_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->return_data_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->lookup_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->lookup_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->w_4_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->lookup_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->z_perm_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            libra_concatenation_commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            libra_sum = deserialize_from_buffer<FF>(proof_data, num_frs_read);

            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                zk_sumcheck_univariates.push_back(
                    deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                 num_frs_read));
            }
            libra_claimed_evaluation = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            this->sumcheck_evaluations =
                deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, num_frs_read);
            libra_big_sum_commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            libra_quotient_commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            hiding_polynomial_commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            hiding_polynomial_eval = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                this->gemini_fold_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                this->gemini_fold_evals.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            libra_concatenation_eval = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_shifted_big_sum_eval = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_big_sum_eval = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_quotient_eval = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            this->shplonk_q_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

            this->kzg_w_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        void serialize_full_transcript()
        {
            size_t old_proof_length = proof_data.size();
            proof_data.clear();
            serialize_to_buffer(this->circuit_size, proof_data);
            serialize_to_buffer(this->public_input_size, proof_data);
            serialize_to_buffer(this->pub_inputs_offset, proof_data);
            for (size_t i = 0; i < public_input_size; ++i) {
                serialize_to_buffer(this->public_inputs[i], proof_data);
            }
            serialize_to_buffer(this->w_l_comm, proof_data);
            serialize_to_buffer(this->w_r_comm, proof_data);
            serialize_to_buffer(this->w_o_comm, proof_data);
            serialize_to_buffer(this->ecc_op_wire_1_comm, proof_data);
            serialize_to_buffer(this->ecc_op_wire_2_comm, proof_data);
            serialize_to_buffer(this->ecc_op_wire_3_comm, proof_data);
            serialize_to_buffer(this->ecc_op_wire_4_comm, proof_data);
            serialize_to_buffer(this->calldata_comm, proof_data);
            serialize_to_buffer(this->calldata_read_counts_comm, proof_data);
            serialize_to_buffer(this->calldata_read_tags_comm, proof_data);
            serialize_to_buffer(this->calldata_inverses_comm, proof_data);
            serialize_to_buffer(this->secondary_calldata_comm, proof_data);
            serialize_to_buffer(this->secondary_calldata_read_counts_comm, proof_data);
            serialize_to_buffer(this->secondary_calldata_read_tags_comm, proof_data);
            serialize_to_buffer(this->secondary_calldata_inverses_comm, proof_data);
            serialize_to_buffer(this->return_data_comm, proof_data);
            serialize_to_buffer(this->return_data_read_counts_comm, proof_data);
            serialize_to_buffer(this->return_data_read_tags_comm, proof_data);
            serialize_to_buffer(this->return_data_inverses_comm, proof_data);
            serialize_to_buffer(this->lookup_read_counts_comm, proof_data);
            serialize_to_buffer(this->lookup_read_tags_comm, proof_data);
            serialize_to_buffer(this->w_4_comm, proof_data);
            serialize_to_buffer(this->lookup_inverses_comm, proof_data);
            serialize_to_buffer(this->z_perm_comm, proof_data);

            serialize_to_buffer(libra_concatenation_commitment, proof_data);
            serialize_to_buffer(libra_sum, proof_data);

            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(zk_sumcheck_univariates[i], proof_data);
            }
            serialize_to_buffer(libra_claimed_evaluation, proof_data);

            serialize_to_buffer(this->sumcheck_evaluations, proof_data);
            serialize_to_buffer(libra_big_sum_commitment, proof_data);
            serialize_to_buffer(libra_quotient_commitment, proof_data);
            serialize_to_buffer(hiding_polynomial_commitment, proof_data);
            serialize_to_buffer(hiding_polynomial_eval, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                serialize_to_buffer(this->gemini_fold_comms[i], proof_data);
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(this->gemini_fold_evals[i], proof_data);
            }
            serialize_to_buffer(libra_concatenation_eval, proof_data);
            serialize_to_buffer(libra_shifted_big_sum_eval, proof_data);
            serialize_to_buffer(libra_big_sum_eval, proof_data);
            serialize_to_buffer(libra_quotient_eval, proof_data);
            serialize_to_buffer(this->shplonk_q_comm, proof_data);
            serialize_to_buffer(this->kzg_w_comm, proof_data);

            ASSERT(proof_data.size() == old_proof_length);
        }
    };
};

} // namespace bb