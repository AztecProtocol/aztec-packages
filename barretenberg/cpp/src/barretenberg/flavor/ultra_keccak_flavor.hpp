// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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

    using VerificationKey = NativeVerificationKey_<PrecomputedEntities<Commitment>, Codec, HashFunction, CommitmentKey>;

    // Specialize for Ultra (general case used in UltraRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
