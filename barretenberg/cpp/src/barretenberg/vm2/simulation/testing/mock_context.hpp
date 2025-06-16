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
    MOCK_METHOD(bool, halted, (), (const, override));
    MOCK_METHOD(void, halt, (), (override));

    MOCK_METHOD(uint32_t, get_context_id, (), (const, override));
    MOCK_METHOD(uint32_t, get_parent_id, (), (const, override));
    MOCK_METHOD(bool, has_parent, (), (const, override));

    // Environment.
    MOCK_METHOD(const AztecAddress&, get_address, (), (const, override));
    MOCK_METHOD(const AztecAddress&, get_msg_sender, (), (const, override));
    MOCK_METHOD(bool, get_is_static, (), (const, override));

    // Input / Output.
    MOCK_METHOD(std::vector<FF>, get_calldata, (uint32_t cd_offset, uint32_t cd_size), (const, override));
    MOCK_METHOD(std::vector<FF>, get_returndata, (uint32_t rd_offset, uint32_t rd_size), (override));
    MOCK_METHOD(ContextInterface&, get_child_context, (), (override));
    MOCK_METHOD(void, set_child_context, (std::unique_ptr<ContextInterface> child_ctx), (override));

    MOCK_METHOD(MemoryAddress, get_parent_cd_addr, (), (const, override));
    MOCK_METHOD(uint32_t, get_parent_cd_size, (), (const, override));

    MOCK_METHOD(MemoryAddress, get_last_rd_addr, (), (const, override));
    MOCK_METHOD(void, set_last_rd_addr, (MemoryAddress rd_offset), (override));

    MOCK_METHOD(uint32_t, get_last_rd_size, (), (const, override));
    MOCK_METHOD(void, set_last_rd_size, (MemoryAddress rd_size), (override));

    MOCK_METHOD(bool, get_last_success, (), (const, override));
    MOCK_METHOD(void, set_last_success, (bool success), (override));

    MOCK_METHOD(Gas, get_gas_used, (), (const, override));
    MOCK_METHOD(Gas, get_gas_limit, (), (const, override));
    MOCK_METHOD(void, set_gas_used, (Gas gas_used), (override));
    MOCK_METHOD(Gas, get_parent_gas_used, (), (const, override));
    MOCK_METHOD(Gas, get_parent_gas_limit, (), (const, override));

    MOCK_METHOD(Gas, gas_left, (), (const, override));

    // Event Emitting
    MOCK_METHOD(ContextEvent, serialize_context_event, (), (override));
};

} // namespace bb::avm2::simulation
