#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_read_event.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class PublicDataTreeReadTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::PublicDataTreeReadEvent>::Container& events,
                 TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
