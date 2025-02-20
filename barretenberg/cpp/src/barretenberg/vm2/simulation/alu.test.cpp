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

    // TODO: actually can choose to mock, not even use a memory, check the events, etc.
    MemoryAddress a_addr = 0;
    MemoryAddress b_addr = 1;
    MemoryAddress dst_addr = 2;

    mem.set(a_addr, 1, MemoryTag::U32);
    mem.set(b_addr, 2, MemoryTag::U32);

    alu.add(context, a_addr, b_addr, dst_addr);

    auto c = mem.get(dst_addr);
    EXPECT_EQ(c.value, 3);
    EXPECT_EQ(c.tag, MemoryTag::U32);
}

} // namespace
} // namespace bb::avm2::simulation