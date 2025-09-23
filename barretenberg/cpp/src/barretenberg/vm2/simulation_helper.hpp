#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"

namespace bb::avm2 {

class AvmSimulationHelper {
  public:
    // Full simulation with event collection.
    simulation::EventsContainer simulate_for_witgen(const ExecutionHints& hints);

    // Fast simulation without event collection.
    // FIXME(fcarreiro): This should eventually only take the Tx.
    void simulate_fast(const ExecutionHints& hints);
};

} // namespace bb::avm2
