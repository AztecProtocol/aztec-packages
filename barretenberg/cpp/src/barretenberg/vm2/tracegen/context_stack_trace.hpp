#pragma once

#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class ContextStackTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::ContextStackEvent>::Container& ctx_stack_events,
                 TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
