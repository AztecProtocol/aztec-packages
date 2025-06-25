#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/context.hpp"
#include "barretenberg/vm2/generated/relations/lookups_context.hpp"
#include "barretenberg/vm2/generated/relations/lookups_internal_call.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using internal_call = bb::avm2::internal_call<FF>;
using execution = bb::avm2::execution<FF>;
using stack_call_interaction = bb::avm2::lookup_internal_call_push_call_stack_relation<FF>;
using stack_return_interaction = bb::avm2::lookup_internal_call_unwind_call_stack_relation<FF>;

TEST(InternalCallStackConstrainingTest, EmptyRow)
{
    check_relation<internal_call>(testing::empty_trace());
}

TEST(InternalCallStackConstrainingTest, DispatchInternalCall)
{
    // Test the sel_dispatch_get_env_var gating logic
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // No earlier errors, should get env var
        { { C::execution_sel, 1 },
          { C::execution_sel_internal_call, 1 },
          { C::execution_sel_should_dispatch_opcode, 1 },
          { C::execution_sel_dispatch_internal_call, 1 } },
        // Earlier error, should not get env var
        { { C::execution_sel, 1 },
          { C::execution_sel_internal_call, 1 },
          { C::execution_sel_should_dispatch_opcode, 0 },
          { C::execution_sel_dispatch_internal_call, 0 } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    check_relation<execution>(trace, execution::SR_SEL_DISPATCH_INTERNAL_CALL);

    // Negative test: opcode was dispatched and there are no prior errors, but sel_dispatch_get_env_var = 0
    trace.set(C::execution_sel_dispatch_internal_call, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_SEL_DISPATCH_INTERNAL_CALL),
                              "SEL_DISPATCH_INTERNAL_CALL");
    // Reset sel_dispatch_get_env_var to 1
    trace.set(C::execution_sel_dispatch_internal_call, 1, 1);

    // Test opposite case: there are prior errors, but sel_dispatch_get_env_var = 1
    trace.set(C::execution_sel_dispatch_internal_call, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_SEL_DISPATCH_INTERNAL_CALL),
                              "SEL_DISPATCH_INTERNAL_CALL");
    // Reset sel_dispatch_get_env_var to 0
    trace.set(C::execution_sel_dispatch_internal_call, 2, 0);
}

TEST(InternalCallStackConstrainingTest, DispatchInternalReturn)
{
    // Test the sel_dispatch_get_env_var gating logic
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // No earlier errors, should get env var
        { { C::execution_sel, 1 },
          { C::execution_sel_internal_return, 1 },
          { C::execution_sel_should_dispatch_opcode, 1 },
          { C::execution_sel_dispatch_internal_return, 1 } },
        // Earlier error, should not get env var
        { { C::execution_sel, 1 },
          { C::execution_sel_internal_return, 1 },
          { C::execution_sel_should_dispatch_opcode, 0 },
          { C::execution_sel_dispatch_internal_return, 0 } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    check_relation<execution>(trace, execution::SR_SEL_DISPATCH_INTERNAL_RETURN);

    // Negative test: opcode was dispatched and there are no prior errors, but sel_dispatch_get_env_var = 0
    trace.set(C::execution_sel_dispatch_internal_return, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_SEL_DISPATCH_INTERNAL_RETURN),
                              "SEL_DISPATCH_INTERNAL_RETURN");
    // Reset sel_dispatch_get_env_var to 1
    trace.set(C::execution_sel_dispatch_internal_return, 1, 1);

    // Test opposite case: there are prior errors, but sel_dispatch_get_env_var = 1
    trace.set(C::execution_sel_dispatch_internal_return, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_SEL_DISPATCH_INTERNAL_RETURN),
                              "SEL_DISPATCH_INTERNAL_RETURN");
    // Reset sel_dispatch_get_env_var to 0
    trace.set(C::execution_sel_dispatch_internal_return, 2, 0);
}

// This test currently does a lot, consider splitting up the various exit call conditions
TEST(InternalCallStackConstrainingTest, SimpleInternalCallReturn)
{
    TestTraceContainer trace({ {
                                   { C::execution_next_context_id, 0 },
                                   { C::precomputed_first_row, 1 },
                                   // Internal Call Stack Cols
                                   { C::internal_call_stack_sel, 1 },
                                   { C::internal_call_stack_entered_call_id, 2 },
                                   { C::internal_call_stack_id, 1 },
                                   { C::internal_call_stack_return_id, 0 },
                                   { C::internal_call_stack_return_pc, 10 },
                               },
                               // First Row of execution (Internal Call)
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 0 },
                                   { C::execution_enqueued_call_start, 1 },
                                   { C::execution_next_pc, 10 },
                                   { C::execution_sel_dispatch_internal_call, 1 },
                                   // Operands
                                   { C::execution_rop_0_, /*loc=*/12345 },
                                   // Internal Call Cols
                                   { C::execution_next_internal_call_id, 2 },
                                   { C::execution_internal_call_id, 1 },
                                   { C::execution_internal_call_return_id, 0 },
                               },
                               // Separator row to test propagation
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 12345 },
                                   { C::execution_next_pc, 100000 },
                                   // Internal Call Cols
                                   { C::execution_next_internal_call_id, 3 },
                                   { C::execution_internal_call_id, 2 },
                                   { C::execution_internal_call_return_id, 1 },
                               },
                               // Internal Return
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 100000 },
                                   { C::execution_sel_dispatch_internal_return, 1 },
                                   // Internal Call Cols
                                   { C::execution_next_internal_call_id, 3 },
                                   { C::execution_internal_call_id, 2 },
                                   { C::execution_internal_call_return_id, 1 },
                                   // Error flags
                                   { C::execution_internal_ret_err, 0 },
                                   { C::execution_internal_call_id_inv, FF(2).invert() },
                               },
                               // Restored Row
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 10 },
                                   { C::execution_next_pc, 20 },
                                   // Internal Call Cols
                                   { C::execution_next_internal_call_id, 3 },
                                   { C::execution_internal_call_id, 1 },
                                   { C::execution_internal_call_return_id, 0 },
                               },
                               // Separator Row to test propagation
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 20 },
                                   { C::execution_enqueued_call_end, 1 },
                                   // Internal Call Cols
                                   { C::execution_next_internal_call_id, 3 },
                                   { C::execution_internal_call_id, 1 },
                                   { C::execution_internal_call_return_id, 0 },
                               },
                               // Last Row
                               {
                                   { C::execution_sel, 0 },
                                   { C::execution_last, 1 },
                               } });

    check_relation<internal_call>(trace);

    tracegen::LookupIntoDynamicTableSequential<stack_call_interaction::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<stack_return_interaction::Settings>().process(trace);
}

} // namespace
} // namespace bb::avm2::constraining
