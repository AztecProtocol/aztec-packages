#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace bb::avm2 {

const std::array<std::vector<uint8_t>, 257>& getPLimbsPerRadix();

} // namespace bb::avm2
