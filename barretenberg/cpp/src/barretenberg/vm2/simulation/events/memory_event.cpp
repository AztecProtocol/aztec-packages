#include "barretenberg/vm2/simulation/events/memory_event.hpp"

namespace bb::avm2::simulation {

static_assert(MemoryMode::READ < MemoryMode::WRITE, "MemoryMode::READ must be less than MemoryMode::WRITE");

// Sorting order precedence is: space_id, addr, execution_clk, mode.
bool MemoryEvent::operator<(MemoryEvent const& other) const
{
    return std::make_tuple(space_id, addr, execution_clk, mode) <
           std::make_tuple(other.space_id, other.addr, other.execution_clk, other.mode);
}

} // namespace bb::avm2::simulation
