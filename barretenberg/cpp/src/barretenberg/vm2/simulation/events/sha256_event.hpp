#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

struct Sha256CompressionException : public std::runtime_error {
    Sha256CompressionException(const std::string& message)
        : std::runtime_error("Sha256CompressionException: " + message)
    {}
};

struct Sha256CompressionEvent {
    uint32_t execution_clk;
    uint16_t space_id;
    MemoryAddress state_addr;
    MemoryAddress input_addr;
    MemoryAddress output_addr;
    std::array<MemoryValue, 8> state;
    std::vector<MemoryValue> input;
    std::array<MemoryValue, 8> output;
};

} // namespace bb::avm2::simulation
