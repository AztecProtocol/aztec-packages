#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class Poseidon2TraceBuilder final {
  public:
    void process_hash(const simulation::EventEmitterInterface<simulation::Poseidon2HashEvent>::Container& hash_events,
                      TraceContainer& trace);
    void process_permutation(
        const simulation::EventEmitterInterface<simulation::Poseidon2PermutationEvent>::Container& perm_events,
        TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
