#include "barretenberg/vm2/tracegen/memory_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

namespace bb::avm2::tracegen {

void MemoryTraceBuilder::process(const simulation::EventEmitterInterface<simulation::MemoryEvent>::Container& events,
                                 TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        trace.set(row,
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_address, event.addr },
                      { C::memory_value, event.value },
                      { C::memory_tag, static_cast<uint8_t>(event.value.get_tag()) },
                      { C::memory_rw, event.mode == simulation::MemoryMode::WRITE ? 1 : 0 },
                      { C::memory_space_id, event.space_id },
                  } });
        row++;
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> MemoryTraceBuilder::lookup_jobs()
{
    return {};
}

} // namespace bb::avm2::tracegen
