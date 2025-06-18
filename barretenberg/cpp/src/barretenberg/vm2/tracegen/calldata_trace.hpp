#pragma once

#include <memory>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class CalldataTraceBuilder final {
  public:
    void process_retrieval(const simulation::EventEmitterInterface<simulation::CalldataEvent>::Container& events,
                           TraceContainer& trace);
    void process_hashing(const simulation::EventEmitterInterface<simulation::CalldataEvent>::Container& events,
                         TraceContainer& trace);

    static const InteractionDefinition interactions;
};

} // namespace bb::avm2::tracegen
