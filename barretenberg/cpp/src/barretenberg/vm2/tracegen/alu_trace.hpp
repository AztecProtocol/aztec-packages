#pragma once

#include <list>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class AluTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::AluEvent>::Container& events,
                 TraceContainer& trace);
};

} // namespace bb::avm2::tracegen