#pragma once

#include <array>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

namespace {

const auto default_value = MemoryValue::from_tag(MemoryTag::FF, 0);

const std::array<MemoryValue, 8> DEFAULT_STATE = { default_value, default_value, default_value, default_value,
                                                   default_value, default_value, default_value, default_value };

} // namespace

struct Sha256CompressionException : public std::runtime_error {
    Sha256CompressionException(const std::string& message)
        : std::runtime_error("Sha256CompressionException: " + message)
    {}
};

struct Sha256CompressionEvent {
    uint32_t execution_clk = 0;
    uint16_t space_id = 0;
    MemoryAddress state_addr = 0;
    MemoryAddress input_addr = 0;
    MemoryAddress output_addr = 0;
    std::array<MemoryValue, 8> state = DEFAULT_STATE;
    std::vector<MemoryValue> input;
    std::array<MemoryValue, 8> output = DEFAULT_STATE;
};

} // namespace bb::avm2::simulation
