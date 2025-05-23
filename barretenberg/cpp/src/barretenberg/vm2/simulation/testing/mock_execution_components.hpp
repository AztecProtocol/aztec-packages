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

    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_enqueued_context,
                (AztecAddress address,
                 AztecAddress msg_sender,
                 std::span<const FF> calldata,
                 bool is_static,
                 Gas gas_limit,
                 Gas gas_used),
                (override));

    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_nested_context,
                (AztecAddress address,
                 AztecAddress msg_sender,
                 ContextInterface& parent_context,
                 MemoryAddress cd_offset_address,
                 MemoryAddress cd_size_address,
                 bool is_static,
                 Gas gas_limit),
                (override));

    MOCK_METHOD(std::unique_ptr<AddressingInterface>, make_addressing, (AddressingEvent & event), (override));

    MOCK_METHOD(std::unique_ptr<GasTrackerInterface>, make_gas_tracker, (ContextInterface & context), (override));

    MOCK_METHOD(uint32_t, get_next_context_id, (), (override));
};

} // namespace bb::avm2::simulation
