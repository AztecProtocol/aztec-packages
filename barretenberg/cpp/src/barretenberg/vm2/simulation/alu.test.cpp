#include "barretenberg/vm2/simulation/alu.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"

namespace bb::avm2::simulation {

using ::testing::ElementsAre;

namespace {

TEST(AvmSimulationAluTest, Add)
{
    EventEmitter<AluEvent> alu_event_emitter;
    Alu alu(alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint32_t>(2);

    auto c = alu.add(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(3));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ AluOperation::ADD, a, b, c, {} }));
}

TEST(AvmSimulationAluTest, AddOverflow)
{
    EventEmitter<AluEvent> alu_event_emitter;
    Alu alu(alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(static_cast<uint32_t>(get_tag_max_value(ValueTag::U32)));
    auto b = MemoryValue::from<uint32_t>(2);

    auto c = alu.add(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ AluOperation::ADD, a, b, c, {} }));
}

TEST(AvmSimulationAluTest, NegativeAddTag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    Alu alu(alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint64_t>(2);

    EXPECT_THROW(alu.add(a, b), AluError);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(
        events,
        ElementsAre(AluEvent{ AluOperation::ADD, a, b, MemoryValue::from_tag(a.get_tag(), 0), AluError::TAG_ERROR }));
}

} // namespace
} // namespace bb::avm2::simulation
