#include "barretenberg/vm2/tracegen/memory_trace.hpp"

#include <memory>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void MemoryTraceBuilder::process(const simulation::EventEmitterInterface<simulation::MemoryEvent>::Container& events,
                                 TraceContainer& trace)
{
    // Create a vector of pointers to avoid copying the events
    std::vector<const simulation::MemoryEvent*> event_ptrs;
    event_ptrs.reserve(events.size());

    for (const auto& event : events) {
        event_ptrs.push_back(&event);
    }

    std::ranges::sort(event_ptrs, [](const auto* lhs, const auto* rhs) { return lhs->operator<(*rhs); });

    using C = Column;

    uint32_t row = 0;
    for (const auto* event_ptr : event_ptrs) {
        trace.set(row,
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_clk, event_ptr->execution_clk },
                      { C::memory_address, event_ptr->addr },
                      { C::memory_value, event_ptr->value },
                      { C::memory_tag, static_cast<uint8_t>(event_ptr->value.get_tag()) },
                      { C::memory_rw, event_ptr->mode == simulation::MemoryMode::WRITE ? 1 : 0 },
                      { C::memory_space_id, event_ptr->space_id },
                  } });
        row++;
    }
}

const InteractionDefinition MemoryTraceBuilder::interactions = InteractionDefinition();

} // namespace bb::avm2::tracegen
