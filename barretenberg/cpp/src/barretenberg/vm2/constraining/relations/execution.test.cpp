#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution = bb::avm2::execution<FF>;
using context = bb::avm2::context<FF>;

TEST(ExecutionConstrainingTest, Basic)
{
    // clang-format off
    TestTraceContainer trace({
         {{ C::execution_sel, 1 }, { C::execution_pc, 0 }},
         {{ C::execution_sel, 1 }, { C::execution_pc, 20 }, { C::execution_last, 1 }}
    });
    // clang-format on

    check_relation<execution>(trace);
}

TEST(ExecutionConstrainingTest, Continuity)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::precomputed_first_row, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on

    check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY_1, execution::SR_TRACE_CONTINUITY_2);
}

TEST(ExecutionConstrainingTest, ContextSwitchingCall)
{
    TestTraceContainer trace({ {
                                   { C::execution_next_context_id, 0 },
                                   { C::precomputed_first_row, 1 },
                               },
                               // Dummy Row
                               { { C::execution_sel, 1 },
                                 { C::execution_pc, 0 },
                                 { C::execution_next_pc, 1 },
                                 { C::execution_context_id, 1 },
                                 { C::execution_next_context_id, 2 } },
                               // CALL
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 1 },
                                   { C::execution_next_pc, 2 },
                                   { C::execution_sel_call, 1 },
                                   { C::execution_context_id, 1 },
                                   { C::execution_next_context_id, 2 },
                                   { C::execution_rop4, /*cd offset=*/10 },
                                   { C::execution_rop5, /*cd size=*/1 },
                                   { C::execution_reg3, /*contract address=*/0xdeadbeef },
                               },
                               // Dummy Row in new context
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 0 }, // pc=0 because it is after a CALL
                                   { C::execution_next_pc, 20 },
                                   { C::execution_context_id, 2 },      // Previous row next_context_id
                                   { C::execution_next_context_id, 3 }, // Incremented due to previous call
                                   { C::execution_parent_id, 1 },       // Previous row context id
                                   { C::execution_contract_address, 0xdeadbeef },
                                   { C::execution_parent_calldata_offset_addr, 10 },
                                   { C::execution_parent_calldata_size_addr, 1 },
                               },
                               {
                                   { C::execution_sel, 0 },
                                   { C::execution_last, 1 },
                               } });

    check_relation<context>(trace);
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

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY_2), "TRACE_CONTINUITY_2");
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

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY_1), "TRACE_CONTINUITY_1");
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY_2), "TRACE_CONTINUITY_2");
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

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY_1), "TRACE_CONTINUITY_1");
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

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_LAST_IS_LAST), "LAST_IS_LAST.*row 1");
}

} // namespace
} // namespace bb::avm2::constraining
