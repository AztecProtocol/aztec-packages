#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace bb::avm2 {

const std::array<std::vector<uint8_t>, 257>& get_p_limbs_per_radix();
size_t get_p_limbs_per_radix_size(size_t radix);

} // namespace bb::avm2
