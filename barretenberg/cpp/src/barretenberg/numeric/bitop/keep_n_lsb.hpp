// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <cstddef>

namespace bb::numeric {

template <typename T> inline T keep_n_lsb(T const& input, size_t num_bits)
{
    return num_bits >= sizeof(T) * 8 ? input : input & ((T(1) << num_bits) - 1);
}

} // namespace bb::numeric
