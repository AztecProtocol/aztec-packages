
#ifdef STARKNET_GARAGA_FLAVORS
#pragma once

#include "barretenberg/ext/starknet/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"

namespace bb {

class UltraStarknetFlavor : public UltraKeccakFlavor {
  public:
    using Transcript = Transcript_<starknet::StarknetTranscriptParams>;
};

} // namespace bb
#endif
