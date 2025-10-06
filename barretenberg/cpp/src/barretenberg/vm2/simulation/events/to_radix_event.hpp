#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

struct ToRadixEvent {
    FF value;
    uint32_t radix;
    std::vector<uint8_t> limbs;

    bool operator==(const ToRadixEvent& other) const = default;
};

struct ToRadixMemoryEvent {
    uint32_t execution_clk;
    uint16_t space_id;
    uint32_t num_limbs;
    MemoryAddress dst_addr;

    FF value;
    uint32_t radix;
    bool is_output_bits; // true if output is U1 or false if output is U8
    // Need to know if the output is U8 or U1
    std::vector<MemoryValue> limbs;
};

} // namespace bb::avm2::simulation
