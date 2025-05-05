#pragma once

#include <memory>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class PublicDataTreeCheckTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::PublicDataTreeCheckEvent>::Container& events,
                 TraceContainer& trace);

    static std::vector<std::unique_ptr<class InteractionBuilderInterface>> lookup_jobs();
};

} // namespace bb::avm2::tracegen
