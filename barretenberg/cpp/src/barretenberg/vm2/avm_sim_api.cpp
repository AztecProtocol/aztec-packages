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
    info("Simulating...");
    AvmSimulationHelper simulation_helper;
    // TODO(MW): Add hint checks here
    return AVM_TRACK_TIME_V("simulation/all",
                            simulation_helper.simulate_fast_with_existing_ws(contract_db,
                                                                             inputs.ws_revision,
                                                                             ws,
                                                                             inputs.config,
                                                                             inputs.tx,
                                                                             inputs.global_variables,
                                                                             inputs.protocol_contracts));
}

TxSimulationResult AvmSimAPI::simulate_with_hinted_dbs(const ProvingInputs& inputs)
{
    info("Simulating...");
    AvmSimulationHelper simulation_helper;
    auto result = AVM_TRACK_TIME_V("simulation/all", simulation_helper.simulate_fast_with_hinted_dbs(inputs.hints));

    if (debug_logging) {
        // TODO(fcarreiro): Enable once PI generation is complete.
        // BB_ASSERT_EQ(inputs.public_inputs, result.public_inputs);
    }

    return result;
}

} // namespace bb::avm2
