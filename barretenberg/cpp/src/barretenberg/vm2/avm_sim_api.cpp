#include "barretenberg/vm2/avm_sim_api.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

TxSimulationResult AvmSimAPI::simulate_with_hinted_dbs(const ProvingInputs& inputs)
{
    info("Simulating...");
    AvmSimulationHelper simulation_helper;
    auto result = AVM_TRACK_TIME_V("simulation/all", simulation_helper.simulate_fast_with_hinted_dbs(inputs.hints));

    if (debug_logging) {
        // TODO(fcarreiro): Enable once PI generation is complete.
        // BB_ASSERT_EQ(inputs.publicInputs, result.public_inputs);
    }

    return result;
}

} // namespace bb::avm2
