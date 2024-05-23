#include "barretenberg/eccvm_recursion/eccvm_recursive_flavor.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_relation_impl.hpp"

namespace bb {
template class ECCVMSetRelationImpl<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
template class ECCVMSetRelationImpl<stdlib::bigfield<GoblinUltraCircuitBuilder, bb::Bn254FqParams>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(ECCVMSetRelationImpl, ECCVMRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(ECCVMSetRelationImpl, ECCVMRecursiveFlavor_<GoblinUltraCircuitBuilder>);
DEFINE_SUMCHECK_VERIFIER_PERMUTATION_CLASS(ECCVMSetRelationImpl, ECCVMRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_SUMCHECK_VERIFIER_PERMUTATION_CLASS(ECCVMSetRelationImpl, ECCVMRecursiveFlavor_<GoblinUltraCircuitBuilder>);

} // namespace bb
