#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class KeccakF1600TraceBuilder final {
  public:
    KeccakF1600TraceBuilder();
    void process_permutation(const simulation::EventEmitterInterface<simulation::KeccakF1600Event>::Container& events,
                             TraceContainer& trace);
    void process_memory_slices(const simulation::EventEmitterInterface<simulation::KeccakF1600Event>::Container& events,
                               TraceContainer& trace);

    static const InteractionDefinition interactions;

  private:
    // Precomputed inverses from 0, 1 ... AVM_KECCAKF1600_STATE_SIZE.
    std::array<FF, AVM_KECCAKF1600_STATE_SIZE + 1> precomputed_inverses;
    void process_single_slice(const simulation::KeccakF1600Event& event,
                              bool write,
                              uint32_t& row,
                              TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
