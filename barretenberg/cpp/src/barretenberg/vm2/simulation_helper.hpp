#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <cstdint>

namespace bb::avm2 {

class AvmSimulationHelper {
  public:
    // Full simulation with event collection.
    simulation::EventsContainer simulate_for_witgen(const ExecutionHints& hints);

    // Fast simulation without event collection.
    // FIXME(fcarreiro): This should eventually only take the Tx.
    void simulate_fast(const ExecutionHints& hints);
    // The only portion of the public inputs that we need in simulation.
    // Required to generate some ff_gt events at the end of the simulation in order to
    // constrain that leaf slots are sorted in order of public data writes for squashing.
    std::array<PublicDataWrite, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX> publicDataWrites;
    uint32_t publicDataWritesLength;
};

} // namespace bb::avm2
