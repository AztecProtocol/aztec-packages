#pragma once

#include <cstdint>
#include <memory>

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class MockContext : public ContextInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockContext();
    ~MockContext() override;

    // Machine state.
    MOCK_METHOD(MemoryInterface&, get_memory, (), (override));
    MOCK_METHOD(BytecodeManagerInterface&, get_bytecode_manager, (), (override));
    MOCK_METHOD(uint32_t, get_pc, (), (const, override));
    MOCK_METHOD(void, set_pc, (uint32_t new_pc), (override));
    MOCK_METHOD(uint32_t, get_next_pc, (), (const, override));
    MOCK_METHOD(void, set_next_pc, (uint32_t new_next_pc), (override));
    MOCK_METHOD(uint32_t, get_context_id, (), (override));
    MOCK_METHOD(uint32_t, get_parent_id, (), (override));
    MOCK_METHOD(bool, get_is_static, (), (const, override));
    MOCK_METHOD(bool, is_halted, (), (override));
    MOCK_METHOD(void, halt, (), (override));

    // Environment.
    MOCK_METHOD(const AztecAddress&, get_address, (), (const, override));
    MOCK_METHOD(const AztecAddress&, get_msg_sender, (), (const, override));

    // Input / Output
    MOCK_METHOD(std::vector<FF>, get_calldata, (uint32_t cd_offset, uint32_t size), (override));
    MOCK_METHOD(std::vector<FF>, get_returndata, (uint32_t rd_offset, uint32_t size), (override));
    MOCK_METHOD((std::pair<uint32_t, uint32_t>), get_calldata_info, (), (override));
    MOCK_METHOD((std::pair<uint32_t, uint32_t>), get_returndata_info, (), (override));
    MOCK_METHOD(bool, get_nested_ctx_success, (), (override));
    MOCK_METHOD(void, set_nested_ctx_success, (bool success), (override));

    // Event emitting
    MOCK_METHOD(void, emit_ctx_stack_event, (), (override));
    MOCK_METHOD(void, reserve_context_event, (), (override));
    MOCK_METHOD(ContextEvent*, get_last_context_event, (), (override));
    MOCK_METHOD(void, emit_current_context, (), (override));

    MOCK_METHOD(void, absorb_child_context, (std::unique_ptr<ContextInterface> child), (override));
};

class MockContextProvider : public ContextProviderInterface {
  public:
    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_enqueued_call_ctx,
                (AztecAddress contract_address, AztecAddress msg_sender, std::span<const FF> calldata, bool is_static),
                (override));

    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_nested_ctx,
                (ContextInterface & parent,
                 AztecAddress contract_address,
                 AztecAddress msg_sender,
                 uint32_t calldata_offset,
                 uint32_t calldata_size,
                 bool is_static),
                (override));
};

} // namespace bb::avm2::simulation
