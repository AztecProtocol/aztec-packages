#pragma once

#include "barretenberg/ext/starknet/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_zk_flavor.hpp"

namespace bb {

class UltraStarknetZKFlavor : public UltraKeccakZKFlavor {
  public:
    using Transcript = UltraStarknetZKFlavor::Transcript_<starknet::StarknetTranscriptParams>;
};

} // namespace bb
