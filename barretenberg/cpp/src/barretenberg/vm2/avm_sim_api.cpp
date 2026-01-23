#include "barretenberg/vm2/avm_sim_api.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

TxSimulationResult AvmSimAPI::simulate(const FastSimulationInputs& inputs,
                                       simulation::ContractDBInterface& contract_db,
                                       world_state::WorldState& ws,
                                       simulation::CancellationTokenPtr cancellation_token)
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
                                                                               inputs.protocol_contracts,
                                                                               cancellation_token));
    } else {
        return AVM_TRACK_TIME_V("simulation/all",
                                simulation_helper.simulate_fast_with_existing_ws(contract_db,
                                                                                 inputs.ws_revision,
                                                                                 ws,
                                                                                 inputs.config,
                                                                                 inputs.tx,
                                                                                 inputs.global_variables,
                                                                                 inputs.protocol_contracts,
                                                                                 cancellation_token));
    }
}

TxSimulationResult AvmSimAPI::simulate_with_hinted_dbs(const ProvingInputs& inputs)
{
    vinfo("Simulating...");
    AvmSimulationHelper simulation_helper;

    // Placeholder for future use of config from inputs.
    const PublicSimulatorConfig config = {};
    return AVM_TRACK_TIME_V("simulation/all", simulation_helper.simulate_fast_with_hinted_dbs(inputs.hints, config));
}

} // namespace bb::avm2
