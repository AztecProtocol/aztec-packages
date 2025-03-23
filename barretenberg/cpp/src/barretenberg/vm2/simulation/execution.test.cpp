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

using ::testing::Ref;
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

} // namespace
} // namespace bb::avm2::simulation
