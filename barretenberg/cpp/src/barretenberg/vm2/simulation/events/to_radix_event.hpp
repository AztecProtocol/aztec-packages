#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

class ToRadixException : public std::runtime_error {
  public:
    explicit ToRadixException(const std::string& message)
        : std::runtime_error("ToRadix Exception: " + message)
    {}
};

struct ToRadixEvent {
    FF value;
    uint32_t radix;
    std::vector<uint8_t> limbs;

    bool operator==(const ToRadixEvent& other) const = default;
};

struct ToRadixMemoryEvent {
    uint32_t execution_clk;
    uint32_t space_id;
    MemoryAddress dst_addr;

    FF value;
    uint32_t radix;
    bool is_output_bits; // true if output is U1 or false if output is U8
    // Need to know if the output is U8 or U1
    std::vector<MemoryValue> limbs;
};

} // namespace bb::avm2::simulation
