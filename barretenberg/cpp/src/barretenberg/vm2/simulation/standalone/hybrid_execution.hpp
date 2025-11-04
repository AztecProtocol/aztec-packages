#pragma once

#include "barretenberg/vm2/simulation/gadgets/execution.hpp"

namespace bb::avm2::simulation {

// This class is used in fast simulation only.
// It overrides the execution loop (to remove overhead) but it uses all the other
// methods from the "gadget" Execution class. That is, dispatching and the opcodes'
// implementations are shared.
class HybridExecution : public Execution {
  public:
    using Execution::Execution;
    EnqueuedCallResult execute(std::unique_ptr<ContextInterface> enqueued_call_context) override;

  private:
    std::vector<FF> extract_return_data(ContextInterface& context);
};

} // namespace bb::avm2::simulation
