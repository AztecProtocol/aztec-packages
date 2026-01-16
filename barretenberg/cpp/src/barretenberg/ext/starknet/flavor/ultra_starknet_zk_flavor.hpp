#ifdef STARKNET_GARAGA_FLAVORS
#pragma once

#include "barretenberg/ext/starknet/transcript/transcript.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"

namespace bb {

class UltraStarknetZKFlavor : public UltraKeccakZKFlavor {
  public:
    using Transcript = starknet::StarknetTranscript;
};
} // namespace bb
#endif
