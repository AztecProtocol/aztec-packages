#pragma once

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"
#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"

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
                                                      const ProtocolContracts& protocol_contracts,
                                                      simulation::CancellationTokenPtr cancellation_token = nullptr);

    // Simulation to collect hints (used by the prover node).
    TxSimulationResult simulate_for_hint_collection(simulation::ContractDBInterface& raw_contract_db,
                                                    const world_state::WorldStateRevision& world_state_revision,
                                                    world_state::WorldState& ws,
                                                    const PublicSimulatorConfig& config,
                                                    const Tx& tx,
                                                    const GlobalVariables& global_variables,
                                                    const ProtocolContracts& protocol_contracts,
                                                    simulation::CancellationTokenPtr cancellation_token = nullptr);

    // Simulation with event collection (used in witgen and proving).
    simulation::EventsContainer simulate_for_witgen(const ExecutionHints& hints);

    // An extra entry point that is not used in production.
    TxSimulationResult simulate_fast_with_hinted_dbs(const ExecutionHints& hints, const PublicSimulatorConfig& config);

    // Fast simulation against any LowLevelMerkleDBInterface implementation (in-process, IPC, or hinted).
    // Used by the standalone aztec-avm and the NAPI AVM after the WSDB cutover, both of which
    // construct a WSDB-IPC-backed merkle DB rather than using an in-process WorldState reference.
    TxSimulationResult simulate_fast_internal(simulation::ContractDBInterface& raw_contract_db,
                                              simulation::LowLevelMerkleDBInterface& raw_merkle_db,
                                              const PublicSimulatorConfig& config,
                                              const Tx& tx,
                                              const GlobalVariables& global_variables,
                                              const ProtocolContracts& protocol_contracts,
                                              simulation::CancellationTokenPtr cancellation_token = nullptr);

  protected:
    template <template <typename> class DefaultEventEmitter, template <typename> class DefaultDeduplicatingEventEmitter>
    std::tuple<simulation::EventsContainer, TxSimulationResult> simulate_for_witgen_internal(
        simulation::ContractDBInterface& raw_contract_db,
        simulation::LowLevelMerkleDBInterface& raw_merkle_db,
        const PublicSimulatorConfig& config,
        const Tx& tx,
        const GlobalVariables& global_variables,
        const ProtocolContracts& protocol_contracts);
};

} // namespace bb::avm2
