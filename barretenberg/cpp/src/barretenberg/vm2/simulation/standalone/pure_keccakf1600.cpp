#include "barretenberg/vm2/simulation/standalone/pure_keccakf1600.hpp"

#include "barretenberg/common/log.hpp"
#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

void PureKeccakF1600::permutation(MemoryInterface& memory, MemoryAddress dst_addr, MemoryAddress src_addr)
{
    constexpr MemoryAddress HIGHEST_SLICE_ADDRESS = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 1;

    bool src_out_of_range = src_addr > HIGHEST_SLICE_ADDRESS;
    bool dst_out_of_range = dst_addr > HIGHEST_SLICE_ADDRESS;

    if (src_out_of_range) {
        throw KeccakF1600Exception(format("Read slice out of range: ", src_addr));
    }
    if (dst_out_of_range) {
        throw KeccakF1600Exception(format("Write slice out of range: ", dst_addr));
    }

    uint64_t state[AVM_KECCAKF1600_STATE_SIZE];

    // Read from memory
    for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE; ++i) {
        const auto addr = src_addr + static_cast<MemoryAddress>(i);
        const MemoryValue& mem_val = memory.get(addr);
        const MemoryTag tag = mem_val.get_tag();

        if (tag != MemoryTag::U64) {
            throw KeccakF1600Exception(
                format("Read slice tag invalid - addr: ", addr, " tag: ", static_cast<uint32_t>(tag)));
        }

        state[i] = mem_val.as<uint64_t>();
    }

    // Perform permutation
    ethash_keccakf1600(state);

    // Write back to memory
    for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE; ++i) {
        memory.set(dst_addr + static_cast<MemoryAddress>(i), MemoryValue::from<uint64_t>(state[i]));
    }
}

} // namespace bb::avm2::simulation
