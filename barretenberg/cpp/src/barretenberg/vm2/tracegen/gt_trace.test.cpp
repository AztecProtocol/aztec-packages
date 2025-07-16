#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;

using R = TestTraceContainer::Row;

TEST(GTTraceGenTest, TraceGenerationGT)
{
    TestTraceContainer trace;
    GreaterThanTraceBuilder builder;

    uint128_t u128_max = static_cast<uint128_t>((uint256_t(1) << 128) - 1);

    builder.process(
        {
            { .a = 2, .b = 1, .result = true },
            { .a = 1, .b = u128_max, .result = false },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(gt_sel, 1),
                                  ROW_FIELD_EQ(gt_input_a, 2),
                                  ROW_FIELD_EQ(gt_input_b, 1),
                                  ROW_FIELD_EQ(gt_res, 1),
                                  ROW_FIELD_EQ(gt_abs_diff, 0),
                                  ROW_FIELD_EQ(gt_constant_128, 128)),
                            AllOf(ROW_FIELD_EQ(gt_sel, 1),
                                  ROW_FIELD_EQ(gt_input_a, 1),
                                  ROW_FIELD_EQ(gt_input_b, u128_max),
                                  ROW_FIELD_EQ(gt_res, 0),
                                  ROW_FIELD_EQ(gt_abs_diff, u128_max - 1),
                                  ROW_FIELD_EQ(gt_constant_128, 128))));
}

} // namespace
} // namespace bb::avm2::tracegen
