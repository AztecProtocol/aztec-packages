// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_relation_impl.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"

namespace bb {
template class ECCVMSetWnafRelationImpl<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
template class ECCVMSetScalarRelationImpl<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
template class ECCVMSetMsmRelationImpl<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(ECCVMSetWnafRelationImpl, ECCVMRecursiveFlavor);
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(ECCVMSetScalarRelationImpl, ECCVMRecursiveFlavor);
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(ECCVMSetMsmRelationImpl, ECCVMRecursiveFlavor);
DEFINE_SUMCHECK_VERIFIER_PERMUTATION_CLASS(ECCVMSetWnafRelationImpl, ECCVMRecursiveFlavor);
DEFINE_SUMCHECK_VERIFIER_PERMUTATION_CLASS(ECCVMSetScalarRelationImpl, ECCVMRecursiveFlavor);
DEFINE_SUMCHECK_VERIFIER_PERMUTATION_CLASS(ECCVMSetMsmRelationImpl, ECCVMRecursiveFlavor);
} // namespace bb
