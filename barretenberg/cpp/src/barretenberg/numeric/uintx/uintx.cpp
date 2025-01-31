#include "uintx.hpp"

namespace bb::numeric {
template class uintx<uint256_t>;
template class uintx<uintx<uint256_t>>;
} // namespace bb::numeric