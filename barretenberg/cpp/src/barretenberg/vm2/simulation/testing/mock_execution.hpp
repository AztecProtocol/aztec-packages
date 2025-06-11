#pragma once

#include <cstdint>
#include <memory>
#include <span>

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"

namespace bb::avm2::simulation {

class MockExecution : public ExecutionInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockExecution();
    ~MockExecution() override;

    MOCK_METHOD(ExecutionResult, execute, (std::unique_ptr<ContextInterface> context), (override));
};

} // namespace bb::avm2::simulation
