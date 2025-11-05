#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

struct Poseidon2Exception : public std::runtime_error {
    Poseidon2Exception(const std::string& message)
        : std::runtime_error("Poseidon2Exception: " + message)
    {}
};

struct Poseidon2HashEvent {
    std::vector<FF> inputs; // This input is padded to a multiple of 3
    std::vector<std::array<FF, 4>> intermediate_states;
    FF output;
};

struct Poseidon2PermutationEvent {
    std::array<FF, 4> input;
    std::array<FF, 4> output;
};

struct Poseidon2PermutationMemoryEvent {
    uint16_t space_id = 0;
    uint32_t execution_clk = 0;
    MemoryAddress src_address = 0;
    MemoryAddress dst_address = 0;
    // Need to know the tag value for error handling
    std::array<MemoryValue, 4> input;
    std::array<FF, 4> output;
};

} // namespace bb::avm2::simulation
