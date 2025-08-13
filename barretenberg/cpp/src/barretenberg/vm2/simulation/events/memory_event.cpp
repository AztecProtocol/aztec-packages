#include "barretenberg/vm2/simulation/events/memory_event.hpp"

namespace bb::avm2::simulation {

static_assert(MemoryMode::READ < MemoryMode::WRITE, "MemoryMode::READ must be less than MemoryMode::WRITE");

bool MemoryEvent::operator<(MemoryEvent const& other) const
{
    // Sort first by ascending space_id
    if (space_id != other.space_id) {
        return space_id < other.space_id;
    }

    // Then by address
    if (addr != other.addr) {
        return addr < other.addr;
    }

    // Then by clk
    if (execution_clk != other.execution_clk) {
        return execution_clk < other.execution_clk;
    }

    // Finally by read/write (guaranteed by static_assert above)
    return mode < other.mode;
}

} // namespace bb::avm2::simulation
