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
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using internal_call = bb::avm2::internal_call<FF>;

TEST(InternalCallStackConstrainingTest, EmptyRow)
{
    check_relation<internal_call>(testing::empty_trace());
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
                                   { C::execution_sel_internal_call, 1 },
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
                                   { C::execution_sel_internal_return, 1 },
                                   // Internal Call Cols
                                   { C::execution_next_internal_call_id, 3 },
                                   { C::execution_internal_call_id, 2 },
                                   { C::execution_internal_call_return_id, 1 },
                                   // Error flags (no error)
                                   { C::execution_internal_call_return_id_inv, 1 }, // FF(1).invert()
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

    check_interaction<ExecutionTraceBuilder,
                      lookup_internal_call_push_call_stack_settings,
                      lookup_internal_call_unwind_call_stack_settings>(trace);
}

TEST(InternalCallStackConstrainingTest, ReturnError)
{
    TestTraceContainer trace({ {
                                   { C::execution_next_context_id, 0 },
                                   { C::precomputed_first_row, 1 },
                               },
                               // First Row of execution
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 0 },
                                   { C::execution_enqueued_call_start, 1 },
                                   { C::execution_next_pc, 10 },
                                   // Internal Call Cols
                                   { C::execution_next_internal_call_id, 2 },
                                   { C::execution_internal_call_id, 1 },
                                   { C::execution_internal_call_return_id, 0 },
                               },
                               // Internal Return with error
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 10 },
                                   { C::execution_sel_internal_return, 1 },
                                   // Internal Call Cols
                                   { C::execution_next_internal_call_id, 2 },
                                   { C::execution_internal_call_id, 1 },
                                   { C::execution_internal_call_return_id, 0 },
                                   // Error flags
                                   { C::execution_internal_call_return_id_inv, 0 }, // Cannot invert return_id = 0
                                   { C::execution_sel_opcode_error, 1 },            // Error flag
                               },
                               // Last Row
                               {
                                   { C::execution_sel, 0 },
                                   { C::execution_last, 1 },
                               } });

    check_relation<internal_call>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
