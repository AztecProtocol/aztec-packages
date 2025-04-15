#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"

namespace bb::avm2 {

class AvmSimulationHelper {
  public:
    AvmSimulationHelper(ExecutionHints hints)
        : hints(std::move(hints))
    {}

    // Full simulation with event collection.
    simulation::EventsContainer simulate();

    // Fast simulation without event collection.
    void simulate_fast();

  private:
    template <typename S> simulation::EventsContainer simulate_with_settings();

    ExecutionHints hints;
};

} // namespace bb::avm2
