#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2 {

using MemoryTag = ValueTag;
using MemoryValue = TaggedValue;
using MemoryAddress = uint32_t;
constexpr auto MemoryAddressTag = MemoryTag::U32;
// Related constants are AVM_HIGHEST_MEM_ADDRESS and AVM_MEMORY_NUM_BITS, i.e.,
// should we change the alias MemoryAddress to another type (e.g., uint64_t)
// then these two constants need to be adjusted.

uint8_t integral_tag_length(MemoryTag tag);

} // namespace bb::avm2
