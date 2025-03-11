#pragma once

#include <cstdint>
#include <span>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

std::array<uint32_t, 8> sha256_block(const std::array<uint32_t, 8>& h_init, const std::array<uint32_t, 16>& input);
constexpr uint32_t ror(uint32_t val, uint32_t shift)
{
    return (val >> (shift & 31U)) | (val << (32U - (shift & 31U)));
}

} // namespace bb::avm2::simulation
