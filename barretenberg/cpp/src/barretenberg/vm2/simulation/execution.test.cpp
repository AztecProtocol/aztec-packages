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
#include "barretenberg/vm2/simulation/testing/mock_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context_provider.hpp"
#include "barretenberg/vm2/simulation/testing/mock_data_copy.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_components.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gas_tracker.hpp"
#include "barretenberg/vm2/simulation/testing/mock_internal_call_stack.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"

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
                                    internal_call_stack_manager,
                                    execution_event_emitter,
                                    context_stack_event_emitter);
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

    EXPECT_CALL(context_provider, make_nested_context(nested_address, parent_address, _, _, _, _, Gas{ 2, 3 }))
        .WillOnce(Return(std::move(nested_context)));

    execution.call(context,
                   /*l2_gas_offset=*/1,
                   /*da_gas_offset=*/2,
                   /*addr=*/3,
                   /*cd_size=*/4,
                   /*cd_offset=*/5);
}

} // namespace

} // namespace bb::avm2::simulation
