#pragma once
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"

namespace bb {

class UltraStarknetFlavor : public bb::UltraKeccakFlavor {
  public:
    using Transcript = UltraStarknetFlavor::Transcript_<StarknetTranscriptParams>;
};

} // namespace bb
