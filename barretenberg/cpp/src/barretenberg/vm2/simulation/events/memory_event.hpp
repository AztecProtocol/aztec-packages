#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

enum class MemoryMode {
    READ,
    WRITE,
};

struct MemoryEvent {
    uint32_t execution_clk;
    MemoryMode mode;
    MemoryAddress addr;
    MemoryValue value;
    uint16_t space_id;

    /**
     * @brief A comparator to be used by sorting algorithm (std::sort()). We sort first by
     *        ascending space_id, followed by address, then by clk and finally read/write.
     */
    bool operator<(MemoryEvent const& other) const;
};

} // namespace bb::avm2::simulation
