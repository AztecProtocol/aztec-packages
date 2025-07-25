#pragma once

#include <memory>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class Poseidon2TraceBuilder final {
  public:
    void process_hash(const simulation::EventEmitterInterface<simulation::Poseidon2HashEvent>::Container& hash_events,
                      TraceContainer& trace);
    void process_permutation(
        const simulation::EventEmitterInterface<simulation::Poseidon2PermutationEvent>::Container& perm_events,
        TraceContainer& trace);

    void process_permutation_with_memory(const simulation::EventEmitterInterface<
                                             simulation::Poseidon2PermutationMemoryEvent>::Container& perm_mem_events,
                                         TraceContainer& trace);

    static const InteractionDefinition interactions;
};

} // namespace bb::avm2::tracegen
