#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
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

  private:
    // Helper called by simulate_fast* functions.
    void simulate_fast(simulation::ContractDBInterface& raw_contract_db,
                       simulation::LowLevelMerkleDBInterface& raw_merkle_db,
                       const Tx& tx,
                       const GlobalVariables& global_variables,
                       const ProtocolContracts& protocol_contracts);
};

} // namespace bb::avm2
