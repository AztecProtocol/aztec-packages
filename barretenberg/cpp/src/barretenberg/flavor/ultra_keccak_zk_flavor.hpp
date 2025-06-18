// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/flavor/ultra_keccak_flavor.hpp"

namespace bb {

class UltraKeccakZKFlavor : public UltraKeccakFlavor {
  public:
    // This flavor runs with ZK Sumcheck
    static constexpr bool HasZK = true;
    // Determine the number of evaluations of Prover and Libra Polynomials that the Prover sends to the Verifier in
    // the rounds of ZK Sumcheck.
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = UltraKeccakFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to UltraKeccakZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH");

    // Proof length formula
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        /* 1. NUM_WITNESS_ENTITIES commitments */ (NUM_WITNESS_ENTITIES * num_frs_comm) +
        /* 2. Libra concatenation commitment*/ (num_frs_comm) +
        /* 3. Libra sum */ (num_frs_fr) +
        /* 4. CONST_PROOF_SIZE_LOG_N sumcheck univariates */
        (CONST_PROOF_SIZE_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * num_frs_fr) +
        /* 5. NUM_ALL_ENTITIES sumcheck evaluations*/ (NUM_ALL_ENTITIES * num_frs_fr) +
        /* 6. Libra claimed evaluation */ (num_frs_fr) +
        /* 7. Libra grand sum commitment */ (num_frs_comm) +
        /* 8. Libra quotient commitment */ (num_frs_comm) +
        /* 9. Gemini masking commitment */ (num_frs_comm) +
        /* 10. Gemini masking evaluation */ (num_frs_fr) +
        /* 11. CONST_PROOF_SIZE_LOG_N - 1 Gemini Fold commitments */
        ((CONST_PROOF_SIZE_LOG_N - 1) * num_frs_comm) +
        /* 12. CONST_PROOF_SIZE_LOG_N Gemini a evaluations */
        (CONST_PROOF_SIZE_LOG_N * num_frs_fr) +
        /* 13. NUM_SMALL_IPA_EVALUATIONS libra evals */ (NUM_SMALL_IPA_EVALUATIONS * num_frs_fr) +
        /* 14. Shplonk Q commitment */ (num_frs_comm) +
        /* 15. KZG W commitment */ (num_frs_comm);

    /**
     * @brief Derived class that defines proof structure for Ultra zero knowledge proofs, as well as supporting
     * functions.
     *
     */
    class Transcript : public UltraKeccakFlavor::Transcript {
      public:
        using Base = UltraKeccakFlavor::Transcript::Base;
        // Note: we have a different vector of univariates because the degree for ZK flavors differs
        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> zk_sumcheck_univariates;
        Commitment libra_concatenation_commitment;
        FF libra_sum;
        FF libra_claimed_evaluation;
        Commitment libra_grand_sum_commitment;
        Commitment libra_quotient_commitment;
        FF libra_concatenation_eval;
        FF libra_shifted_grand_sum_eval;
        FF libra_grand_sum_eval;
        FF libra_quotient_eval;
        Commitment hiding_polynomial_commitment;
        FF hiding_polynomial_eval;

        Transcript() = default;

        // Used by verifier to initialize the transcript
        Transcript(const std::vector<FF>& proof)
            : UltraKeccakFlavor::Transcript(proof)
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
            verifier_transcript->template receive_from_prover<FF>("Init");
            return verifier_transcript;
        };

        /**
         * @brief Takes a FULL Ultra proof and deserializes it into the public member variables
         * that compose the structure. Must be called in order to access the structure of the
         * proof.
         *
         */
        void deserialize_full_transcript(size_t public_input_size)
        {
            // take current proof and put them into the struct
            size_t num_frs_read = 0;
            auto& proof_data = this->proof_data;
            for (size_t i = 0; i < public_input_size; ++i) {
                this->public_inputs.push_back(Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            this->w_l_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->w_r_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->w_o_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->lookup_read_counts_comm =
                Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->lookup_read_tags_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->w_4_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->lookup_inverses_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            this->z_perm_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            libra_concatenation_commitment =
                Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            libra_sum = Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read);

            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                zk_sumcheck_univariates.push_back(
                    Base::template deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(
                        proof_data, num_frs_read));
            }
            libra_claimed_evaluation = Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read);
            this->sumcheck_evaluations =
                Base::template deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, num_frs_read);
            libra_grand_sum_commitment = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            libra_quotient_commitment = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            hiding_polynomial_commitment = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            hiding_polynomial_eval = Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                this->gemini_fold_comms.push_back(
                    Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                this->gemini_fold_evals.push_back(Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            libra_concatenation_eval = Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_shifted_grand_sum_eval = Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_grand_sum_eval = Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_quotient_eval = Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read);
            this->shplonk_q_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

            this->kzg_w_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        /**
         * @brief Serializes the structure variables into a FULL Ultra proof. Should be called
         * only if deserialize_full_transcript() was called and some transcript variable was
         * modified.
         *
         */
        void serialize_full_transcript()
        {
            auto& proof_data = this->proof_data;
            size_t old_proof_length = proof_data.size();
            proof_data.clear(); // clear proof_data so the rest of the function can replace it
            for (const auto& public_input : this->public_inputs) {
                Base::template serialize_to_buffer(public_input, proof_data);
            }
            Base::template serialize_to_buffer(this->w_l_comm, proof_data);
            Base::template serialize_to_buffer(this->w_r_comm, proof_data);
            Base::template serialize_to_buffer(this->w_o_comm, proof_data);
            Base::template serialize_to_buffer(this->lookup_read_counts_comm, proof_data);
            Base::template serialize_to_buffer(this->lookup_read_tags_comm, proof_data);
            Base::template serialize_to_buffer(this->w_4_comm, proof_data);
            Base::template serialize_to_buffer(this->lookup_inverses_comm, proof_data);
            Base::template serialize_to_buffer(this->z_perm_comm, proof_data);
            Base::template serialize_to_buffer(libra_concatenation_commitment, proof_data);
            Base::template serialize_to_buffer(libra_sum, proof_data);

            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                Base::template serialize_to_buffer(zk_sumcheck_univariates[i], proof_data);
            }
            Base::template serialize_to_buffer(libra_claimed_evaluation, proof_data);

            Base::template serialize_to_buffer(this->sumcheck_evaluations, proof_data);
            Base::template serialize_to_buffer(libra_grand_sum_commitment, proof_data);
            Base::template serialize_to_buffer(libra_quotient_commitment, proof_data);
            Base::template serialize_to_buffer(hiding_polynomial_commitment, proof_data);
            Base::template serialize_to_buffer(hiding_polynomial_eval, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                Base::template serialize_to_buffer(this->gemini_fold_comms[i], proof_data);
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                Base::template serialize_to_buffer(this->gemini_fold_evals[i], proof_data);
            }
            Base::template serialize_to_buffer(libra_concatenation_eval, proof_data);
            Base::template serialize_to_buffer(libra_shifted_grand_sum_eval, proof_data);
            Base::template serialize_to_buffer(libra_grand_sum_eval, proof_data);
            Base::template serialize_to_buffer(libra_quotient_eval, proof_data);
            Base::template serialize_to_buffer(this->shplonk_q_comm, proof_data);
            Base::template serialize_to_buffer(this->kzg_w_comm, proof_data);

            ASSERT(proof_data.size() == old_proof_length);
        }
    };
};
} // namespace bb
