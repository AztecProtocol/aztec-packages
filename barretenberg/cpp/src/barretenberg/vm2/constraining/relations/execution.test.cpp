#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution = bb::avm2::execution<FF>;

TEST(ExecutionConstrainingTest, AllPositive)
{
    // clang-format off
    TestTraceContainer trace({
         {{ C::execution_sel, 1 }, {C::execution_clk, 0}, { C::execution_pc, 0 }},
        {{ C::execution_sel, 1 }, {C::execution_clk, 1}, { C::execution_pc, 20 }, { C::execution_last, 1 }}
    });
    // clang-format on

    check_relation<execution>(trace.as_rows());
}

TEST(ExecutionConstrainingTest, ContinuityPositive)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::precomputed_first_row, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on

    check_relation<execution>(trace.as_rows(), execution::SR_TRACE_CONTINUITY_1, execution::SR_TRACE_CONTINUITY_2);
}

TEST(ExecutionConstrainingTest, ContinuityBrokenFirstRow)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::execution_sel, 0 }},  // End of trace!
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace.as_rows(), execution::SR_TRACE_CONTINUITY_2),
                              "TRACE_CONTINUITY_2");
}

TEST(ExecutionConstrainingTest, ContinuityBrokenInMiddle)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 0 }},  // End of trace!
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace.as_rows(), execution::SR_TRACE_CONTINUITY_1),
                              "TRACE_CONTINUITY_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace.as_rows(), execution::SR_TRACE_CONTINUITY_2),
                              "TRACE_CONTINUITY_2");
}

TEST(ExecutionConstrainingTest, ContinuityBrokenAtTheEnd)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 0 }}, // Not marked as last, should fail.
    });
    // clang-format on

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace.as_rows(), execution::SR_TRACE_CONTINUITY_1),
                              "TRACE_CONTINUITY_1");
}

TEST(ExecutionConstrainingTest, ContinuityMultipleLast)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 0 }, {C::execution_last, 1}},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace.as_rows(), execution::SR_LAST_IS_LAST),
                              "LAST_IS_LAST.*row 1");
}

} // namespace
} // namespace bb::avm2::constraining