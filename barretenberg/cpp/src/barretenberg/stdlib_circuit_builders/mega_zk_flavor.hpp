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
        Commitment libra_concatenation_commitment;
        FF libra_sum;
        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        FF libra_claimed_evaluation;

        Commitment libra_big_sum_commitment;
        Commitment libra_quotient_commitment;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
        FF libra_concatenation_eval;
        FF libra_shifted_big_sum_eval;
        FF libra_big_sum_eval;
        FF libra_quotient_eval;
        Commitment hiding_polynomial_commitment;
        FF hiding_polynomial_eval;
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
            libra_concatenation_commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            libra_sum =
                NativeTranscript::template deserialize_from_buffer<FF>(NativeTranscript::proof_data, num_frs_read);

            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                sumcheck_univariates.push_back(
                    deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                 num_frs_read));
            }
            libra_claimed_evaluation = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            sumcheck_evaluations = deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, num_frs_read);

            libra_big_sum_commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

            libra_quotient_commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

            hiding_polynomial_commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            hiding_polynomial_eval = deserialize_from_buffer<FF>(NativeTranscript::proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                gemini_fold_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                gemini_fold_evals.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            libra_concatenation_eval = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_shifted_big_sum_eval = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_big_sum_eval = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_quotient_eval = deserialize_from_buffer<FF>(proof_data, num_frs_read);
            shplonk_q_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

            kzg_w_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        void serialize_full_transcript()
        {
            size_t old_proof_length = proof_data.size();
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

            serialize_to_buffer(libra_concatenation_commitment, proof_data);

            NativeTranscript::template serialize_to_buffer(libra_sum, NativeTranscript::proof_data);

            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(sumcheck_univariates[i], proof_data);
            }
            serialize_to_buffer(libra_claimed_evaluation, proof_data);

            serialize_to_buffer(sumcheck_evaluations, proof_data);
            serialize_to_buffer(libra_big_sum_commitment, proof_data);
            serialize_to_buffer(libra_quotient_commitment, proof_data);

            serialize_to_buffer(hiding_polynomial_commitment, NativeTranscript::proof_data);
            serialize_to_buffer(hiding_polynomial_eval, NativeTranscript::proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                serialize_to_buffer(gemini_fold_comms[i], proof_data);
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(gemini_fold_evals[i], proof_data);
            }
            serialize_to_buffer(libra_concatenation_eval, proof_data);
            serialize_to_buffer(libra_shifted_big_sum_eval, proof_data);
            serialize_to_buffer(libra_big_sum_eval, proof_data);
            serialize_to_buffer(libra_quotient_eval, proof_data);

            serialize_to_buffer(shplonk_q_comm, proof_data);
            serialize_to_buffer(kzg_w_comm, proof_data);

            ASSERT(proof_data.size() == old_proof_length);
        }
    };
    // Specialize for Mega (general case used in MegaRecursive).
    using Transcript = Transcript_<Commitment>;
};

} // namespace bb