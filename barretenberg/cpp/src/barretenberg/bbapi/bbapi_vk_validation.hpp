#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <string>
#include <vector>

namespace bb::bbapi {

template <typename VK> inline void validate_vk_size(const std::vector<uint8_t>& vk_bytes)
{
    const size_t expected_size = VK::calc_num_data_types() * sizeof(bb::fr);
    if (vk_bytes.size() != expected_size) {
        throw_or_abort("verification key has wrong size: expected " + std::to_string(expected_size) + ", got " +
                       std::to_string(vk_bytes.size()));
    }
}

} // namespace bb::bbapi
