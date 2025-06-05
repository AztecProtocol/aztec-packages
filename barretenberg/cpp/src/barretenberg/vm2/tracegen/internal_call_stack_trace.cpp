#include "barretenberg/vm2/tracegen/internal_call_stack_trace.hpp"

#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

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
                      { C::call_stack_sel, 1 },
                      { C::call_stack_context_id, event.context_id },
                      { C::call_stack_entered_call_id, event.call_ptr.entered_call_id },
                      { C::call_stack_id, event.call_ptr.id },
                      { C::call_stack_return_id, event.call_ptr.return_id },
                      { C::call_stack_return_pc, event.call_ptr.return_pc },
                  } });
        row++;
    }
}

} // namespace bb::avm2::tracegen
