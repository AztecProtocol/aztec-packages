#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"

namespace bb::avm2::simulation {

// Temporary.
struct Tx {
    std::vector<EnqueuedCallHint> enqueued_calls;
};

// In charge of executing a transaction.
class TxExecution final {
  public:
    TxExecution(ExecutionInterface& call_execution, ContextProviderInterface& context_provider)
        : call_execution(call_execution)
        , context_provider(context_provider){};

    void simulate(const Tx& tx);

  private:
    ExecutionInterface& call_execution;
    // We want to keep the context provider here so we can manage the context ids globally (i.e.
    // across the enqueued and nested call)
    ContextProviderInterface& context_provider;
    // More things need to be lifted into the tx execution??
    // MerkleDB
};

} // namespace bb::avm2::simulation
