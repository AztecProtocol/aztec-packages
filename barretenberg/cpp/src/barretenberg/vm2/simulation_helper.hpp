#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"
#include "barretenberg/world_state/types.hpp"

namespace bb::avm2 {

class AvmSimulationHelper {
  public:
    // Full simulation with event collection.
    // public_data_writes are required to generate some ff_gt events at the end of the simulation in order to
    // constrain that leaf slots of public data writes are sorted in ascending order.
    // This is needed to perform squashing of public data writes.
    simulation::EventsContainer simulate_for_witgen(const ExecutionHints& hints,
                                                    std::vector<PublicDataWrite> public_data_writes);

    // Fast simulation without event collection.
    void simulate_fast_with_hinted_dbs(const ExecutionHints& hints);

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
    void simulate_fast(simulation::ContractDBInterface& raw_contract_db,
                       simulation::LowLevelMerkleDBInterface& raw_merkle_db,
                       const Tx& tx,
                       const GlobalVariables& global_variables,
                       const ProtocolContracts& protocol_contracts);
};

} // namespace bb::avm2
