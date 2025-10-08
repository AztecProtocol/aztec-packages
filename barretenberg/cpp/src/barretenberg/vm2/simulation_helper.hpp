#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"

namespace bb::avm2 {

class AvmSimulationHelper {
  public:
    // Full simulation with event collection.
    // public_data_writes are required to generate some ff_gt events at the end of the simulation in order to
    // constrain that leaf slots of public data writes are sorted in ascending order.
    // This is needed to perform squashing of public data writes.
    simulation::EventsContainer simulate_for_witgen(const ExecutionHints& hints,
                                                    std::vector<PublicDataWrite> public_data_writes);

    // Fast simulation without event collection.
    // FIXME(fcarreiro): This should eventually only take the Tx, Globals and not much more.
    void simulate_fast(const ExecutionHints& hints);
};

} // namespace bb::avm2
