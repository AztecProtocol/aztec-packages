#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

// Keep in sync with NUM_MEMORY_TAGS if we modify this enum.
enum class MemoryTag {
    FF,
    U1,
    U8,
    U16,
    U32,
    U64,
    U128,
};

constexpr uint8_t NUM_MEMORY_TAGS = static_cast<int>(MemoryTag::U128) + 1;

using MemoryAddress = uint32_t;
using MemoryValue = FF;
constexpr auto MemoryAddressTag = MemoryTag::U32;

uint8_t integral_tag_length(MemoryTag tag);

} // namespace bb::avm2