#include "barretenberg/vm2/tracegen/internal_call_stack_trace.hpp"

#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

namespace bb::avm2::tracegen {

void InternalCallStackBuilder::process(
    const simulation::EventEmitterInterface<simulation::InternalStackEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // Has skip relations

    for (const auto& event : events) {
        trace.set(row,
                  { {
                      { C::internal_call_stack_sel, 1 },
                      { C::internal_call_stack_id, event.id },
                      { C::internal_call_stack_prev_id, event.prev_id },
                      { C::internal_call_stack_next_pc, event.next_pc },
                      { C::internal_call_stack_id_inv, FF(event.id).invert() },
                  } });
        row++;
    }
}

} // namespace bb::avm2::tracegen
