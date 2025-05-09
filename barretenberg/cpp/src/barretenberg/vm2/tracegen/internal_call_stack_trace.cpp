#include "barretenberg/vm2/tracegen/internal_call_stack_trace.hpp"

#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

namespace bb::avm2::tracegen {

void InternalCallStackBuilder::process(
    const simulation::EventEmitterInterface<simulation::InternalCallStackEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1; // Has skip relations

    for (const auto& event : events) {
        trace.set(row,
                  { {
                      { C::call_stack_sel, 1 },
                      { C::call_stack_id, event.id },
                      { C::call_stack_return_id, event.return_id },
                      { C::call_stack_return_pc, event.return_pc },
                      { C::call_stack_id_inv, FF(event.id).invert() },
                  } });
        row++;
    }
}

} // namespace bb::avm2::tracegen
