#pragma once

#include <memory>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/note_hash_tree_check_event.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class NoteHashTreeCheckTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::NoteHashTreeCheckEvent>::Container& events,
                 TraceContainer& trace);
    static std::vector<std::unique_ptr<class InteractionBuilderInterface>> lookup_jobs();
};

} // namespace bb::avm2::tracegen
