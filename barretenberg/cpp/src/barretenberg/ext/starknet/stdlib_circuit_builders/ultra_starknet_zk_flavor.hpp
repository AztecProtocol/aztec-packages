#pragma once

#include "barretenberg/stdlib_circuit_builders/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/ext/starknet/transcript/transcript.hpp"

namespace bb {

class UltraStarknetZKFlavor : public UltraKeccakZKFlavor {
  public:
    using Transcript = UltraStarknetZKFlavor::Transcript_<starknet::StarknetTranscriptParams>;
};

} // namespace bb
