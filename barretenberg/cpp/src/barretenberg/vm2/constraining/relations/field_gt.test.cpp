#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_ff_gt.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::NiceMock;
using ::testing::TestWithParam;

using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::MockRangeCheck;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;
using simulation::U256Decomposition;

using FF = AvmFlavorSettings::FF;
using C = Column;
using ff_gt = bb::avm2::ff_gt<FF>;

const uint256_t TWO_POW_128 = uint256_t{ 1 } << 128;

TEST(FieldGreaterThanConstrainingTest, EmptyRow)
{
    check_relation<ff_gt>(testing::empty_trace());
}

struct GtTestParams {
    FF a;
    FF b;
    bool expected_result;
};
struct DecTestParams {
    FF a;
    U256Decomposition expected_result;
};

std::vector<GtTestParams> comparison_tests = {
    // GT
    GtTestParams{ 27, 0, true },
    GtTestParams{ TWO_POW_128, 0, true },
    GtTestParams{ -1, 0, true },
    // EQ
    GtTestParams{ 27, 27, false },
    GtTestParams{ TWO_POW_128, TWO_POW_128, false },
    GtTestParams{ -1, -1, false },
    // LT
    GtTestParams{ 0, 1, false },
    GtTestParams{ 0, TWO_POW_128, false },
    GtTestParams{ 0, -1, false }
};

std::vector<DecTestParams> decomposition_tests = {
    DecTestParams{ 0, { .lo = 0, .hi = 0 } },
    DecTestParams{ 1, { .lo = 1, .hi = 0 } },
    DecTestParams{ uint256_t(1) << 128, { .lo = 0, .hi = 1 } },
    DecTestParams{ (uint256_t(1) << 200) - 1,
                   { .lo = static_cast<uint128_t>((uint256_t(1) << 128) - 1), .hi = (uint128_t(1) << 72) - 1 } },
};

class GtBasicTest : public TestWithParam<GtTestParams> {};

TEST_P(GtBasicTest, BasicComparison)
{
    const auto& param = GetParam();

    NiceMock<MockRangeCheck> range_check;
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    EXPECT_EQ(field_gt_simulator.ff_gt(param.a, param.b), param.expected_result);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 5);
    check_relation<ff_gt>(trace);
}

INSTANTIATE_TEST_SUITE_P(FieldGreaterThanConstrainingTest, GtBasicTest, ::testing::ValuesIn(comparison_tests));

class DecBasicTest : public TestWithParam<DecTestParams> {};

TEST_P(DecBasicTest, BasicDecomposition)
{
    const auto& param = GetParam();

    NiceMock<MockRangeCheck> range_check;
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    EXPECT_EQ(field_gt_simulator.canon_dec(param.a), param.expected_result);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 2);
    check_relation<ff_gt>(trace);
}

INSTANTIATE_TEST_SUITE_P(FieldGreaterThanConstrainingTest, DecBasicTest, ::testing::ValuesIn(decomposition_tests));

class GtInteractionTests : public TestWithParam<GtTestParams> {};

TEST_P(GtInteractionTests, InteractionsWithRangeCheck)
{
    const auto& param = GetParam();

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    RangeCheck range_check(range_check_event_emitter);
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    EXPECT_EQ(field_gt_simulator.ff_gt(param.a, param.b), param.expected_result);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    RangeCheckTraceBuilder range_check_builder;

    builder.process(event_emitter.dump_events(), trace);
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    check_interaction<FieldGreaterThanTraceBuilder, //
                      lookup_ff_gt_a_hi_range_settings,
                      lookup_ff_gt_a_lo_range_settings>(trace);

    check_relation<ff_gt>(trace);
}

INSTANTIATE_TEST_SUITE_P(FieldGreaterThanConstrainingTest, GtInteractionTests, ::testing::ValuesIn(comparison_tests));

class DecInteractionTests : public TestWithParam<DecTestParams> {};

TEST_P(DecInteractionTests, InteractionsWithRangeCheck)
{
    const auto& param = GetParam();

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    RangeCheck range_check(range_check_event_emitter);
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    EXPECT_EQ(field_gt_simulator.canon_dec(param.a), param.expected_result);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    RangeCheckTraceBuilder range_check_builder;

    builder.process(event_emitter.dump_events(), trace);
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    check_interaction<FieldGreaterThanTraceBuilder, //
                      lookup_ff_gt_a_hi_range_settings,
                      lookup_ff_gt_a_lo_range_settings>(trace);

    check_relation<ff_gt>(trace);
}

INSTANTIATE_TEST_SUITE_P(FieldGreaterThanConstrainingTest,
                         DecInteractionTests,
                         ::testing::ValuesIn(decomposition_tests));

TEST(FieldGreaterThanConstrainingTest, NegativeManipulatedDecompositions)
{
    NiceMock<MockRangeCheck> range_check;
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    field_gt_simulator.ff_gt(0, 0);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);
    check_relation<ff_gt>(trace);

    trace.set(Column::ff_gt_a_lo, 1, 1);
    trace.set(Column::ff_gt_b_hi, 1, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_A_DECOMPOSITION), "A_DECOMPOSITION");
    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_B_DECOMPOSITION), "B_DECOMPOSITION");
}

TEST(FieldGreaterThanConstrainingTest, NegativeManipulatedComparisonsWithP)
{
    NiceMock<MockRangeCheck> range_check;
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    field_gt_simulator.ff_gt(0, 0);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);
    check_relation<ff_gt>(trace);

    auto p_limbs = simulation::decompose(FF::modulus);
    uint256_t p_lo = uint256_t::from_uint128(p_limbs.lo);
    uint256_t p_hi = uint256_t::from_uint128(p_limbs.hi);

    // Manipulate the decomposition in a way that passes the decomposition check due to overflow
    trace.set(Column::ff_gt_a_lo, 1, p_lo);
    trace.set(Column::ff_gt_a_hi, 1, p_hi);
    trace.set(Column::ff_gt_b_lo, 1, p_lo);
    trace.set(Column::ff_gt_b_hi, 1, p_hi);

    trace.set(Column::ff_gt_p_sub_a_hi, 1, p_lo - 1);
    trace.set(Column::ff_gt_p_sub_a_lo, 1, p_hi - 1);
    trace.set(Column::ff_gt_p_sub_b_hi, 1, p_lo - 1);
    trace.set(Column::ff_gt_p_sub_b_lo, 1, p_hi - 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_P_SUB_A_LO), "P_SUB_A_LO");
    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_P_SUB_A_HI), "P_SUB_A_HI");
    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_P_SUB_B_LO), "P_SUB_B_LO");
    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_P_SUB_B_HI), "P_SUB_B_HI");
}

TEST(FieldGreaterThanConstrainingTest, NegativeLessRangeChecks)
{
    NiceMock<MockRangeCheck> range_check;
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    field_gt_simulator.ff_gt(0, 0);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);
    check_relation<ff_gt>(trace);

    trace.set(Column::ff_gt_cmp_rng_ctr, 1, 3);
    trace.set(Column::ff_gt_cmp_rng_ctr, 2, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_RNG_CTR_GT_INIT), "RNG_CTR_GT_INIT");
    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_RNG_CTR_DECREMENT), "RNG_CTR_DECREMENT");
}

TEST(FieldGreaterThanConstrainingTest, NegativeRangeCheckCtrInitInDec)
{
    NiceMock<MockRangeCheck> range_check;
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    field_gt_simulator.canon_dec(0);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);
    check_relation<ff_gt>(trace);

    trace.set(Column::ff_gt_cmp_rng_ctr, 1, 4);
    trace.set(Column::ff_gt_cmp_rng_ctr, 2, 2);

    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_RNG_CTR_DEC_INIT), "RNG_CTR_DEC_INIT");
    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_RNG_CTR_DECREMENT), "RNG_CTR_DECREMENT");
}

TEST(FieldGreaterThanConstrainingTest, NegativeSelectorConsistency)
{
    NiceMock<MockRangeCheck> range_check;
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    field_gt_simulator.ff_gt(0, 0);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);
    check_relation<ff_gt>(trace);

    // Disable the selector after the first row
    trace.set(Column::ff_gt_sel, 2, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_SEL_CONSISTENCY), "SEL_CONSISTENCY");
}

TEST(FieldGreaterThanConstrainingTest, NegativeEraseShift)
{
    NiceMock<MockRangeCheck> range_check;
    EventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt_simulator(range_check, event_emitter);

    field_gt_simulator.ff_gt(42, 27);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    FieldGreaterThanTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);
    check_relation<ff_gt>(trace);

    trace.set(Column::ff_gt_a_lo, 2, 0);
    trace.set(Column::ff_gt_a_hi, 2, 0);
    trace.set(Column::ff_gt_p_sub_a_lo, 2, 0);
    trace.set(Column::ff_gt_p_sub_a_hi, 2, 0);
    trace.set(Column::ff_gt_b_lo, 2, 0);
    trace.set(Column::ff_gt_b_hi, 2, 0);
    trace.set(Column::ff_gt_p_sub_b_lo, 2, 0);
    trace.set(Column::ff_gt_p_sub_b_hi, 2, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_SHIFT_0), "SHIFT_0");
    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_SHIFT_1), "SHIFT_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_SHIFT_2), "SHIFT_2");
    EXPECT_THROW_WITH_MESSAGE(check_relation<ff_gt>(trace, ff_gt::SR_SHIFT_3), "SHIFT_3");
}

} // namespace
} // namespace bb::avm2::constraining
