#include "barretenberg/vm2/simulation/gadgets/alu.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::StrictMock;

namespace {

TEST(AvmSimulationAluTest, Add)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

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
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(static_cast<uint32_t>(get_tag_max_value(MemoryTag::U32)));
    auto b = MemoryValue::from<uint32_t>(2);

    auto c = alu.add(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::ADD, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, NegativeAddTag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint64_t>(2);

    EXPECT_THROW(alu.add(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::ADD,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, Sub)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(2);
    auto b = MemoryValue::from<uint32_t>(1);

    auto c = alu.sub(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::SUB, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, SubUnderflow)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint64_t>(1);
    auto b = MemoryValue::from<uint64_t>(2);

    auto c = alu.sub(a, b);

    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U64, get_tag_max_value(MemoryTag::U64)));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::SUB, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, SubFFUnderflow)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<FF>(1);
    auto b = MemoryValue::from<FF>(2);

    auto c = alu.sub(a, b);

    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::FF, get_tag_max_value(MemoryTag::FF)));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::SUB, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, NegativeSubTag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(2);
    auto b = MemoryValue::from<uint64_t>(1);

    EXPECT_THROW(alu.sub(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::SUB,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, Mul)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(2);
    auto b = MemoryValue::from<uint32_t>(3);

    auto c = alu.mul(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(6));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::MUL, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, MulOverflow)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(static_cast<uint32_t>(get_tag_max_value(MemoryTag::U32)));
    auto b = MemoryValue::from<uint32_t>(2);

    auto c = alu.mul(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(static_cast<uint32_t>(get_tag_max_value(MemoryTag::U32) - 1)));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::MUL, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, MulOverflowU128)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    uint128_t max = static_cast<uint128_t>(get_tag_max_value(MemoryTag::U128));

    auto a = MemoryValue::from<uint128_t>(max);
    auto b = MemoryValue::from<uint128_t>(max - 3);

    // For u128s, we range check a_lo, a_hi, b_lo, b_hi, and c_hi:
    EXPECT_CALL(range_check, assert_range(_, 64)).Times(5);

    auto c = alu.mul(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint128_t>(4));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::MUL, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, Div)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(6);
    auto b = MemoryValue::from<uint32_t>(3);

    EXPECT_CALL(gt, gt(b, MemoryValue::from<uint32_t>(0))).WillOnce(Return(true));

    auto c = alu.div(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(2));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::DIV, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, DivU128)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    uint128_t max = static_cast<uint128_t>(get_tag_max_value(MemoryTag::U128));

    auto a = MemoryValue::from<uint128_t>(max);
    auto b = MemoryValue::from<uint128_t>(2);

    EXPECT_CALL(gt, gt(b, MemoryValue::from<uint128_t>(1))).WillOnce(Return(true));

    // For u128s, we range check c_lo, c_hi, b_lo, b_hi:
    EXPECT_CALL(range_check, assert_range(_, 64)).Times(4);

    auto c = alu.div(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint128_t>(max >> 1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::DIV, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, DivByZero)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(6);
    auto b = MemoryValue::from<uint32_t>(0);

    EXPECT_THROW(alu.div(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(
        events,
        ElementsAre(AluEvent{ .operation = AluOperation::DIV, .a = a, .b = b, .error = AluError::DIV_0_ERROR }));
}

TEST(AvmSimulationAluTest, DivFFTag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<FF>(2);
    auto b = MemoryValue::from<FF>(2);

    EXPECT_THROW(alu.div(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::DIV,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, FDiv)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<FF>(FF::modulus - 4);
    auto b = MemoryValue::from<FF>(2);

    auto c = alu.fdiv(a, b);

    EXPECT_EQ(c, MemoryValue::from<FF>(FF::modulus - 2));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::FDIV, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, FDivByZero)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<FF>(FF::modulus - 4);
    auto b = MemoryValue::from<FF>(0);

    EXPECT_THROW(alu.fdiv(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(
        events,
        ElementsAre(AluEvent{ .operation = AluOperation::FDIV, .a = a, .b = b, .error = AluError::DIV_0_ERROR }));
}

TEST(AvmSimulationAluTest, FDivNonFFTag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint64_t>(2);
    auto b = MemoryValue::from<uint64_t>(2);

    EXPECT_THROW(alu.fdiv(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::FDIV,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, LT)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint32_t>(2);

    EXPECT_CALL(gt, gt(b, a)).WillOnce(Return(true));

    auto c = alu.lt(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LT, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, LTFF)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<FF>(FF::modulus - 3);
    auto b = MemoryValue::from<FF>(2);

    EXPECT_CALL(gt, gt(b, a)).WillOnce(Return(false));

    auto c = alu.lt(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(0));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LT, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, NegativeLTTag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint64_t>(2);

    EXPECT_THROW(alu.lt(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::LT,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, LTE)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint32_t>(2);

    EXPECT_CALL(gt, gt(a, b)).WillOnce(Return(false));

    auto c = alu.lte(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LTE, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, LTEEq)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint128_t>(2);
    auto b = MemoryValue::from<uint128_t>(2);

    EXPECT_CALL(gt, gt(a, b)).WillOnce(Return(false));

    auto c = alu.lte(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(1));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LTE, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, LTEFF)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<FF>(FF::modulus - 3);
    auto b = MemoryValue::from<FF>(2);

    EXPECT_CALL(gt, gt(a, b)).WillOnce(Return(true));

    auto c = alu.lte(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint1_t>(0));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::LTE, .a = a, .b = b, .c = c }));
}

// TODO(MW): Required? Same path as ADD tag error tests
TEST(AvmSimulationAluTest, NegativeLTETag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

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
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

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
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

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
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint1_t>(1);
    auto b = MemoryValue::from<uint8_t>(1);

    EXPECT_THROW(alu.eq(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::EQ,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, NotBasic)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    const auto a = MemoryValue::from<uint64_t>(98321);
    const auto b = alu.op_not(a);

    EXPECT_EQ(b, ~a);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::NOT, .a = a, .b = b, .error = std::nullopt }));
}

TEST(AvmSimulationAluTest, NotFFTagError)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<FF>(FF::modulus - 3);

    EXPECT_THROW(alu.op_not(a), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::NOT,
                                      .a = a,
                                      .b = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, Shl)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(64);
    auto b = MemoryValue::from<uint32_t>(2);

    // a_lo and a_hi range checks:
    EXPECT_CALL(range_check, assert_range(64, 30)).Times(1);
    EXPECT_CALL(range_check, assert_range(0, 2)).Times(1);

    auto c = alu.shl(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(256));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::SHL, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, ShlOverflow)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(64);
    auto b = MemoryValue::from<uint32_t>(100);

    // a_lo and a_hi range checks:
    EXPECT_CALL(range_check, assert_range(68, 32)).Times(1);
    EXPECT_CALL(range_check, assert_range(0, 32)).Times(1);

    auto c = alu.shl(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(0));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::SHL, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, NegativeShlTagMismatch)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(64);
    auto b = MemoryValue::from<uint64_t>(2);

    EXPECT_THROW(alu.shl(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::SHL,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, Shr)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(64);
    auto b = MemoryValue::from<uint32_t>(2);

    // a_lo and a_hi range checks:
    EXPECT_CALL(range_check, assert_range(0, 2)).Times(1);
    EXPECT_CALL(range_check, assert_range(16, 30)).Times(1);

    auto c = alu.shr(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(16));

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(AluEvent{ .operation = AluOperation::SHR, .a = a, .b = b, .c = c }));
}

TEST(AvmSimulationAluTest, ShrFFTag)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    auto a = MemoryValue::from<FF>(64);
    auto b = MemoryValue::from<FF>(2);

    EXPECT_THROW(alu.shr(a, b), AluException);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::SHR,
                                      .a = a,
                                      .b = b,
                                      .c = MemoryValue::from_tag(static_cast<MemoryTag>(0), 0),
                                      .error = AluError::TAG_ERROR }));
}

TEST(AvmSimulationAluTest, TruncateTrivial)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    FF a = 8762;

    auto b = alu.truncate(a, static_cast<MemoryTag>(MemoryTag::U16));
    auto c = MemoryValue::from<uint16_t>(8762);
    EXPECT_EQ(b, c);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::TRUNCATE,
                                      .a = MemoryValue::from_tag(MemoryTag::FF, a),
                                      .b = MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U16)),
                                      .c = c,
                                      .error = std::nullopt }));
}

TEST(AvmSimulationAluTest, TruncateLess128Bits)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    FF a = (1 << 16) + 12222;

    EXPECT_CALL(range_check, assert_range(1, 112)).Times(1);

    auto b = alu.truncate(a, static_cast<MemoryTag>(MemoryTag::U16));
    auto c = MemoryValue::from<uint16_t>(12222);
    EXPECT_EQ(b, c);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::TRUNCATE,
                                      .a = MemoryValue::from_tag(MemoryTag::FF, a),
                                      .b = MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U16)),
                                      .c = c,
                                      .error = std::nullopt }));
}

TEST(AvmSimulationAluTest, TruncateGreater128Bits)
{
    EventEmitter<AluEvent> alu_event_emitter;
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockFieldGreaterThan> field_gt;
    StrictMock<MockRangeCheck> range_check;
    Alu alu(gt, field_gt, range_check, alu_event_emitter);

    FF a = (static_cast<uint256_t>(176) << 175) + (static_cast<uint256_t>(234) << 32) + 123456789;
    U256Decomposition decomposition_a = { .lo = (static_cast<uint128_t>(234) << 32) + 123456789, .hi = 176 };

    EXPECT_CALL(range_check, assert_range(234, 96)).Times(1);
    EXPECT_CALL(field_gt, canon_dec(a)).Times(1).WillOnce(Return(decomposition_a));

    auto b = alu.truncate(a, static_cast<MemoryTag>(MemoryTag::U32));
    auto c = MemoryValue::from<uint32_t>(123456789);

    EXPECT_EQ(b, c);

    auto events = alu_event_emitter.dump_events();
    EXPECT_THAT(events,
                ElementsAre(AluEvent{ .operation = AluOperation::TRUNCATE,
                                      .a = MemoryValue::from_tag(MemoryTag::FF, a),
                                      .b = MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(MemoryTag::U32)),
                                      .c = c,
                                      .error = std::nullopt }));
}

} // namespace
} // namespace bb::avm2::simulation
