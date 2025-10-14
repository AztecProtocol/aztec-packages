// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

// TODO: the only change should be making honk generic over the transcript
#pragma once
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

class UltraKeccakFlavor : public bb::UltraFlavor {
  public:
    using Transcript = UltraKeccakFlavor::Transcript_<U256Codec, bb::crypto::Keccak>;

    static constexpr bool USE_PADDING = false;

    // Override as proof length is different
    static constexpr size_t num_elements_comm = U256Codec::calc_num_fields<Commitment>();
    static constexpr size_t num_elements_fr = U256Codec::calc_num_fields<FF>();

    // Proof length formula methods
    static constexpr size_t OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        /* 1. NUM_WITNESS_ENTITIES commitments */ (NUM_WITNESS_ENTITIES * num_elements_comm);

    static constexpr size_t DECIDER_PROOF_LENGTH(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return /* 2. virtual_log_n sumcheck univariates */
            (virtual_log_n * BATCHED_RELATION_PARTIAL_LENGTH * num_elements_fr) +
            /* 3. NUM_ALL_ENTITIES sumcheck evaluations */ (NUM_ALL_ENTITIES * num_elements_fr) +
            /* 4. virtual_log_n - 1 Gemini Fold commitments */ ((virtual_log_n - 1) * num_elements_comm) +
            /* 5. virtual_log_n Gemini a evaluations */ (virtual_log_n * num_elements_fr) +
            /* 6. Shplonk Q commitment */ (num_elements_comm) +
            /* 7. KZG W commitment */ (num_elements_comm);
    }

    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + DECIDER_PROOF_LENGTH(virtual_log_n);
    }

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
    };

    // Specialize for Ultra (general case used in UltraRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb
