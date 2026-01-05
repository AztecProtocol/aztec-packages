// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "ecc_set_relation_impl.hpp"

namespace bb {
template class ECCVMSetRelationImpl<grumpkin::fr>;
DEFINE_SUMCHECK_RELATION_CLASS(ECCVMSetRelationImpl, ECCVMFlavor);
DEFINE_SUMCHECK_PERMUTATION_CLASS(ECCVMSetRelationImpl, ECCVMFlavor);

} // namespace bb
