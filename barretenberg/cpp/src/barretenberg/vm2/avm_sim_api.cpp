#include "barretenberg/vm2/avm_sim_api.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

TxSimulationResult AvmSimAPI::simulate(const FastSimulationInputs& inputs,
                                       simulation::ContractDBInterface& contract_db,
                                       simulation::LowLevelMerkleDBInterface& merkle_db,
                                       simulation::CancellationTokenPtr cancellation_token)
{
    vinfo("Simulating...");
    AvmSimulationHelper simulation_helper;

    // Hint collection still requires an in-process WorldState (PureRawMerkleDB plumbing). The IPC AVM
    // does not collect hints — that is handled by the prover-node which spawns its own simulator.
    BB_ASSERT(!inputs.config.collect_hints &&
              "Hint collection is not supported via simulate(merkle_db); use simulate_for_hint_collection on "
              "AvmSimulationHelper directly with an in-process WorldState.");

    return AVM_TRACK_TIME_V("simulation/all",
                            simulation_helper.simulate_fast_internal(contract_db,
                                                                     merkle_db,
                                                                     inputs.config,
                                                                     inputs.tx,
                                                                     inputs.global_variables,
                                                                     inputs.protocol_contracts,
                                                                     cancellation_token));
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
