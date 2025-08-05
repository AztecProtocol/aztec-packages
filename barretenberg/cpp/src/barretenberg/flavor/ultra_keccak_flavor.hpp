// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

// TODO: the only change should be making honk generic over the transcript
#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/poseidon2_external_relation.hpp"
#include "barretenberg/relations/poseidon2_internal_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

class UltraKeccakFlavor : public bb::UltraFlavor {
  public:
    using Transcript = UltraKeccakFlavor::Transcript_<KeccakTranscriptParams>;

    static constexpr bool USE_PADDING = false;

    // Override as proof length is different
    static constexpr size_t num_elements_comm = bb::field_conversion::calc_num_uint256_ts<Commitment>();
    static constexpr size_t num_elements_fr = bb::field_conversion::calc_num_uint256_ts<FF>();
    // Proof length formula
    static constexpr size_t OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        /* 1. NUM_WITNESS_ENTITIES commitments */ (NUM_WITNESS_ENTITIES * num_elements_comm);
    // WORKTODO
    static constexpr size_t DECIDER_PROOF_LENGTH =
        /* 2. CONST_PROOF_SIZE_LOG_N sumcheck univariates */
        (CONST_PROOF_SIZE_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * num_elements_fr) +
        /* 3. NUM_ALL_ENTITIES sumcheck evaluations */ (NUM_ALL_ENTITIES * num_elements_fr) +
        /* 4. CONST_PROOF_SIZE_LOG_N - 1 Gemini Fold commitments */ ((CONST_PROOF_SIZE_LOG_N - 1) * num_elements_comm) +
        /* 5. CONST_PROOF_SIZE_LOG_N Gemini a evaluations */ (CONST_PROOF_SIZE_LOG_N * num_elements_fr) +
        /* 6. Shplonk Q commitment */ (num_elements_comm) +
        /* 7. KZG W commitment */ (num_elements_comm);
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + DECIDER_PROOF_LENGTH;

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1094): Add aggregation to the verifier contract so the
    // VerificationKey from UltraFlavor can be used
    class VerificationKey : public NativeVerificationKey_<PrecomputedEntities<Commitment>, Transcript> {
      public:
        static constexpr size_t VERIFICATION_KEY_LENGTH =
            /* 1. Metadata (log_circuit_size, num_public_inputs, pub_inputs_offset) */ (3 * num_elements_fr) +
            /* 2. NUM_PRECOMPUTED_ENTITIES commitments */ (NUM_PRECOMPUTED_ENTITIES * num_elements_comm);

        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : NativeVerificationKey_(circuit_size, num_public_inputs)
        {}

        VerificationKey(const PrecomputedData& precomputed)
        {
            this->log_circuit_size = numeric::get_msb(precomputed.metadata.dyadic_size);
            this->num_public_inputs = precomputed.metadata.num_public_inputs;
            this->pub_inputs_offset = precomputed.metadata.pub_inputs_offset;

            CommitmentKey commitment_key{ precomputed.metadata.dyadic_size };
            for (auto [polynomial, commitment] : zip_view(precomputed.polynomials, this->get_all())) {
                commitment = commitment_key.commit(polynomial);
            }
        }

        /**
         * @brief Adds the verification key witnesses directly to the transcript.
         * @details Needed to make sure the Origin Tag system works. See the base class function for
         * more details.
         *
         * @param domain_separator
         * @param transcript
         *
         * @returns The hash of the verification key
         */
        fr add_hash_to_transcript(const std::string& domain_separator, Transcript& transcript) const override
        {
            // This hash contains a hash of the entire vk - including all of the elements
            const fr hash = this->hash();

            transcript.add_to_hash_buffer(domain_separator + "vk_hash", hash);
            return hash;
        }

        // Don't statically check for object completeness.
        using MSGPACK_NO_STATIC_CHECK = std::true_type;

        // For serialising and deserialising data
        MSGPACK_FIELDS(log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
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
                       q_memory,
                       q_nnf,
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
};

} // namespace bb
