// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_relation_impl.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"

namespace bb {
template class ECCVMMSMRelationImpl<stdlib::bigfield<UltraCircuitBuilder, bb::Bn254FqParams>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(ECCVMMSMRelationImpl, ECCVMRecursiveFlavor);
} // namespace bb
