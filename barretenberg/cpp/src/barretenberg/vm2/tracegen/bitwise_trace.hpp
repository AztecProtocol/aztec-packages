#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class BitwiseTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::BitwiseEvent>::Container& events,
                 TraceContainer& trace);
};

} // namespace bb::avm2::tracegen