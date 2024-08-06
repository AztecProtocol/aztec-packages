
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/generated/avm/perm_main_mem_c.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/vm/recursion/avm_recursive_flavor.hpp"

namespace bb {
template class Avm_vm::perm_main_mem_c<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(Avm_vm::perm_main_mem_c, AvmRecursiveFlavor_<UltraCircuitBuilder>);
} // namespace bb
