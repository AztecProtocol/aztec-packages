#pragma once
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_zk_flavor.hpp"

namespace bb {

class UltraStarknetZKFlavor : public bb::UltraKeccakZKFlavor {
  public:
    using Transcript = UltraStarknetZKFlavor::Transcript_<StarknetTranscriptParams>;
};

} // namespace bb
