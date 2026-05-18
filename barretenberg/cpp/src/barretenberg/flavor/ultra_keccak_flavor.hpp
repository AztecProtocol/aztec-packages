// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

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

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
