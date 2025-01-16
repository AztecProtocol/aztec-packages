#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"

namespace bb::avm2::simulation {

// Temporary.
struct Tx {
    std::vector<PublicExecutionRequest> enqueued_calls;
};

// In charge of executing a transaction.
class TxExecution final {
  public:
    TxExecution(ExecutionInterface& call_execution)
        : call_execution(call_execution){};

    void simulate(const Tx& tx);

  private:
    ExecutionInterface& call_execution;
};

} // namespace bb::avm2::simulation