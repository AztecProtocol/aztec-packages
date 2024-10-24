#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "ecc_lookup_relation_impl.hpp"

namespace bb {
template class ECCVMLookupRelationImpl<grumpkin::fr>;
DEFINE_ZK_SUMCHECK_RELATION_CLASS(ECCVMLookupRelationImpl, ECCVMFlavor);
} // namespace bb
