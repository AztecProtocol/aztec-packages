#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"

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
    // FIXME(fcarreiro): This should eventually only take the Tx, Globals and not much more.
    void simulate_fast(const ExecutionHints& hints);

    // Simulate a bytecode with some calldata and additional context.
    // Note: this assumes that no nested calls are ever made to other bytecodes.
    simulation::ExecutionResult simulate_bytecode(AztecAddress address,
                                                  AztecAddress sender,
                                                  FF transaction_fee,
                                                  GlobalVariables globals,
                                                  bool is_static_call,
                                                  const std::vector<FF>& calldata,
                                                  Gas gas_limit,
                                                  const std::vector<uint8_t>& bytecode);
};

} // namespace bb::avm2
