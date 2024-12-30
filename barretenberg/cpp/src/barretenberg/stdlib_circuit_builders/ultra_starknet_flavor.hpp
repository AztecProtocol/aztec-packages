// TODO: the only change should be making honk generic over the transcript
#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/auxiliary_relation.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/poseidon2_external_relation.hpp"
#include "barretenberg/relations/poseidon2_internal_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

class UltraStarknetFlavor : public bb::UltraFlavor {
  public:
    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1094): Add aggregation
    class VerificationKey : public VerificationKey_<PrecomputedEntities<Commitment>, VerifierCommitmentKey> {
      public:
        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : VerificationKey_(circuit_size, num_public_inputs)
        {}
        VerificationKey(ProvingKey& proving_key)
        {
            this->pcs_verification_key = std::make_shared<VerifierCommitmentKey>();
            this->circuit_size = proving_key.circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = proving_key.num_public_inputs;
            this->pub_inputs_offset = proving_key.pub_inputs_offset;

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
                        const Commitment& q_m,
                        const Commitment& q_c,
                        const Commitment& q_l,
                        const Commitment& q_r,
                        const Commitment& q_o,
                        const Commitment& q_4,
                        const Commitment& q_arith,
                        const Commitment& q_delta_range,
                        const Commitment& q_elliptic,
                        const Commitment& q_aux,
                        const Commitment& q_lookup,
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
        {
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = num_public_inputs;
            this->pub_inputs_offset = pub_inputs_offset;
            this->q_m = q_m;
            this->q_c = q_c;
            this->q_l = q_l;
            this->q_r = q_r;
            this->q_o = q_o;
            this->q_4 = q_4;
            this->q_arith = q_arith;
            this->q_delta_range = q_delta_range;
            this->q_elliptic = q_elliptic;
            this->q_aux = q_aux;
            this->q_lookup = q_lookup;
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
                       q_m,
                       q_c,
                       q_l,
                       q_r,
                       q_o,
                       q_4,
                       q_arith,
                       q_delta_range,
                       q_elliptic,
                       q_aux,
                       q_lookup,
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

    // Specialize for Ultra (general case used in UltraRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;

    /**
     * @brief Derived class that defines proof structure for Ultra proofs, as well as supporting functions.
     *
     */
    class Transcript : public PoseidonTranscript {
      public:
        // Transcript objects defined as public member variables for easy access and modification
        uint32_t circuit_size;
        uint32_t public_input_size;
        uint32_t pub_inputs_offset;
        std::vector<FF> public_inputs;
        Commitment w_l_comm;
        Commitment w_r_comm;
        Commitment w_o_comm;
        Commitment lookup_read_counts_comm;
        Commitment lookup_read_tags_comm;
        Commitment w_4_comm;
        Commitment z_perm_comm;
        Commitment lookup_inverses_comm;
        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
        std::vector<Commitment> zm_cq_comms;
        Commitment zm_cq_comm;
        Commitment kzg_w_comm;

        Transcript() = default;

        // Used by verifier to initialize the transcript
        Transcript(const std::vector<FF>& proof)
            : PoseidonTranscript(proof)
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
            [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<FF>("Init");
            return verifier_transcript;
        };

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
            circuit_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);

            public_input_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            pub_inputs_offset = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            for (size_t i = 0; i < public_input_size; ++i) {
                public_inputs.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            w_l_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_r_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_o_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_4_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            z_perm_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                sumcheck_univariates.push_back(
                    deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                 num_frs_read));
            }
            sumcheck_evaluations = deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                zm_cq_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            zm_cq_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            kzg_w_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        /**
         * @brief Serializes the structure variables into a FULL Ultra proof. Should be called
         * only if deserialize_full_transcript() was called and some transcript variable was
         * modified.
         *
         */
        void serialize_full_transcript()
        {
            size_t old_proof_length = proof_data.size();
            proof_data.clear(); // clear proof_data so the rest of the function can replace it
            serialize_to_buffer(circuit_size, proof_data);
            serialize_to_buffer(public_input_size, proof_data);
            serialize_to_buffer(pub_inputs_offset, proof_data);
            for (size_t i = 0; i < public_input_size; ++i) {
                serialize_to_buffer(public_inputs[i], proof_data);
            }
            serialize_to_buffer(w_l_comm, proof_data);
            serialize_to_buffer(w_r_comm, proof_data);
            serialize_to_buffer(w_o_comm, proof_data);
            serialize_to_buffer(lookup_read_counts_comm, proof_data);
            serialize_to_buffer(lookup_read_tags_comm, proof_data);
            serialize_to_buffer(w_4_comm, proof_data);
            serialize_to_buffer(lookup_inverses_comm, proof_data);
            serialize_to_buffer(z_perm_comm, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(sumcheck_univariates[i], proof_data);
            }
            serialize_to_buffer(sumcheck_evaluations, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(zm_cq_comms[i], proof_data);
            }
            serialize_to_buffer(zm_cq_comm, proof_data);
            serialize_to_buffer(kzg_w_comm, proof_data);

            // sanity check to make sure we generate the same length of proof as before.
            ASSERT(proof_data.size() == old_proof_length);
        }
    };
};

} // namespace bb
