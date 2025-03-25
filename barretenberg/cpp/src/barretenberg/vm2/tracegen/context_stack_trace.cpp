#include "barretenberg/vm2/tracegen/context_stack_trace.hpp"

#include <cstdint>

#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::tracegen {

void ContextStackTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ContextStackEvent>::Container& ctx_stack_events,
    TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 0;

    for (const auto& event : ctx_stack_events) {
        trace.set(row,
                  { { { C::context_stack_context_id, event.id },
                      { C::context_stack_pc, event.next_pc },
                      { C::context_stack_msg_sender, event.msg_sender },
                      { C::context_stack_contract_address, event.contract_addr },
                      { C::context_stack_is_static, event.is_static } } });
        row++;
    }
}

} // namespace bb::avm2::tracegen
