#include "barretenberg/vm2/simulation/execution.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <memory>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_alu.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_components.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::Ref;
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
    EventEmitter<ExecutionEvent> execution_event_emitter;
    InstructionInfoDB instruction_info_db; // Using the real thing.
    Execution execution = Execution(alu, execution_components, instruction_info_db, execution_event_emitter);
};

TEST_F(ExecutionSimulationTest, Add)
{
    EXPECT_CALL(alu, add(Ref(context), 4, 5, 6));
    execution.add(context, 4, 5, 6);
}

TEST_F(ExecutionSimulationTest, Call)
{

    AztecAddress parent_address = 1;
    AztecAddress nested_address = 2;

    EXPECT_CALL(context, emit_context_snapshot);
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_address).WillOnce(ReturnRef(parent_address));
    EXPECT_CALL(memory, get).WillOnce(Return(ValueRefAndTag({ .value = nested_address, .tag = MemoryTag::U32 })));

    EXPECT_CALL(execution_components, make_nested_context(nested_address, parent_address, _, _))
        .WillOnce(Return(std::make_unique<MockContext>()));

    EXPECT_CALL(context, set_nested_returndata);

    execution.call(context, 10);
}

} // namespace
} // namespace bb::avm2::simulation
