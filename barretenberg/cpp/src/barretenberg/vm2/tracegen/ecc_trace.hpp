#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/ecc_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class EccTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::EccAddEvent>::Container& events,
                 TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
