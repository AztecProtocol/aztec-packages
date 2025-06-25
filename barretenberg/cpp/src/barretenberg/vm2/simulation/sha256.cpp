#include "barretenberg/vm2/simulation/sha256.hpp"

#include <cstdint>
#include <memory>
#include <sys/types.h>

#include "barretenberg/vm2/simulation/lib/sha256_compression.hpp"

namespace bb::avm2::simulation {

void Sha256::compression(ContextInterface& context,
                         MemoryAddress state_addr,
                         MemoryAddress input_addr,
                         MemoryAddress output_addr)
{
    std::array<uint32_t, 8> state;
    std::array<uint32_t, 16> input;

    auto& memory = context.get_memory();

    // Load 8 elements representing the state from memory.
    for (uint32_t i = 0; i < 8; ++i) {
        auto memory_value = memory.get(state_addr + i);
        // TODO: Check that the tag is U32 and do error handling.
        state[i] = memory_value.as<uint32_t>();
    }

    // Load 16 elements representing the input from memory.
    for (uint32_t i = 0; i < 16; ++i) {
        auto memory_value = memory.get(input_addr + i);
        // TODO: Check that the tag is U32 and do error handling.
        input[i] = memory_value.as<uint32_t>();
    }

    // Perform sha256 compression.
    std::array<uint32_t, 8> output = sha256_block(state, input);

    // Write the output back to memory.
    for (uint32_t i = 0; i < 8; ++i) {
        memory.set(output_addr + i, MemoryValue::from<uint32_t>(output[i]));
    }

    events.emit({ .execution_clk = execution_id_manager.get_execution_id(),
                  .state_addr = state_addr,
                  .input_addr = input_addr,
                  .output_addr = output_addr,
                  .state = state,
                  .input = input,
                  .output = output });
}

} // namespace bb::avm2::simulation
