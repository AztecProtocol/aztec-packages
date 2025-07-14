#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"

namespace bb::avm2::simulation {

using ::testing::ElementsAre;
using ::testing::StrictMock;

namespace {

TEST(AvmSimulationAluTest, Add)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint32_t>(2);

    auto c = alu.add(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(3));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::ADD, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, AddOverflow)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(static_cast<uint32_t>(get_tag_max_value(ValueTag::U32)));
    auto b = MemoryValue::from<uint32_t>(2);

    auto c = alu.add(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::ADD, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, NegativeAddTag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint64_t>(2);

    EXPECT_THROW(alu.add(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::ADD,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<ValueTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, LT)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint32_t>(2);

    EXPECT_CALL(range_check, assert_range(0, /*num_bits=*/32));

    auto c = alu.lt(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LT, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, LTFF)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<FF>(FF::modulus - 3);
    auto b = MemoryValue::from<FF>(2);

    EXPECT_CALL(field_gt, ff_gt(FF(2), FF(FF::modulus - 3)));
    EXPECT_CALL(range_check, assert_range(0, /*num_bits=*/0));

    auto c = alu.lt(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(0));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LT, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, NegativeLTTag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint64_t>(2);

    EXPECT_THROW(alu.lt(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::LT,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<ValueTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, LTE)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint32_t>(2);

    EXPECT_CALL(range_check, assert_range(1, /*num_bits=*/32));

    auto c = alu.lte(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LTE, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, LTEEq)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint128_t>(2);
    auto b = MemoryValue::from<uint128_t>(2);

    EXPECT_CALL(range_check, assert_range(0, /*num_bits=*/128));

    auto c = alu.lte(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LTE, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, LTEFF)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<FF>(FF::modulus - 3);
    auto b = MemoryValue::from<FF>(2);

    EXPECT_CALL(field_gt, ff_gt(FF(FF::modulus - 3), FF(2)));
    EXPECT_CALL(range_check, assert_range(0, /*num_bits=*/0));

    auto c = alu.lte(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(0));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LTE, .a = a, .b = b, .c = c }));
}

// TODO(MW): Required? Same path as ADD tag error tests
TEST(AvmSimulationAluTest, NegativeLTETag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint64_t>(2);

    EXPECT_THROW(alu.lte(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::LTE, .a = a, .b = b, .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, EQEquality)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint128_t>(123456789);
    auto b = MemoryValue::from<uint128_t>(123456789);

    auto c = alu.eq(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::EQ, .a = a, .b = b, .c = c, .error = std::nullopt }));
}

TEST(AvmSimulationAluTest, EQInequality)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<FF>(123456789);
    auto b = MemoryValue::from<FF>(123456788);

    auto c = alu.eq(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(0));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::EQ, .a = a, .b = b, .c = c, .error = std::nullopt }));
}

TEST(AvmSimulationAluTest, EQTagError)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<uint1_t>(1);
    auto b = MemoryValue::from<uint8_t>(1);

    EXPECT_THROW(alu.eq(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::EQ,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<ValueTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, NotBasic)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    const auto a = MemoryValue::from<uint64_t>(98321);
    const auto b = alu.op_not(a);

    EXPECT_EQ(b, ~a);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::NOT, .a = a, .b = b, .error = std::nullopt }));
}

TEST(AvmSimulationAluTest, NotFFTagError)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    Alu alu(range_check, field_gt, alu_event_emitter);

    auto a = MemoryValue::from<FF>(FF::modulus - 3);

    EXPECT_THROW(alu.op_not(a), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::NOT,
                                      .a = a,
                                      .b = MemoryValue::from_tag(static_cast<ValueTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

} // namespace
} // namespace bb::avm2::simulation
