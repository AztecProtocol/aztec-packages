#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/alu.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/alu.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {

namespace {

using simulation::Alu;
using simulation::AluEvent;
using simulation::AluException;
using simulation::DeduplicatingEventEmitter;
using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::GreaterThan;
using simulation::GreaterThanEvent;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;

using tracegen::AluTraceBuilder;
using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::GreaterThanTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::RangeCheckTraceBuilder;

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using alu = bb::avm2::alu<FF>;

// Test suite focussing on ALU operations and their interactions with other gadgets.
// In particular, ensuring that interactions are satisfiied under the different type of exceptions.

// Base fixture that wires up concrete gadgets and their event emitters.
class AluIntegrationTest : public ::testing::Test {
  protected:
    // Event emitters
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    DeduplicatingEventEmitter<GreaterThanEvent> gt_emitter;
    EventEmitter<AluEvent> alu_emitter;

    // Gadgets
    RangeCheck range_check;
    FieldGreaterThan field_gt;
    GreaterThan greater_than;
    Alu alu_simulator;

    // Trace Builder
    AluTraceBuilder alu_trace_builder;
    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;

    AluIntegrationTest()
        : range_check(range_check_emitter)
        , field_gt(range_check, field_gt_emitter)
        , greater_than(field_gt, range_check, gt_emitter)
        , alu_simulator(greater_than, field_gt, range_check, alu_emitter)
    {}

    void process_events(TestTraceContainer& trace)
    {
        alu_trace_builder.process(alu_emitter.dump_events(), trace);
        range_check_builder.process(range_check_emitter.dump_events(), trace);
        field_gt_builder.process(field_gt_emitter.dump_events(), trace);
        gt_builder.process(gt_emitter.dump_events(), trace);
        precomputed_builder.process_misc(trace, 256);
        precomputed_builder.process_power_of_2(trace);
        precomputed_builder.process_tag_parameters(trace);
    }
};

// ADD operations

TEST_F(AluIntegrationTest, addBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, UINT32_MAX - 3);
    auto b = MemoryValue::from_tag(MemoryTag::U32, 3);
    auto c = alu_simulator.add(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U32, UINT32_MAX));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, addWithTagMismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 3);

    EXPECT_THROW(alu_simulator.add(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// SUB operations

TEST_F(AluIntegrationTest, subBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U32, 3);
    auto c = alu_simulator.sub(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U32, UINT32_MAX));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, subWithTagMismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U1, 0);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 12635);

    EXPECT_THROW(alu_simulator.sub(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// MUL operations

TEST_F(AluIntegrationTest, mulBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, 1 << 16);
    auto b = MemoryValue::from_tag(MemoryTag::U32, 1 << 17);
    auto c = alu_simulator.mul(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U32, 0));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, mulWithTagU128Mismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 3);

    EXPECT_THROW(alu_simulator.mul(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// Test values from fuzzer which triggered a bug related to cf computation.
TEST_F(AluIntegrationTest, mulU128FuzzBug1Cf0)
{
    // We need a * b_lo + a_lo * b_hi * 2^64 < 2^192 for cf = 0
    uint256_t a_ff = uint256_t("0x000000000000000000000000000000003c18fbdb47886300e90ed3f8e4b4b4b1");
    uint256_t b_ff = uint256_t("0x000000000000000000000000000000008eb2fbdb4724e898de03c8ed45033bb1");

    uint256_t product = a_ff * (b_ff & MASK_64) + (((a_ff & MASK_64) * (b_ff >> 64)) >> 64);
    ASSERT_LT(product, uint256_t(1) << 192);

    auto a = MemoryValue::from_tag(MemoryTag::U128, a_ff);
    auto b = MemoryValue::from_tag(MemoryTag::U128, b_ff);
    alu_simulator.mul(a, b);

    TestTraceContainer trace;
    process_events(trace);

    EXPECT_EQ(trace.get(Column::alu_cf, 0), 0);

    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, mulU128Cf1)
{
    // We need a * b_lo + a_lo * b_hi * 2^64 >= 2^192 for cf = 1
    uint256_t a_ff = uint256_t("0x00000000000000000000000000000000ff18fbdb47886300fffed3f8e4b4b4b1");
    uint256_t b_ff = uint256_t("0x00000000000000000000000000000000ffb2fbdb4724e898fff3c8ed45033bb1");

    uint256_t product = a_ff * (b_ff & MASK_64) + (((a_ff & MASK_64) * (b_ff >> 64)) << 64);
    ASSERT_GT(product, uint256_t(1) << 192);

    auto a = MemoryValue::from_tag(MemoryTag::U128, a_ff);
    auto b = MemoryValue::from_tag(MemoryTag::U128, b_ff);
    alu_simulator.mul(a, b);

    TestTraceContainer trace;
    process_events(trace);

    EXPECT_EQ(trace.get(Column::alu_cf, 0), 1);

    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// DIV operations

TEST_F(AluIntegrationTest, divBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, 1 << 18);
    auto b = MemoryValue::from_tag(MemoryTag::U32, 1 << 17);
    auto c = alu_simulator.div(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U32, 2));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, divWithTagU128Mismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, 17876);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 3);

    EXPECT_THROW(alu_simulator.div(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, divWithTagU128MismatchDivByZero)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, 17876);
    auto b = MemoryValue::from_tag(MemoryTag::U32, 0);

    EXPECT_THROW(alu_simulator.div(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, divWithTagFFDivByZero)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 0);

    EXPECT_THROW(alu_simulator.div(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, divWithTagU128DivByZero)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, 17876);
    auto b = MemoryValue::from_tag(MemoryTag::U128, 0);

    EXPECT_THROW(alu_simulator.div(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// FDIV operations

TEST_F(AluIntegrationTest, fdivBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 1 << 25);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 1 << 17);
    auto c = alu_simulator.fdiv(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::FF, 1 << 8));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, fdivWithTagNotFF)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 3);

    EXPECT_THROW(alu_simulator.fdiv(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, fdivWithTagNotFFDivByZero)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, 2);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 0);

    EXPECT_THROW(alu_simulator.fdiv(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, fdivDivByZero)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 0);

    EXPECT_THROW(alu_simulator.fdiv(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// EQ operations

TEST_F(AluIntegrationTest, eqBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U32, 7);
    auto c = alu_simulator.eq(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U1, 0));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, eqWithTagFFMismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U8, 16);

    EXPECT_THROW(alu_simulator.eq(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, eqWithTagU128Mismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, 17876);
    auto b = MemoryValue::from_tag(MemoryTag::U8, 16);

    EXPECT_THROW(alu_simulator.eq(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// LT operations
TEST_F(AluIntegrationTest, ltBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U64, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 15);
    auto c = alu_simulator.lt(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U1, 0));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, ltWithTagU64Mismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U64, 17876);
    auto b = MemoryValue::from_tag(MemoryTag::U128, 17876);

    EXPECT_THROW(alu_simulator.lt(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, ltWithTagFFMismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U8, 16);

    EXPECT_THROW(alu_simulator.lt(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// LTE operations

TEST_F(AluIntegrationTest, lteBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U64, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 15);
    auto c = alu_simulator.lte(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U1, 1));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, lteWithTagU32Mismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U32, 17876);
    auto b = MemoryValue::from_tag(MemoryTag::U128, 17876);

    EXPECT_THROW(alu_simulator.lte(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, lteWithTagFFMismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U128, 16);

    EXPECT_THROW(alu_simulator.lte(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// NOT operations

TEST_F(AluIntegrationTest, opNotBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U16, 15);
    auto c = alu_simulator.op_not(a);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U16, UINT16_MAX - 15));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, opNotWithTagFF)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);

    EXPECT_THROW(alu_simulator.op_not(a), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// SHL operations

TEST_F(AluIntegrationTest, shlBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U16, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U16, 2);
    auto c = alu_simulator.shl(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U16, 60));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shlWithOverflowEdgeCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U128, 128);
    auto c = alu_simulator.shl(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U128, 0));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shlWithOverflowLargeShift)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U128, (static_cast<uint128_t>(1) << 127) + 8172364);
    auto c = alu_simulator.shl(a, b);
    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U128, 0));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shlWithTagFF)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 16);

    EXPECT_THROW(alu_simulator.shl(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shlWithTagFFMismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U1, 1);

    EXPECT_THROW(alu_simulator.shl(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shlWithTagU16Mismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U16, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U8, 5);

    EXPECT_THROW(alu_simulator.shl(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// SHR operations

TEST_F(AluIntegrationTest, shrBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U16, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U16, 2);
    auto c = alu_simulator.shr(a, b);

    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U16, 3));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shrWithOverflowEdgeCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U128, 128);
    auto c = alu_simulator.shr(a, b);

    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U128, 0));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shrWithOverflowLargeShift)
{
    auto a = MemoryValue::from_tag(MemoryTag::U128, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U128, (static_cast<uint128_t>(1) << 127) + 8172364);
    auto c = alu_simulator.shr(a, b);

    EXPECT_EQ(c, MemoryValue::from_tag(MemoryTag::U128, 0));

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shrWithTagFF)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 1876);
    auto b = MemoryValue::from_tag(MemoryTag::FF, 2);

    EXPECT_THROW(alu_simulator.shr(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shrWithTagFFMismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U64, 1);

    EXPECT_THROW(alu_simulator.shr(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(AluIntegrationTest, shrWithTagU16Mismatch)
{
    auto a = MemoryValue::from_tag(MemoryTag::U16, 15);
    auto b = MemoryValue::from_tag(MemoryTag::U8, 5);

    EXPECT_THROW(alu_simulator.shr(a, b), AluException);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

// Truncate operations
TEST_F(AluIntegrationTest, truncateBasicCase)
{
    auto a = MemoryValue::from_tag(MemoryTag::FF, 15);

    alu_simulator.truncate(a, MemoryTag::U1);

    TestTraceContainer trace;
    process_events(trace);
    check_relation<alu>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

} // namespace

} // namespace bb::avm2::constraining
