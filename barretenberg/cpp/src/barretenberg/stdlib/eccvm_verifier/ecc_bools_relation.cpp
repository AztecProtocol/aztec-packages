#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/ecc_vm/ecc_bools_relation_impl.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"

namespace bb {
template class ECCVMBoolsRelationImpl<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
template class ECCVMBoolsRelationImpl<stdlib::bigfield<MegaCircuitBuilder, bb::Bn254FqParams>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(ECCVMBoolsRelationImpl, ECCVMRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(ECCVMBoolsRelationImpl, ECCVMRecursiveFlavor_<MegaCircuitBuilder>);
} // namespace bb
