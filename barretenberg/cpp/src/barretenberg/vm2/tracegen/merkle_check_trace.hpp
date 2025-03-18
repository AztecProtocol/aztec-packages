#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class MerkleCheckTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::MerkleCheckEvent>::Container& events,
                 TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
