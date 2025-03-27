#include "barretenberg/vm2/simulation/alu.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::ReturnRef;
using ::testing::StrictMock;

TEST(AvmSimulationAluTest, Add)
{
    NoopEventEmitter<MemoryEvent> emitter;
    Memory mem(/*space_id=*/0, emitter);
    StrictMock<MockContext> context;
    EXPECT_CALL(context, get_memory()).WillRepeatedly(ReturnRef(mem));

    EventEmitter<AluEvent> alu_event_emitter;
    Alu alu(alu_event_emitter);

    // // TODO: actually can choose to mock, not even use a memory, check the events, etc.
    // MemoryAddress a_addr = 0;
    // MemoryAddress b_addr = 1;
    // MemoryAddress dst_addr = 2;
    //
    // mem.set(a_addr, 1, MemoryTag::U32);
    // mem.set(b_addr, 2, MemoryTag::U32);

    TaggedValueWrapper a(Uint32(1));
    TaggedValueWrapper b(Uint32(2));
    auto c = alu.add(a, b);

    EXPECT_EQ(c.into_memory_value(), 3);
    EXPECT_EQ(c.get_tag(), MemoryTag::U32);
}

} // namespace
} // namespace bb::avm2::simulation
