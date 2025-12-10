#pragma once

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"

namespace bb::avm2 {

class AvmSimulationHelper {
  public:
    // Fast simulation without event collection (used in block building, TXE, etc).
    TxSimulationResult simulate_fast_with_existing_ws(simulation::ContractDBInterface& raw_contract_db,
                                                      const world_state::WorldStateRevision& world_state_revision,
                                                      world_state::WorldState& ws,
                                                      const PublicSimulatorConfig& config,
                                                      const Tx& tx,
                                                      const GlobalVariables& global_variables,
                                                      const ProtocolContracts& protocol_contracts);

    // Simulation to collect hints (used by the proving agent).
    TxSimulationResult simulate_for_hint_collection(simulation::ContractDBInterface& raw_contract_db,
                                                    const world_state::WorldStateRevision& world_state_revision,
                                                    world_state::WorldState& ws,
                                                    const PublicSimulatorConfig& config,
                                                    const Tx& tx,
                                                    const GlobalVariables& global_variables,
                                                    const ProtocolContracts& protocol_contracts);

    // Simulation with event collection (used in witgen and proving).
    simulation::EventsContainer simulate_for_witgen(const ExecutionHints& hints);

    // An extra entry point that is not used in production.
    TxSimulationResult simulate_fast_with_hinted_dbs(const ExecutionHints& hints);

  protected:
    TxSimulationResult simulate_fast_internal(simulation::ContractDBInterface& raw_contract_db,
                                              simulation::LowLevelMerkleDBInterface& raw_merkle_db,
                                              const PublicSimulatorConfig& config,
                                              const Tx& tx,
                                              const GlobalVariables& global_variables,
                                              const ProtocolContracts& protocol_contracts);

    std::tuple<simulation::EventsContainer, TxSimulationResult> simulate_for_witgen_internal(
        simulation::ContractDBInterface& raw_contract_db,
        simulation::LowLevelMerkleDBInterface& raw_merkle_db,
        const PublicSimulatorConfig& config,
        const Tx& tx,
        const GlobalVariables& global_variables,
        const ProtocolContracts& protocol_contracts);
};

} // namespace bb::avm2
