#pragma once

#include <cstdint>
#include <memory>

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/context_provider.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class MockContextProvider : public ContextProviderInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockContextProvider();
    ~MockContextProvider() override;

    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_nested_context,
                (AztecAddress address,
                 AztecAddress msg_sender,
                 ContextInterface& parent_context,
                 MemoryAddress cd_offset_addr,
                 MemoryAddress cd_size_addr,
                 bool is_static,
                 Gas gas_limit),
                (override));

    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_enqueued_context,
                (AztecAddress address,
                 AztecAddress msg_sender,
                 std::span<const FF> calldata,
                 bool is_static,
                 Gas gas_limit,
                 Gas gas_used),
                (override));

    MOCK_METHOD(uint32_t, get_next_context_id, (), (const, override));
};

} // namespace bb::avm2::simulation
