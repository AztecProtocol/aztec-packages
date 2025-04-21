#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/update_check.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class UpdateCheckTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::UpdateCheckEvent>::Container& events,
                 TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
