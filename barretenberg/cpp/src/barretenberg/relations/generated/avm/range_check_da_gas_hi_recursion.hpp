
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/generated/avm/range_check_da_gas_hi.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/vm/recursion/avm_recursive_flavor.hpp"

namespace bb {
template class Avm_vm::range_check_da_gas_hi<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(Avm_vm::range_check_da_gas_hi, AvmRecursiveFlavor_<UltraCircuitBuilder>);
} // namespace bb
