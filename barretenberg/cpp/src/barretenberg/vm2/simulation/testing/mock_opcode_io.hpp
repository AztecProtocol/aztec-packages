#pragma once

#include "barretenberg/vm2/simulation/execution.hpp"

#include <array>
#include <gmock/gmock.h>

namespace bb::avm2::simulation {

class MockOpcodeIO : public OpcodeIOInterface {
  public:
    MockOpcodeIO();
    ~MockOpcodeIO() override;

    MOCK_METHOD(void, set_child_context, (std::unique_ptr<ContextInterface> child_ctx), (override));
    MOCK_METHOD(void, set_nested_execution_result, (ExecutionResult exec_result), (override));
    MOCK_METHOD(std::unique_ptr<ContextInterface>, extract_child_context, (), (override));
    MOCK_METHOD(std::optional<ExecutionResult>, get_nested_execution_result, (), (const, override));
    MOCK_METHOD(GasTrackerInterface&, get_gas_tracker, (), (override));
    MOCK_METHOD(void, set_inputs, (std::vector<TaggedValue> inputs), (override));
    MOCK_METHOD(void, set_output, (TaggedValue output), (override));
    MOCK_METHOD(const std::vector<TaggedValue>&, get_inputs, (), (const, override));
    MOCK_METHOD(const TaggedValue&, get_output, (), (const, override));
};

} // namespace bb::avm2::simulation
