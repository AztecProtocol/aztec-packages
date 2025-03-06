#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace bb::avm2 {

// These are "extern" because the definition is in a different file.
extern const std::array<std::vector<uint8_t>, 257> P_LIMBS_PER_RADIX;

} // namespace bb::avm2
