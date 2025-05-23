#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_context.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution = bb::avm2::execution<FF>;
using context = bb::avm2::context<FF>;
using context_stack = bb::avm2::context_stack<FF>;
using stack_call_interaction = bb::avm2::lookup_context_ctx_stack_call_relation<FF>;
using stack_return_interaction = bb::avm2::lookup_context_ctx_stack_return_relation<FF>;

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

// This test currently does a lot, consider splitting up the various exit call conditions
TEST(ExecutionConstrainingTest, ContextSwitchingCallReturn)
{
    TestTraceContainer trace({ {
                                   { C::execution_next_context_id, 0 },
                                   { C::precomputed_first_row, 1 },
                                   // Context Stack Rows
                                   { C::context_stack_sel, 1 },
                                   { C::context_stack_entered_context_id, 2 },
                                   { C::context_stack_context_id, 1 },
                                   { C::context_stack_parent_id, 0 },
                                   { C::context_stack_next_pc, 2 },
                                   { C::context_stack_msg_sender, 0 },
                                   { C::context_stack_contract_address, 0 },
                                   { C::context_stack_is_static, 0 },
                                   { C::context_stack_parent_calldata_offset_addr, 0 },
                                   { C::context_stack_parent_calldata_size_addr, 0 },
                               },
                               // First Row of execution
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 0 },
                                   { C::execution_next_pc, 1 },
                                   { C::execution_context_id, 1 },
                                   { C::execution_next_context_id, 2 },
                               },
                               // CALL
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 1 },
                                   { C::execution_next_pc, 2 },
                                   { C::execution_sel_call, 1 },
                                   { C::execution_sel_enter_call, 1 },
                                   { C::execution_context_id, 1 },
                                   { C::execution_next_context_id, 2 },
                                   { C::execution_rop4, /*cd offset=*/10 },
                                   { C::execution_rop5, /*cd size=*/1 },
                                   { C::execution_reg3, /*contract address=*/0xdeadbeef },
                               },
                               // First Row in new context
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 0 }, // pc=0 because it is after a CALL
                                   { C::execution_next_pc, 20 },
                                   { C::execution_context_id, 2 },      // Previous row next_context_id
                                   { C::execution_next_context_id, 3 }, // Incremented due to previous call
                                   { C::execution_parent_id, 1 },       // Previous row context id
                                   { C::execution_is_parent_id_inv, 1 },
                                   { C::execution_has_parent_ctx, 1 },
                                   { C::execution_contract_address, 0xdeadbeef },
                                   { C::execution_parent_calldata_offset_addr, 10 },
                                   { C::execution_parent_calldata_size_addr, 1 },
                               },
                               // Return Row
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 20 },
                                   { C::execution_next_pc, 30 },
                                   { C::execution_sel_return, 1 },
                                   { C::execution_rop1, 500 }, // Return data size offset
                                   { C::execution_rop2, 600 }, // Return data offset
                                   { C::execution_reg1, 200 }, // Return data size
                                   { C::execution_sel_exit_call, 1 },
                                   { C::execution_nested_exit_call, 1 },
                                   { C::execution_nested_return, 1 },
                                   { C::execution_context_id, 2 },
                                   { C::execution_next_context_id, 3 },
                                   { C::execution_parent_id, 1 },
                                   { C::execution_is_parent_id_inv, 1 },
                                   { C::execution_has_parent_ctx, 1 },
                                   { C::execution_contract_address, 0xdeadbeef },
                                   { C::execution_parent_calldata_offset_addr, 10 },
                                   { C::execution_parent_calldata_size_addr, 1 },
                               },
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_next_context_id, 3 },
                                   { C::execution_context_id, 1 },
                                   { C::execution_parent_id, 0 },
                                   { C::execution_pc, 2 }, // Based on next_pc of CALL step
                                   { C::execution_msg_sender, 0 },
                                   { C::execution_contract_address, 0 },
                                   { C::execution_is_static, 0 },
                                   { C::execution_parent_calldata_offset_addr, 0 },
                                   { C::execution_parent_calldata_size_addr, 0 },
                                   { C::execution_last_child_returndata_size, 200 },        // Return data size
                                   { C::execution_last_child_returndata_offset_addr, 600 }, // Return data offset
                               },
                               {
                                   { C::execution_sel, 0 },
                                   { C::execution_last, 1 },
                               } });

    check_relation<context>(trace);

    tracegen::LookupIntoDynamicTableSequential<stack_call_interaction::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<stack_return_interaction::Settings>().process(trace);
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
