#include "barretenberg/vm2/simulation/execution.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <memory>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/context_provider.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/gas_tracker.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_alu.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bitwise.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context_provider.hpp"
#include "barretenberg/vm2/simulation/testing/mock_data_copy.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_components.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gas_tracker.hpp"
#include "barretenberg/vm2/simulation/testing/mock_internal_call_stack.hpp"
#include "barretenberg/vm2/simulation/testing/mock_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;
using ::testing::Throw;

// TODO(fcarreiro): This is a hack to get the gas tracker for testing.
class TestingExecution : public Execution {
  public:
    using Execution::Execution;

    void set_gas_tracker(GasTrackerInterface& gas_tracker) { this->testing_gas_tracker = &gas_tracker; }

    GasTrackerInterface& get_gas_tracker() override { return *testing_gas_tracker; }

  private:
    GasTrackerInterface* testing_gas_tracker;
};

class ExecutionSimulationTest : public ::testing::Test {
  protected:
    ExecutionSimulationTest()
    {
        ON_CALL(context, get_memory).WillByDefault(ReturnRef(memory));
        execution.set_gas_tracker(gas_tracker);
    }

    StrictMock<MockAlu> alu;
    StrictMock<MockBitwise> bitwise;
    StrictMock<MockMemory> memory;
    StrictMock<MockExecutionComponentsProvider> execution_components;
    StrictMock<MockContext> context;
    StrictMock<MockDataCopy> data_copy;
    StrictMock<MockInternalCallStackManager> internal_call_stack_manager;
    StrictMock<MockKeccakF1600> keccakf1600;
    EventEmitter<ExecutionEvent> execution_event_emitter;
    EventEmitter<ContextStackEvent> context_stack_event_emitter;
    InstructionInfoDB instruction_info_db; // Using the real thing.
    StrictMock<MockContextProvider> context_provider;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGasTracker> gas_tracker;
    StrictMock<MockHighLevelMerkleDB> merkle_db;
    StrictMock<MockRangeCheck> range_check;
    TestingExecution execution = TestingExecution(alu,
                                                  bitwise,
                                                  data_copy,
                                                  execution_components,
                                                  context_provider,
                                                  instruction_info_db,
                                                  execution_id_manager,
                                                  execution_event_emitter,
                                                  context_stack_event_emitter,
                                                  keccakf1600,
                                                  range_check,
                                                  merkle_db);
};

TEST_F(ExecutionSimulationTest, Add)
{
    MemoryValue a = MemoryValue::from<uint32_t>(4);
    MemoryValue b = MemoryValue::from<uint32_t>(5);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get).Times(2).WillOnce(ReturnRef(a)).WillOnce(ReturnRef(b));
    EXPECT_CALL(alu, add(a, b)).WillOnce(Return(MemoryValue::from<uint32_t>(9)));
    EXPECT_CALL(memory, set(6, MemoryValue::from<uint32_t>(9)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.add(context, 4, 5, 6);
}

TEST_F(ExecutionSimulationTest, Call)
{
    FF zero = 0;
    AztecAddress parent_address = 0xdeadbeef;
    AztecAddress nested_address = 0xc0ffee;
    MemoryValue nested_address_value = MemoryValue::from<FF>(nested_address);
    MemoryValue l2_gas_allocated = MemoryValue::from<uint32_t>(6);
    MemoryValue da_gas_allocated = MemoryValue::from<uint32_t>(7);
    MemoryValue cd_size = MemoryValue::from<uint32_t>(8);

    EXPECT_CALL(gas_tracker, compute_gas_limit_for_call(Gas{ 6, 7 })).WillOnce(Return(Gas{ 2, 3 }));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    // Context snapshotting
    EXPECT_CALL(context, get_context_id);
    EXPECT_CALL(context_provider, get_next_context_id);
    EXPECT_CALL(context, get_parent_id);
    EXPECT_CALL(context, get_next_pc);
    EXPECT_CALL(context, get_is_static);
    EXPECT_CALL(context, get_msg_sender).WillOnce(ReturnRef(parent_address));
    EXPECT_CALL(context, get_transaction_fee).WillOnce(ReturnRef(zero));
    EXPECT_CALL(context, get_parent_gas_used);
    EXPECT_CALL(context, get_parent_gas_limit);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(parent_address));
    EXPECT_CALL(memory, get(1)).WillOnce(ReturnRef(l2_gas_allocated));     // l2_gas_offset
    EXPECT_CALL(memory, get(2)).WillOnce(ReturnRef(da_gas_allocated));     // da_gas_offset
    EXPECT_CALL(memory, get(3)).WillOnce(ReturnRef(nested_address_value)); // contract_address
    EXPECT_CALL(memory, get(4)).WillOnce(ReturnRef(cd_size));              // cd_size

    auto nested_context = std::make_unique<NiceMock<MockContext>>();
    ON_CALL(*nested_context, halted())
        .WillByDefault(Return(true)); // We just want the recursive call to return immediately.

    EXPECT_CALL(context_provider, make_nested_context(nested_address, parent_address, _, _, _, _, _, Gas{ 2, 3 }))
        .WillOnce(Return(std::move(nested_context)));

    execution.call(context,
                   /*l2_gas_offset=*/1,
                   /*da_gas_offset=*/2,
                   /*addr=*/3,
                   /*cd_size_offset=*/4,
                   /*cd_offset=*/5);
}

TEST_F(ExecutionSimulationTest, InternalCall)
{
    uint32_t return_pc = 500; // This is next pc that we should return to after the internal call.
    uint32_t pc_loc = 11;     // This is the pc of the internal call

    NiceMock<MockInternalCallStackManager> internal_call_stack_manager;
    ON_CALL(context, get_internal_call_stack_manager).WillByDefault(ReturnRef(internal_call_stack_manager));

    // ==== Internal Call
    // Get manager
    EXPECT_CALL(context, get_internal_call_stack_manager());
    // Store the return pc (i.e. context.get_next_pc())
    EXPECT_CALL(context, get_next_pc()).WillOnce(Return(return_pc));
    EXPECT_CALL(internal_call_stack_manager, push(return_pc));
    // Set next pc to the parameter pc_loc
    EXPECT_CALL(context, set_next_pc(pc_loc));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.internal_call(context, pc_loc);

    // ==== Internal Return
    // Get manager
    EXPECT_CALL(context, get_internal_call_stack_manager());
    // Pop the return pc from the stack
    EXPECT_CALL(internal_call_stack_manager, pop()).WillOnce(Return(return_pc));
    // Set the next pc to the return pc
    EXPECT_CALL(context, set_next_pc(return_pc));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.internal_return(context);
}

TEST_F(ExecutionSimulationTest, GetEnvVarAddress)
{
    AztecAddress addr = 0xdeadbeef;
    EXPECT_CALL(context, get_address).WillOnce(ReturnRef(addr));
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, set(1, MemoryValue::from<FF>(addr)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.get_env_var(context, 1, static_cast<uint8_t>(EnvironmentVariable::ADDRESS));
}

TEST_F(ExecutionSimulationTest, GetEnvVarChainId)
{
    GlobalVariables globals;
    globals.chainId = 1;
    EXPECT_CALL(context, get_globals).WillOnce(ReturnRef(globals));
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, set(1, MemoryValue::from<FF>(1)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.get_env_var(context, 1, static_cast<uint8_t>(EnvironmentVariable::CHAINID));
}

TEST_F(ExecutionSimulationTest, GetEnvVarIsStaticCall)
{
    EXPECT_CALL(context, get_is_static).WillOnce(Return(true));
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, set(1, MemoryValue::from<uint1_t>(1)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.get_env_var(context, 1, static_cast<uint8_t>(EnvironmentVariable::ISSTATICCALL));
}

TEST_F(ExecutionSimulationTest, GetEnvVarInvalidEnum)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_THROW(execution.get_env_var(context, 1, 255), std::runtime_error);
}

// Trivial test at the moment.
// TODO: Attempt to have infra to call execution.execute() with a JUMP and a second instruction
// and check the pc value for the second instruction is correct.
TEST_F(ExecutionSimulationTest, Jump)
{
    EXPECT_CALL(context, set_next_pc(120));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.jump(context, 120);
}

TEST_F(ExecutionSimulationTest, SuccessCopyTrue)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_last_success).WillOnce(Return(true));
    EXPECT_CALL(memory, set(10, MemoryValue::from<uint1_t>(1)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.success_copy(context, 10);
}

TEST_F(ExecutionSimulationTest, SuccessCopyFalse)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_last_success).WillOnce(Return(false));
    EXPECT_CALL(memory, set(10, MemoryValue::from<uint1_t>(0)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.success_copy(context, 10);
}

TEST_F(ExecutionSimulationTest, RdSize)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_last_rd_size).WillOnce(Return(42));
    EXPECT_CALL(memory, set(10, MemoryValue::from<uint32_t>(42)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.rd_size(context, /*dst_addr=*/10);
}

TEST_F(ExecutionSimulationTest, DebugLogEnabled)
{
    // Setup test data
    MemoryAddress message_offset = 100;
    MemoryAddress fields_offset = 200;
    MemoryAddress fields_size_offset = 300;
    uint16_t message_size = 5;
    bool is_debug_logging_enabled = true;

    // Create test message data (ASCII characters)
    MemoryValue message_data[] = {
        MemoryValue::from<FF>('H'), // 'H'
        MemoryValue::from<FF>('e'), // 'e'
        MemoryValue::from<FF>('l'), // 'l'
        MemoryValue::from<FF>('l'), // 'l'
        MemoryValue::from<FF>('o'), // 'o'
    };

    // Create test fields data
    MemoryValue field1 = MemoryValue::from<FF>(42);
    MemoryValue field2 = MemoryValue::from<FF>(123);
    MemoryValue fields_size = MemoryValue::from<uint32_t>(2);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(fields_size_offset)).WillOnce(ReturnRef(fields_size));
    EXPECT_CALL(memory, get(message_offset + 0)).WillOnce(ReturnRef(message_data[0]));
    EXPECT_CALL(memory, get(message_offset + 1)).WillOnce(ReturnRef(message_data[1]));
    EXPECT_CALL(memory, get(message_offset + 2)).WillOnce(ReturnRef(message_data[2]));
    EXPECT_CALL(memory, get(message_offset + 3)).WillOnce(ReturnRef(message_data[3]));
    EXPECT_CALL(memory, get(message_offset + 4)).WillOnce(ReturnRef(message_data[4]));
    EXPECT_CALL(memory, get(fields_offset + 0)).WillOnce(ReturnRef(field1));
    EXPECT_CALL(memory, get(fields_offset + 1)).WillOnce(ReturnRef(field2));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.debug_log(
        context, message_offset, fields_offset, fields_size_offset, message_size, is_debug_logging_enabled);
}

TEST_F(ExecutionSimulationTest, DebugLogDisabled)
{
    // Setup test data
    MemoryAddress message_offset = 100;
    MemoryAddress fields_offset = (1UL << 32) - 50;
    MemoryAddress fields_size_offset = (1UL << 32) - 50;
    uint16_t message_size = 1UL << 15;
    bool is_debug_logging_enabled = false;

    // When debug logging is disabled, only gas should be consumed
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.debug_log(
        context, message_offset, fields_offset, fields_size_offset, message_size, is_debug_logging_enabled);
}

TEST_F(ExecutionSimulationTest, DebugLogMessageTruncation)
{
    // Setup test data with message size larger than the 100 character limit
    MemoryAddress message_offset = 100;
    MemoryAddress fields_offset = 200;
    MemoryAddress fields_size_offset = 300;
    uint16_t message_size = 150; // Larger than the 100 character limit
    bool is_debug_logging_enabled = true;

    // Create test fields data
    MemoryValue fields_size = MemoryValue::from<uint32_t>(0);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(fields_size_offset)).WillOnce(ReturnRef(fields_size));

    // Expect only 100 memory reads for the message (truncated)
    for (uint32_t i = 0; i < 100; ++i) {
        MemoryValue char_val = MemoryValue::from<FF>('A' + (i % 26));
        EXPECT_CALL(memory, get(message_offset + i)).WillOnce(ReturnRef(char_val));
    }

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.debug_log(
        context, message_offset, fields_offset, fields_size_offset, message_size, is_debug_logging_enabled);
}

TEST_F(ExecutionSimulationTest, DebugLogExceptionHandling)
{
    // Setup test data
    MemoryAddress message_offset = 100;
    MemoryAddress fields_offset = 200;
    MemoryAddress fields_size_offset = 300;
    uint16_t message_size = 5;
    bool is_debug_logging_enabled = true;

    // Make memory.get throw an exception to test error handling
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(fields_size_offset)).WillOnce(Throw(std::runtime_error("Memory access error")));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    // The debug_log method should not throw, it should catch the exception and continue
    EXPECT_NO_THROW(execution.debug_log(
        context, message_offset, fields_offset, fields_size_offset, message_size, is_debug_logging_enabled));
}

TEST_F(ExecutionSimulationTest, Sload)
{
    MemoryAddress slot_addr = 27;
    MemoryAddress dst_addr = 10;
    AztecAddress address = 0xdeadbeef;
    auto slot = MemoryValue::from<FF>(42);

    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(slot_addr)).WillOnce(ReturnRef(slot));
    EXPECT_CALL(context, get_address).WillOnce(ReturnRef(address));
    EXPECT_CALL(merkle_db, storage_read(address, slot.as<FF>())).WillOnce(Return(7));

    EXPECT_CALL(memory, set(dst_addr, MemoryValue::from<FF>(7)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.sload(context, slot_addr, dst_addr);
}

TEST_F(ExecutionSimulationTest, SStore)
{
    MemoryAddress slot_addr = 27;
    MemoryAddress value_addr = 10;
    AztecAddress address = 0xdeadbeef;
    auto slot = MemoryValue::from<FF>(42);
    auto value = MemoryValue::from<FF>(7);
    TreeStates tree_state = {};
    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(slot_addr)).WillOnce(ReturnRef(slot));
    EXPECT_CALL(memory, get(value_addr)).WillOnce(ReturnRef(value));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));
    EXPECT_CALL(merkle_db, was_storage_written(address, slot.as<FF>())).WillOnce(Return(false));
    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_state));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 1 }));

    EXPECT_CALL(merkle_db, storage_write(address, slot.as<FF>(), value.as<FF>(), false));

    execution.sstore(context, value_addr, slot_addr);
}

TEST_F(ExecutionSimulationTest, SStoreLimitReached)
{
    MemoryAddress slot_addr = 27;
    MemoryAddress value_addr = 10;
    AztecAddress address = 0xdeadbeef;
    auto slot = MemoryValue::from<FF>(42);
    auto value = MemoryValue::from<FF>(7);
    TreeStates tree_state = {};
    tree_state.publicDataTree.counter = MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;
    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(slot_addr)).WillOnce(ReturnRef(slot));
    EXPECT_CALL(memory, get(value_addr)).WillOnce(ReturnRef(value));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));
    EXPECT_CALL(merkle_db, was_storage_written(address, slot.as<FF>())).WillOnce(Return(false));
    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_state));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 1 }));

    EXPECT_THROW_WITH_MESSAGE(execution.sstore(context, value_addr, slot_addr),
                              "SSTORE: Maximum number of data writes reached");
}

TEST_F(ExecutionSimulationTest, SStoreLimitReachedSquashed)
{
    MemoryAddress slot_addr = 27;
    MemoryAddress value_addr = 10;
    AztecAddress address = 0xdeadbeef;
    auto slot = MemoryValue::from<FF>(42);
    auto value = MemoryValue::from<FF>(7);
    TreeStates tree_state = {};
    tree_state.publicDataTree.counter = MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;
    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(slot_addr)).WillOnce(ReturnRef(slot));
    EXPECT_CALL(memory, get(value_addr)).WillOnce(ReturnRef(value));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));
    // has been written before, so it does not count against the limit.
    EXPECT_CALL(merkle_db, was_storage_written(address, slot.as<FF>())).WillOnce(Return(true));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(merkle_db, storage_write(address, slot.as<FF>(), value.as<FF>(), false));

    execution.sstore(context, value_addr, slot_addr);
}

TEST_F(ExecutionSimulationTest, NoteHashExists)
{
    MemoryAddress unique_note_hash_addr = 10;
    MemoryAddress leaf_index_addr = 11;
    MemoryAddress dst_addr = 12;

    auto unique_note_hash = MemoryValue::from<FF>(42);
    auto leaf_index = MemoryValue::from<uint64_t>(7);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(unique_note_hash_addr)).WillOnce(ReturnRef(unique_note_hash));
    EXPECT_CALL(memory, get(leaf_index_addr)).WillOnce(ReturnRef(leaf_index));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(range_check, assert_range(NOTE_HASH_TREE_LEAF_COUNT - 1 - leaf_index.as<uint64_t>(), 64));

    EXPECT_CALL(merkle_db, note_hash_exists(leaf_index.as<uint64_t>(), unique_note_hash.as<FF>()))
        .WillOnce(Return(true));

    EXPECT_CALL(memory, set(dst_addr, MemoryValue::from<uint1_t>(1)));

    execution.note_hash_exists(context, unique_note_hash_addr, leaf_index_addr, dst_addr);
}

TEST_F(ExecutionSimulationTest, NoteHashExistsOutOfRange)
{
    MemoryAddress unique_note_hash_addr = 10;
    MemoryAddress leaf_index_addr = 11;
    MemoryAddress dst_addr = 12;

    auto unique_note_hash = MemoryValue::from<FF>(42);
    auto leaf_index = MemoryValue::from<uint64_t>(NOTE_HASH_TREE_LEAF_COUNT + 1);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(unique_note_hash_addr)).WillOnce(ReturnRef(unique_note_hash));
    EXPECT_CALL(memory, get(leaf_index_addr)).WillOnce(ReturnRef(leaf_index));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(range_check, assert_range(leaf_index.as<uint64_t>() - NOTE_HASH_TREE_LEAF_COUNT, 64));

    EXPECT_THROW_WITH_MESSAGE(execution.note_hash_exists(context, unique_note_hash_addr, leaf_index_addr, dst_addr),
                              "NOTEHASHEXISTS: Leaf index out of range");
}

} // namespace

} // namespace bb::avm2::simulation
