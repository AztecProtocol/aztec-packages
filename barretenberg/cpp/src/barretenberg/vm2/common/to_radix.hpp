#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace bb::avm2 {

const std::array<std::vector<uint8_t>, 257>& get_p_limbs_per_radix();
std::size_t get_p_limbs_per_radix_size(std::size_t radix);

} // namespace bb::avm2
