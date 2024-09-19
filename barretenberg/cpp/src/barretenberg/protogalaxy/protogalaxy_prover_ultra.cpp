// Note: this is split up from protogalaxy_prover_impl.hpp for compile performance reasons
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "protogalaxy_prover_impl.hpp"

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1076) Remove this instantiation.
namespace bb {
template class ProtogalaxyProver_<DeciderProvingKeys_<UltraFlavor, 2>>;
} // namespace bb