#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class KeccakF1600TraceBuilder final {
  public:
    void process_permutation(const simulation::EventEmitterInterface<simulation::KeccakF1600Event>::Container& events,
                             TraceContainer& trace);
    void process_memory_slices(const simulation::EventEmitterInterface<simulation::KeccakF1600Event>::Container& events,
                               TraceContainer& trace);

    static const InteractionDefinition interactions;
};

} // namespace bb::avm2::tracegen
