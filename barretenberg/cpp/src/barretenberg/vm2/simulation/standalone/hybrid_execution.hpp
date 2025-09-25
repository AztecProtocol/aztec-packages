#pragma once

#include "barretenberg/vm2/simulation/gadgets/execution.hpp"

namespace bb::avm2::simulation {

class HybridExecution : public Execution {
  public:
    using Execution::Execution;
    ExecutionResult execute(std::unique_ptr<ContextInterface> enqueued_call_context) override;
};

} // namespace bb::avm2::simulation
