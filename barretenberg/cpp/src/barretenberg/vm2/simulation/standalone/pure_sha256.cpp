#include "barretenberg/vm2/simulation/standalone/pure_sha256.hpp"

#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/events/sha256_event.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

void PureSha256::compression(MemoryInterface& memory,
                             MemoryAddress state_addr,
                             MemoryAddress input_addr,
                             MemoryAddress output_addr)
{
    // Check address ranges
    if (static_cast<uint64_t>(state_addr) + 7 > AVM_HIGHEST_MEM_ADDRESS ||
        static_cast<uint64_t>(input_addr) + 15 > AVM_HIGHEST_MEM_ADDRESS ||
        static_cast<uint64_t>(output_addr) + 7 > AVM_HIGHEST_MEM_ADDRESS) {
        throw Sha256CompressionException("Memory address out of range for sha256 compression.");
    }

    std::array<uint32_t, 8> state;
    for (size_t i = 0; i < 8; ++i) {
        MemoryValue val = memory.get(static_cast<MemoryAddress>(state_addr + i));
        if (val.get_tag() != MemoryTag::U32) {
            throw Sha256CompressionException("Invalid tag for sha256 state values.");
        }
        state[i] = val.as<uint32_t>();
    }

    std::array<uint32_t, 16> input;
    for (size_t i = 0; i < 16; ++i) {
        MemoryValue val = memory.get(static_cast<MemoryAddress>(input_addr + i));
        if (val.get_tag() != MemoryTag::U32) {
            throw Sha256CompressionException("Invalid tag for sha256 input values.");
        }
        input[i] = val.as<uint32_t>();
    }

    std::array<uint32_t, 8> output = crypto::sha256_block(state, input);

    for (size_t i = 0; i < 8; ++i) {
        memory.set(static_cast<MemoryAddress>(output_addr + i), MemoryValue::from<uint32_t>(output[i]));
    }
}

} // namespace bb::avm2::simulation
