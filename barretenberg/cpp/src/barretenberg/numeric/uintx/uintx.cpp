// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/numeric/uintx/uintx.hpp"
#include "uintx_impl.hpp"

namespace bb::numeric {

template class uintx<numeric::uint256_t>;
template class uintx<uint512_t>;

} // namespace bb::numeric
