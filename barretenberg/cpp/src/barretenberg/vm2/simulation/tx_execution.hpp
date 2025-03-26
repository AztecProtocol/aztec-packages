#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"

namespace bb::avm2::simulation {

// Temporary.
struct Tx {
    std::vector<EnqueuedCallHint> enqueued_calls;
};

// In charge of executing a transaction.
class TxExecution final {
  public:
    TxExecution(ExecutionInterface& call_execution)
        : call_execution(call_execution){};

    void simulate(const Tx& tx);

    std::unique_ptr<ContextInterface> make_enqueued_context(AztecAddress address,
                                                            AztecAddress msg_sender,
                                                            std::span<const FF> calldata,
                                                            bool is_static);

  private:
    ExecutionInterface& call_execution;
    // More things need to be lifted into the tx execution??
    // MerkleDB
};

} // namespace bb::avm2::simulation
