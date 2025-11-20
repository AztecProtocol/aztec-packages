#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/interfaces/call_stack_metadata_collector.hpp"

namespace bb::avm2::simulation {

class MockCallStackMetadataCollector : public CallStackMetadataCollectorInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockCallStackMetadataCollector();
    ~MockCallStackMetadataCollector() override;

    MOCK_METHOD(void, set_phase, (CoarseTransactionPhase phase), (override));
    MOCK_METHOD(void,
                notify_enter_call,
                (const AztecAddress& contract_address,
                 uint32_t caller_pc,
                 const CalldataProvider& calldata_provider,
                 bool is_static_call,
                 const Gas& gas_limit),
                (override));
    MOCK_METHOD(void,
                notify_exit_call,
                (bool success,
                 uint32_t pc,
                 const std::optional<std::string>& halting_message,
                 const ReturnDataProvider& return_data_provider,
                 const InternalCallStackProvider& internal_call_stack_provider),
                (override));
    MOCK_METHOD(std::vector<CallStackMetadata>, dump_call_stack_metadata, (), (override));
};

} // namespace bb::avm2::simulation
