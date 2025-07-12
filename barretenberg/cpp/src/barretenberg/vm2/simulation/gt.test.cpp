#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace bb::avm2::simulation {

using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::StrictMock;

namespace {

TEST(AvmSimulationGTTest, GTTrue)
{
    EventEmitter<GreaterThanEvent> gt_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    GreaterThan gt(field_gt, range_check, gt_event_emitter);

    uint128_t a = 2;
    uint128_t b = 1;

    EXPECT_CALL(range_check, assert_range(0, /*num_bits=*/128));

    auto c = gt.gt(a, b);

    EXPECT_EQ(c, true);

    auto events = gt_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(GreaterThanEvent{ .a = a, .b = b, .result = c }));
}

TEST(AvmSimulationGTTest, GTFalse)
{
    EventEmitter<GreaterThanEvent> gt_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    GreaterThan gt(field_gt, range_check, gt_event_emitter);

    uint128_t u128_max = static_cast<uint128_t>((uint256_t(1) << 128) - 1);

    uint128_t a = 2;
    uint128_t b = u128_max;

    EXPECT_CALL(range_check, assert_range(u128_max - 2, /*num_bits=*/128));

    auto c = gt.gt(a, b);

    EXPECT_EQ(c, false);

    auto events = gt_event_emitter.dump_events();
    EXPECT_THAT(events, ElementsAre(GreaterThanEvent{ .a = a, .b = b, .result = c }));
}

TEST(AvmSimulationGTTest, GTFF)
{
    EventEmitter<GreaterThanEvent> gt_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    GreaterThan gt(field_gt, range_check, gt_event_emitter);

    FF a = 2;
    FF b = FF::modulus - 3;

    EXPECT_CALL(field_gt, ff_gt(FF(2), FF(FF::modulus - 3))).WillOnce(Return(false));
    EXPECT_FALSE(gt.gt(a, b));

    EXPECT_CALL(field_gt, ff_gt(FF(FF::modulus - 3), FF(2))).WillOnce(Return(true));
    EXPECT_TRUE(gt.gt(b, a));
}

TEST(AvmSimulationGTTest, GTMemoryValue)
{
    EventEmitter<GreaterThanEvent> gt_event_emitter;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    GreaterThan gt(field_gt, range_check, gt_event_emitter);

    auto a = MemoryValue::from<uint64_t>(2);
    auto b = MemoryValue::from<uint64_t>(1);

    EXPECT_CALL(range_check, assert_range(0, /*num_bits=*/128));
    EXPECT_TRUE(gt.gt(a, b));

    auto a_ff = MemoryValue::from<FF>(1);
    auto b_ff = MemoryValue::from<FF>(2);

    EXPECT_CALL(field_gt, ff_gt(FF(1), FF(2))).WillOnce(Return(false));
    EXPECT_FALSE(gt.gt(a_ff, b_ff));
}

} // namespace
} // namespace bb::avm2::simulation
