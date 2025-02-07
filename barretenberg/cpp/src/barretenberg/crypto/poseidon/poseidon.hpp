#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace bb::crypto {

using PoseidonHash = std::array<uint8_t, 32>;

PoseidonHash poseidon_stark252(const std::vector<uint8_t>& input);

} // namespace bb::crypto
