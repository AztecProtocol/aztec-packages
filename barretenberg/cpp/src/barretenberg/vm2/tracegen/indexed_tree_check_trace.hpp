#pragma once

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/indexed_tree_check_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class IndexedTreeCheckTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::IndexedTreeCheckEvent>::Container& events,
                 TraceContainer& trace);

    static const InteractionDefinition interactions;
};

} // namespace bb::avm2::tracegen
