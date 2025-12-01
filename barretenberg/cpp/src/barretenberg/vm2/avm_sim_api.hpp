#pragma once

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

namespace bb::avm2 {

class AvmSimAPI {
  public:
    using ProvingInputs = AvmProvingInputs;
    using FastSimulationInputs = AvmFastSimulationInputs;

    AvmSimAPI() = default;

    TxSimulationResult simulate(const FastSimulationInputs& inputs,
                                simulation::ContractDBInterface& contract_db,
                                world_state::WorldState& ws);
    TxSimulationResult simulate_with_hinted_dbs(const AvmProvingInputs& inputs);
};

} // namespace bb::avm2
