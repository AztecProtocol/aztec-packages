#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/internal_call_stack_event.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class InternalCallStackBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::InternalStackEvent>::Container& events,
                 TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
