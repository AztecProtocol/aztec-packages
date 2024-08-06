
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/generated/avm/sha256.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/vm/recursion/avm_recursive_flavor.hpp"

namespace bb {
template class Avm_vm::sha256Impl<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(Avm_vm::sha256Impl, AvmRecursiveFlavor_<UltraCircuitBuilder>);
} // namespace bb
