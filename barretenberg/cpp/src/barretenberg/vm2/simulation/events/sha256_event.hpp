#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {

struct Sha256CompressionEvent {
    MemoryAddress state_addr;
    MemoryAddress input_addr;
    MemoryAddress output_addr;
    std::array<uint32_t, 8> state;
    std::array<uint32_t, 16> input;
    std::array<uint32_t, 8> output;
};

} // namespace bb::avm2::simulation
