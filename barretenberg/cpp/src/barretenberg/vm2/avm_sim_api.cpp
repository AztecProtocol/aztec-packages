#include "barretenberg/vm2/avm_sim_api.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

TxSimulationResult AvmSimAPI::simulate(const FastSimulationInputs& inputs,
                                       simulation::ContractDBInterface& contract_db,
                                       world_state::WorldState& ws)
{
    vinfo("Simulating...");
    AvmSimulationHelper simulation_helper;

    if (inputs.config.collect_hints) {
        return AVM_TRACK_TIME_V("simulation/all",
                                simulation_helper.simulate_for_hint_collection(contract_db,
                                                                               inputs.ws_revision,
                                                                               ws,
                                                                               inputs.config,
                                                                               inputs.tx,
                                                                               inputs.global_variables,
                                                                               inputs.protocol_contracts));
    } else {
        return AVM_TRACK_TIME_V("simulation/all",
                                simulation_helper.simulate_fast_with_existing_ws(contract_db,
                                                                                 inputs.ws_revision,
                                                                                 ws,
                                                                                 inputs.config,
                                                                                 inputs.tx,
                                                                                 inputs.global_variables,
                                                                                 inputs.protocol_contracts));
    }
}

TxSimulationResult AvmSimAPI::simulate_with_hinted_dbs(const ProvingInputs& inputs)
{
    vinfo("Simulating...");
    AvmSimulationHelper simulation_helper;
    return AVM_TRACK_TIME_V("simulation/all", simulation_helper.simulate_fast_with_hinted_dbs(inputs.hints));
}

} // namespace bb::avm2
