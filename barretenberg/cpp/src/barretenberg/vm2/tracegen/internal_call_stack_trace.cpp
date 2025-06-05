#include "barretenberg/vm2/tracegen/internal_call_stack_trace.hpp"

namespace bb::avm2::tracegen {

void InternalCallStackBuilder::process(
    const simulation::EventEmitterInterface<simulation::InternalCallStackEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 0;

    for (const auto& event : events) {
        trace.set(row,
                  { {
                      { C::internal_call_stack_sel, 1 },
                      { C::internal_call_stack_context_id, event.context_id },
                      { C::internal_call_stack_entered_call_id, event.entered_call_id },
                      { C::internal_call_stack_id, event.id },
                      { C::internal_call_stack_return_id, event.return_id },
                      { C::internal_call_stack_return_pc, event.return_pc },
                  } });
        row++;
    }
}

} // namespace bb::avm2::tracegen
