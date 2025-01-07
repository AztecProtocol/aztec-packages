#pragma once

#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"

namespace bb {

/*!
\brief Child class of UltraFlavor that runs with ZK Sumcheck.
\details
Most of the properties of UltraFlavor are
inherited without any changes, except for the MAX_PARTIAL_RELATION_LENGTH which is now computed as a maximum of
SUBRELATION_PARTIAL_LENGTHS incremented by the corresponding SUBRELATION_WITNESS_DEGREES over all relations included in
UltraFlavor, which also affects the size of ExtendedEdges univariate containers.
Moreover, the container SumcheckTupleOfTuplesOfUnivariates is resized to reflect that masked
witness polynomials are of degree at most \f$2\f$ in each variable, and hence, for any subrelation, the corresponding
univariate accumuluator size has to be increased by the subrelation's witness degree. See more in
\ref docs/src/sumcheck-outline.md "Sumcheck Outline".
*/
class UltraKeccakZKFlavor : public UltraKeccakFlavor {
  public:
    // This flavor runs with ZK Sumcheck
    static constexpr bool HasZK = true;
    // Determine the number of evaluations of Prover and Libra Polynomials that the Prover sends to the Verifier in
    // the rounds of ZK Sumcheck.
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = UltraKeccakFlavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    /**
     * @brief Derived class that defines proof structure for Ultra proofs, as well as supporting functions.
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
        Commitment libra_big_sum_commitment;
        Commitment libra_quotient_commitment;
        FF libra_concatenation_eval;
        FF libra_shifted_big_sum_eval;
        FF libra_big_sum_eval;
        FF libra_quotient_eval;
        Commitment hiding_polynomial_commitment;
        FF hiding_polynomial_eval;

        /**
         * @brief Takes a FULL Ultra proof and deserializes it into the public member variables
         * that compose the structure. Must be called in order to access the structure of the
         * proof.
         *
         */
        void deserialize_full_transcript()
        {
            // take current proof and put them into the struct
            size_t num_frs_read = 0;
            auto& proof_data = this->proof_data;
            this->circuit_size = Base::template deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);

            this->public_input_size = Base::template deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            this->pub_inputs_offset = Base::template deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            for (size_t i = 0; i < this->public_input_size; ++i) {
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
            libra_big_sum_commitment = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
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
            libra_shifted_big_sum_eval = Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read);
            libra_big_sum_eval = Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read);
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
            Base::template serialize_to_buffer(this->circuit_size, proof_data);
            Base::template serialize_to_buffer(this->public_input_size, proof_data);
            Base::template serialize_to_buffer(this->pub_inputs_offset, proof_data);
            for (size_t i = 0; i < this->public_input_size; ++i) {
                Base::template serialize_to_buffer(this->public_inputs[i], proof_data);
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
            Base::template serialize_to_buffer(libra_big_sum_commitment, proof_data);
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
            Base::template serialize_to_buffer(libra_shifted_big_sum_eval, proof_data);
            Base::template serialize_to_buffer(libra_big_sum_eval, proof_data);
            Base::template serialize_to_buffer(libra_quotient_eval, proof_data);
            Base::template serialize_to_buffer(this->shplonk_q_comm, proof_data);
            Base::template serialize_to_buffer(this->kzg_w_comm, proof_data);

            ASSERT(proof_data.size() == old_proof_length);
        }
    };
};
} // namespace bb