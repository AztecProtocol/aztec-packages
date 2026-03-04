#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

enum class MemoryMode {
    READ,
    WRITE,
};

struct MemoryEvent {
    uint32_t execution_clk = 0;
    MemoryMode mode = MemoryMode::READ;
    MemoryAddress addr = 0;
    MemoryValue value = MemoryValue::from_tag(MemoryTag::FF, 0);
    uint16_t space_id = 0;

    /**
     * @brief A comparator to be used by sorting algorithm (std::sort()). We sort first by
     *        ascending space_id, followed by address, then by clk and finally read/write.
     */
    bool operator<(MemoryEvent const& other) const;
};

} // namespace bb::avm2::simulation
