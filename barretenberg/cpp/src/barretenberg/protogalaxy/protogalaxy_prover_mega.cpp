// Note: this is split up from protogalaxy_prover_impl.hpp for compile performance reasons
#include <algorithm>
#include <array>
#include <tuple>
#include <utility>
#include <vector>

#include "barretenberg/ecc/fields/field_impl.hpp"
#include "barretenberg/ecc/fields/field_impl_generic.hpp"
#include "barretenberg/ecc/fields/field_impl_x64.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/sumcheck/instance/instances.hpp"

namespace bb {

template class ProtoGalaxyProver_<ProverInstances_<MegaFlavor, 2>>;
} // namespace bb