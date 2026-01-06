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
    using Codec = U256Codec;
    using HashFunction = bb::crypto::Keccak;
    using Transcript = BaseTranscript<Codec, HashFunction>;

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

    using VerificationKey = NativeVerificationKey_<PrecomputedEntities<Commitment>, Codec, HashFunction, CommitmentKey>;

    // Specialize for Ultra (general case used in UltraRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
