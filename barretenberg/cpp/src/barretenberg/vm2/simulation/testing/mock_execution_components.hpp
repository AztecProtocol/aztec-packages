#pragma once

#include <cstdint>
#include <memory>
#include <span>

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/execution_components.hpp"

namespace bb::avm2::simulation {

class MockExecutionComponentsProvider : public ExecutionComponentsProviderInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockExecutionComponentsProvider();
    ~MockExecutionComponentsProvider() override;

    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_context,
                (AztecAddress address, AztecAddress msg_sender, std::span<const FF> calldata, bool is_static),
                (override));

    MOCK_METHOD(std::unique_ptr<AddressingInterface>, make_addressing, (AddressingEvent & event), (override));
};

} // namespace bb::avm2::simulation
