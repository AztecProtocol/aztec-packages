#pragma once

#include <cstdint>
#include <memory>

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/internal_callstack_manager.hpp"

namespace bb::avm2::simulation {

class MockInternalCallStackManager : public InternalCallStackManagerInterface {

  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockInternalCallStackManager();
    ~MockInternalCallStackManager() override;

    MOCK_METHOD(void, push, (uint32_t pc), (override));
    MOCK_METHOD(uint32_t, pop, (), (override));
};

} // namespace bb::avm2::simulation
