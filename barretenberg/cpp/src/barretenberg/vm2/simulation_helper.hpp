#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"

namespace bb::avm2 {

class AvmSimulationHelper {
  public:
    // Full simulation with event collection.
    simulation::EventsContainer simulate_for_witgen(const ExecutionHints& hints);

    // Fast simulation without event collection.
    TxSimulationResult simulate_fast_with_existing_ws(simulation::ContractDBInterface& raw_contract_db,
                                                      const world_state::WorldStateRevision& world_state_revision,
                                                      world_state::WorldState& ws,
                                                      const Tx& tx,
                                                      const GlobalVariables& global_variables,
                                                      const ProtocolContracts& protocol_contracts);

    TxSimulationResult simulate_fast_with_hinted_dbs(const ExecutionHints& hints);

    // Simulate a bytecode with some calldata and additional context.
    // Note: this assumes that no nested calls are ever made to other bytecodes.
    // This should only be used for fuzzing right now - it only simulates an enqueued call rather than an entire tx.
    simulation::EnqueuedCallResult simulate_bytecode(const AztecAddress& address,
                                                     const AztecAddress& sender,
                                                     const FF& transaction_fee,
                                                     const GlobalVariables& globals,
                                                     bool is_static_call,
                                                     const std::vector<FF>& calldata,
                                                     const Gas& gas_limit,
                                                     const std::vector<uint8_t>& bytecode);

  private:
    // Helper called by simulate_fast* functions.
    TxSimulationResult simulate_fast(simulation::ContractDBInterface& raw_contract_db,
                                     simulation::LowLevelMerkleDBInterface& raw_merkle_db,
                                     const Tx& tx,
                                     const GlobalVariables& global_variables,
                                     const ProtocolContracts& protocol_contracts);
};

} // namespace bb::avm2
