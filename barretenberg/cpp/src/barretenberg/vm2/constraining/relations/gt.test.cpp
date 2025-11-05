#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using gt = bb::avm2::gt<FF>;
using tracegen::GreaterThanTraceBuilder;
using tracegen::RangeCheckTraceBuilder;

const std::vector<std::array<uint128_t, 3>> TEST_VALUES = { { 1, 2, 16 },
                                                            { 2, 1, 16 },
                                                            { 2, 2, 16 },
                                                            { uint128_t{ (uint256_t(1) << 128) - 1 }, 1, 128 },
                                                            { 1, uint128_t{ (uint256_t(1) << 128) - 1 }, 128 } };

class GreaterThanTest : public ::testing::TestWithParam<std::array<uint128_t, 3>> {};

INSTANTIATE_TEST_SUITE_P(GreaterThanConstrainingTest, GreaterThanTest, ::testing::ValuesIn(TEST_VALUES));

TEST_P(GreaterThanTest, GreaterThan)
{
    RangeCheckTraceBuilder range_check_builder;
    auto [a, b, num_bits] = GetParam();
    bool res = a > b;
    uint128_t abs_diff = res ? a - b - 1 : b - a;
    auto trace = TestTraceContainer({
        {
            { C::gt_abs_diff, abs_diff },
            { C::gt_input_a, a },
            { C::gt_input_b, b },
            { C::gt_num_bits, num_bits },
            { C::gt_res, static_cast<uint8_t>(res) },
            { C::gt_sel, 1 },
        },
    });
    range_check_builder.process({ { .value = abs_diff, .num_bits = static_cast<uint8_t>(num_bits) } }, trace);
    check_all_interactions<GreaterThanTraceBuilder>(trace);
    check_relation<gt>(trace);
}

TEST_P(GreaterThanTest, GreaterThanTraceGen)
{
    RangeCheckTraceBuilder range_check_builder;
    TestTraceContainer trace;
    GreaterThanTraceBuilder builder;
    auto [a, b, num_bits] = GetParam();
    builder.process(
        {
            {
                .a = a,
                .b = b,
                .result = a > b,
            },
        },
        trace);
    range_check_builder.process({ { .value = a > b ? a - b - 1 : b - a, .num_bits = static_cast<uint8_t>(num_bits) } },
                                trace);
    check_all_interactions<GreaterThanTraceBuilder>(trace);
    check_relation<gt>(trace);
}

TEST(GreaterThanConstrainingTest, NegativeGT)
{
    RangeCheckTraceBuilder range_check_builder;
    uint128_t a = 2;
    uint128_t b = 1;
    bool res = a > b;
    uint128_t abs_diff = res ? a - b - 1 : b - a;
    auto trace = TestTraceContainer({
        {
            { C::gt_abs_diff, abs_diff },
            { C::gt_input_a, a },
            { C::gt_input_b, b },
            { C::gt_num_bits, 16 },
            { C::gt_res, static_cast<uint8_t>(res) },
            { C::gt_sel, 1 },
        },
    });
    range_check_builder.process({ { .value = abs_diff, .num_bits = 16 } }, trace);
    check_all_interactions<GreaterThanTraceBuilder>(trace);
    check_relation<gt>(trace);
    auto wrong_b = res ? FF(a) + 1 : FF(a) - 1;
    trace.set(Column::gt_input_b, 0, wrong_b);
    // The absolute diff is now wrong:
    EXPECT_THROW_WITH_MESSAGE(check_relation<gt>(trace), "GT_RESULT");
    // Correct the diff based on incorrect input:
    auto new_abs_diff = res ? FF(a) - wrong_b - 1 : wrong_b - FF(a);
    trace.set(Column::gt_abs_diff, 0, new_abs_diff);
    // Now, we are range checking the correct value...
    check_relation<gt>(trace);
    // ..but the check itself correctly fails (note: new_result_to_range_check doesn't fit in a u128, I'm just adding
    // an event which will definitely fail):
    range_check_builder.process({ { .value = static_cast<uint128_t>(new_abs_diff), .num_bits = 128 } }, trace);
    EXPECT_THROW_WITH_MESSAGE((check_all_interactions<GreaterThanTraceBuilder>(trace)), "LOOKUP_GT_GT_RANGE");
}

TEST(GreaterThanConstrainingTest, NegativeGTResult)
{
    RangeCheckTraceBuilder range_check_builder;
    uint128_t a = 2;
    uint128_t b = 1;
    bool res = a > b;
    uint128_t abs_diff = res ? a - b - 1 : b - a;
    auto trace = TestTraceContainer({
        {
            { C::gt_abs_diff, abs_diff },
            { C::gt_input_a, a },
            { C::gt_input_b, b },
            { C::gt_num_bits, 16 },
            { C::gt_res, static_cast<uint8_t>(res) },
            { C::gt_sel, 1 },
        },
    });
    range_check_builder.process({ { .value = abs_diff, .num_bits = 16 } }, trace);
    check_all_interactions<GreaterThanTraceBuilder>(trace);
    check_relation<gt>(trace);
    trace.set(Column::gt_res, 0, static_cast<uint8_t>(!res));
    // The absolute diff is now wrong:
    EXPECT_THROW_WITH_MESSAGE(check_relation<gt>(trace), "GT_RESULT");
    // Correct the diff based on incorrect res:
    auto new_abs_diff = res ? FF(b) - FF(a) : FF(a) - FF(b) - 1;
    trace.set(Column::gt_abs_diff, 0, new_abs_diff);
    // Now, we are range checking the correct value...
    check_relation<gt>(trace);
    // ..but the check itself correctly fails (note: new_result_to_range_check doesn't fit in a u128, I'm just adding
    // an event which will definitely fail):
    range_check_builder.process({ { .value = static_cast<uint128_t>(new_abs_diff), .num_bits = 128 } }, trace);
    EXPECT_THROW_WITH_MESSAGE((check_all_interactions<GreaterThanTraceBuilder>(trace)), "LOOKUP_GT_GT_RANGE");
}

} // namespace
} // namespace bb::avm2::constraining
