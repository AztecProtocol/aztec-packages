#include "barretenberg/vm2/avm_sim_api.hpp"

#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

void AvmSimAPI::simulate_with_hinted_dbs(const ProvingInputs& inputs)
{
    info("Simulating...");
    AvmSimulationHelper simulation_helper;
    AVM_TRACK_TIME("simulation/all", simulation_helper.simulate_fast_with_hinted_dbs(inputs.hints));
}

} // namespace bb::avm2
