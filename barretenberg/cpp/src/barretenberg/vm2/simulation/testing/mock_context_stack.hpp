#pragma once

#include <cstdint>
#include <memory>

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/context_stack.hpp"

namespace bb::avm2::simulation {

class MockContextStack : public ContextStackInterface {
  public:
    // TODO: do later.
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    // MockContextStack();
    // ~MockContextStack() override;

    MOCK_METHOD(void, push, (std::unique_ptr<ContextInterface> context), (override));
    MOCK_METHOD(void, pop, (), (override));
    MOCK_METHOD(ContextInterface&, current, (), (override));
    MOCK_METHOD(bool, empty, (), (override));
};

} // namespace bb::avm2::simulation