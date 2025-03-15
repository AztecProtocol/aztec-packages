#include "barretenberg/vm2/simulation/context.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <memory>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::Ref;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;

class ContextSimulationTest : public ::testing::Test {
  protected:
    ContextSimulationTest() = default;
    EventEmitter<MemoryEvent> memory_event_emitter;
    StableEventEmitter<ContextEvent> context_event_emitter;
    EventEmitter<ContextStackEvent> context_stack_event_emitter;

    StrictMock<MockTxBytecodeManager> tx_bytecode_manager;
    StrictMock<MockMemory> memory;

    ContextProvider context_provider =
        ContextProvider(tx_bytecode_manager, memory_event_emitter, context_event_emitter, context_stack_event_emitter);
};

TEST_F(ContextSimulationTest, EmitEvent)
{
    EXPECT_CALL(tx_bytecode_manager, get_bytecode(_)).WillOnce(Return(BytecodeId(0)));
    auto context = context_provider.make_enqueued_call_ctx(
        /*address=*/1, /*msg_sender=*/2, /*calldata=*/{ { 3, 4 } }, /*is_static=*/false);
    context->reserve_context_event();
    // Emitting here should be a no-op
    context->emit_current_context();
    EXPECT_EQ(context_event_emitter.get_events().size(), 1);

    context->set_pc(1);
    // Emitting here should emit a new event
    context->emit_current_context();
    EXPECT_EQ(context_event_emitter.get_events().size(), 2);
}

} // namespace
} // namespace bb::avm2::simulation
