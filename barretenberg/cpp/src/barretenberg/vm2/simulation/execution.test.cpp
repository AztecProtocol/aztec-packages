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
#include "barretenberg/vm2/simulation/testing/mock_execution_components.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gas_tracker.hpp"
#include "barretenberg/vm2/simulation/testing/mock_internal_call_stack.hpp"
#include "barretenberg/vm2/simulation/testing/mock_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;

class ExecutionSimulationTest : public ::testing::Test {
  protected:
    ExecutionSimulationTest() { ON_CALL(context, get_memory).WillByDefault(ReturnRef(memory)); }

    StrictMock<MockAlu> alu;
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
    Execution execution = Execution(alu,
                                    data_copy,
                                    execution_components,
                                    context_provider,
                                    instruction_info_db,
                                    execution_id_manager,
                                    execution_event_emitter,
                                    context_stack_event_emitter,
                                    keccakf1600);
};

TEST_F(ExecutionSimulationTest, Add)
{
    MemoryValue a = MemoryValue::from<uint32_t>(4);
    MemoryValue b = MemoryValue::from<uint32_t>(5);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get).Times(2).WillOnce(ReturnRef(a)).WillOnce(ReturnRef(b));
    EXPECT_CALL(alu, add(a, b)).WillOnce(Return(MemoryValue::from<uint32_t>(9)));
    EXPECT_CALL(memory, set(6, MemoryValue::from<uint32_t>(9)));
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

    auto gas_tracker = std::make_unique<StrictMock<MockGasTracker>>();
    EXPECT_CALL(*gas_tracker, compute_gas_limit_for_call(Gas{ 6, 7 })).WillOnce(Return(Gas{ 2, 3 }));

    EXPECT_CALL(execution_components, make_gas_tracker(_)).WillOnce(Return(std::move(gas_tracker)));
    execution.init_gas_tracker(context);

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
                   /*cd_size=*/4,
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

    execution.internal_call(context, pc_loc);

    // ==== Internal Return
    // Get manager
    EXPECT_CALL(context, get_internal_call_stack_manager());
    // Pop the return pc from the stack
    EXPECT_CALL(internal_call_stack_manager, pop()).WillOnce(Return(return_pc));
    // Set the next pc to the return pc
    EXPECT_CALL(context, set_next_pc(return_pc));

    execution.internal_return(context);
}

TEST_F(ExecutionSimulationTest, GetEnvVarAddress)
{
    AztecAddress addr = 0xdeadbeef;
    EXPECT_CALL(context, get_address).WillOnce(ReturnRef(addr));
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, set(1, MemoryValue::from<FF>(addr)));
    execution.get_env_var(context, 1, static_cast<uint8_t>(EnvironmentVariable::ADDRESS));
}

TEST_F(ExecutionSimulationTest, GetEnvVarChainId)
{
    GlobalVariables globals;
    globals.chainId = 1;
    EXPECT_CALL(context, get_globals).WillOnce(ReturnRef(globals));
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, set(1, MemoryValue::from<FF>(1)));
    execution.get_env_var(context, 1, static_cast<uint8_t>(EnvironmentVariable::CHAINID));
}

TEST_F(ExecutionSimulationTest, GetEnvVarIsStaticCall)
{
    EXPECT_CALL(context, get_is_static).WillOnce(Return(true));
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, set(1, MemoryValue::from<uint1_t>(1)));
    execution.get_env_var(context, 1, static_cast<uint8_t>(EnvironmentVariable::ISSTATICCALL));
}

TEST_F(ExecutionSimulationTest, GetEnvVarInvalidEnum)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_THROW(execution.get_env_var(context, 1, 255), std::runtime_error);
}

// Trivial test at the moment.
// TODO: Attempt to have infra to call execution.execute() with a JUMP and a second instruction
// and check the pc value for the second instruction is correct.
TEST_F(ExecutionSimulationTest, Jump)
{
    EXPECT_CALL(context, set_next_pc(120));
    execution.jump(context, 120);
}

TEST_F(ExecutionSimulationTest, SuccessCopyTrue)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_last_success).WillOnce(Return(true));
    EXPECT_CALL(memory, set(10, MemoryValue::from<uint1_t>(1)));

    execution.success_copy(context, 10);
}

TEST_F(ExecutionSimulationTest, SuccessCopyFalse)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_last_success).WillOnce(Return(false));
    EXPECT_CALL(memory, set(10, MemoryValue::from<uint1_t>(0)));

    execution.success_copy(context, 10);
}

TEST_F(ExecutionSimulationTest, RdSize)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_last_rd_size).WillOnce(Return(42));
    EXPECT_CALL(memory, set(10, MemoryValue::from<uint32_t>(42)));

    execution.rd_size(context, /*dst_addr=*/10);
}

} // namespace

} // namespace bb::avm2::simulation
