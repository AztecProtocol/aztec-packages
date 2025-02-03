#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

enum class MemoryTag {
    FF,
    U1,
    U8,
    U16,
    U32,
    U64,
    U128,
};

using MemoryAddress = uint32_t;
using MemoryValue = FF;
constexpr auto MemoryAddressTag = MemoryTag::U32;

} // namespace bb::avm2