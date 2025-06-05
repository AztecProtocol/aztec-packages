#pragma once

#include <cstdint>
#include <memory>

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/internal_call_stack_manager.hpp"

namespace bb::avm2::simulation {

class MockInternalCallStackManager : public InternalCallStackManagerInterface {

  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockInternalCallStackManager();
    ~MockInternalCallStackManager() override;

    MOCK_METHOD(void, push, (PC pc), (override));
    MOCK_METHOD(PC, pop, (), (override));
    MOCK_METHOD(InternalCallId, get_next_call_id, (), (const, override));
    MOCK_METHOD(InternalCallId, get_call_id, (), (const, override));
    MOCK_METHOD(InternalCallId, get_return_call_id, (), (const, override));
};

} // namespace bb::avm2::simulation
