#pragma once

#include <cstdint>
#include <memory>
#include <span>

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/execution_components.hpp"

namespace bb::avm2::simulation {

class MockExecutionComponentsProvider : public ExecutionComponentsProviderInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockExecutionComponentsProvider();
    ~MockExecutionComponentsProvider() override;

    MOCK_METHOD(std::unique_ptr<AddressingInterface>, make_addressing, (AddressingEvent & event), (override));
    MOCK_METHOD(std::unique_ptr<GasTrackerInterface>,
                make_gas_tracker,
                (GasEvent & gas_event, const Instruction& instruction, ContextInterface& context),
                (override));
};

} // namespace bb::avm2::simulation
