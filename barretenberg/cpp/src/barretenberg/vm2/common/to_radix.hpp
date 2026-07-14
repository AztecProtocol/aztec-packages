#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace bb::avm2 {

// Radix goes from 0 to 256 (inclusive); entries at indices 0 and 1 are unused.
constexpr size_t NUM_RADIXES = 257;

const std::array<std::vector<uint8_t>, NUM_RADIXES>& get_p_limbs_per_radix();
size_t get_p_limbs_per_radix_size(size_t radix);

} // namespace bb::avm2
