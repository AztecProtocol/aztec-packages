
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/generated/avm/perm_main_alu.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/vm/recursion/avm_recursive_flavor.hpp"

namespace bb {
template class Avm_vm::perm_main_alu<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(Avm_vm::perm_main_alu, AvmRecursiveFlavor_<UltraCircuitBuilder>);
} // namespace bb
