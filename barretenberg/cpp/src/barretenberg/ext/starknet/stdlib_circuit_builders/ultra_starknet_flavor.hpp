#pragma once

#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"
#include "barretenberg/ext/starknet/transcript/transcript.hpp"

namespace bb {

class UltraStarknetFlavor : public UltraKeccakFlavor {
  public:
    using Transcript = UltraStarknetFlavor::Transcript_<starknet::StarknetTranscriptParams>;
};

} // namespace bb
