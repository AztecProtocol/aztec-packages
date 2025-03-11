#pragma once

#include <list>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class ExecutionTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& ex_events,
                 const simulation::EventEmitterInterface<simulation::AddressingEvent>::Container& addr_events,
                 TraceContainer& trace);
};

} // namespace bb::avm2::tracegen