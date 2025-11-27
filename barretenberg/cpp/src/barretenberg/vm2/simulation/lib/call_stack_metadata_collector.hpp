#pragma once

#include <stack>
#include <vector>

#include "barretenberg/vm2/simulation/interfaces/call_stack_metadata_collector.hpp"

namespace bb::avm2::simulation {

// Forward declaration.
class ContextInterface;
class InternalCallStackManagerInterface;

class CallStackMetadataCollector : public CallStackMetadataCollectorInterface {
  public:
    CallStackMetadataCollector() = default;

    void set_phase(CoarseTransactionPhase phase) override;
    void notify_enter_call(const AztecAddress& contract_address,
                           uint32_t caller_pc,
                           const CalldataProvider& calldata_provider,
                           bool is_static_call,
                           const Gas& gas_limit) override;
    void notify_exit_call(bool success,
                          uint32_t pc,
                          const std::optional<std::string>& halting_message,
                          const ReturnDataProvider& return_data_provider,
                          const InternalCallStackProvider& internal_call_stack_provider) override;
    void notify_tx_revert(const std::string& revert_message) override;
    std::vector<CallStackMetadata> dump_call_stack_metadata() override;

  private:
    // It is incremented by 1 for each new call.
    uint32_t timestamp = 0;
    // We start with a dummy call stack metadata. This is not a real call,
    // we use it as a placeholder "root call" that corresponds to the whole TX.
    // We store the enqueued calls in the nested vector of this root call.
    std::stack<CallStackMetadata> call_stack_metadata{ { {} } };
    CoarseTransactionPhase current_phase = CoarseTransactionPhase::SETUP;
};

// These factories return an object that is only valid for the lifetime of the context.
// The returned provider should never fail or throw.
CalldataProvider make_calldata_provider(const ContextInterface& context);
ReturnDataProvider make_return_data_provider(const ContextInterface& context, uint32_t rd_offset, uint32_t rd_size);
InternalCallStackProvider make_internal_call_stack_provider(
    const InternalCallStackManagerInterface& internal_call_stack_manager);

// Metadata collector that does not collect.
class NoopCallStackMetadataCollector : public CallStackMetadataCollectorInterface {
  public:
    void set_phase(CoarseTransactionPhase) override {}
    void notify_enter_call(const AztecAddress&, uint32_t, const CalldataProvider&, bool, const Gas&) override {}
    void notify_exit_call(bool,
                          uint32_t,
                          const std::optional<std::string>&,
                          const ReturnDataProvider&,
                          const InternalCallStackProvider&) override
    {}
    void notify_tx_revert(const std::string&) override {}
    std::vector<CallStackMetadata> dump_call_stack_metadata() override { return {}; }
};

} // namespace bb::avm2::simulation
