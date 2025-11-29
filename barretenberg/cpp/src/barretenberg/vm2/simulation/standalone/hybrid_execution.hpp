#pragma once

#include "barretenberg/vm2/simulation/gadgets/execution.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_addressing.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gas_tracker.hpp"

namespace bb::avm2::simulation {

// This class is used in fast simulation only.
// It overrides the execution loop (to remove overhead) but it uses all the other
// methods from the "gadget" Execution class. That is, dispatching and the opcodes'
// implementations are shared.
class HybridExecution : public Execution {
  public:
    // Forward constructor arguments to Execution, then initialize our reusable components.
    template <typename... Args>
    HybridExecution(Args&&... args)
        : Execution(std::forward<Args>(args)...)
        , reusable_addressing(instruction_info_db)
        , reusable_gas_tracker(instruction_info_db)
    {}

    EnqueuedCallResult execute(std::unique_ptr<ContextInterface> enqueued_call_context) override;

  protected:
    // Override to return our reusable gas tracker instead of the heap-allocated one.
    GasTrackerInterface& get_gas_tracker() override { return reusable_gas_tracker; }

  private:
    std::vector<FF> extract_return_data(ContextInterface& context);

    // Reusable addressing object - avoids heap allocation per instruction.
    PureAddressing reusable_addressing;

    // Reusable gas tracker - avoids heap allocation per instruction.
    PureGasTracker reusable_gas_tracker;
};

} // namespace bb::avm2::simulation
