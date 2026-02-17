#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

struct ToRadixEvent {
    FF value = 0;
    uint32_t radix = 0;
    std::vector<uint8_t> limbs;

    bool operator==(const ToRadixEvent& other) const = default;
};

struct ToRadixMemoryEvent {
    uint32_t execution_clk = 0;
    uint16_t space_id = 0;
    uint32_t num_limbs = 0;
    MemoryAddress dst_addr = 0;

    FF value = 0;
    uint32_t radix = 0;
    bool is_output_bits = false; // true if output is U1 or false if output is U8
    // Need to know if the output is U8 or U1
    std::vector<MemoryValue> limbs;
};

} // namespace bb::avm2::simulation
