#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/context.hpp"
#include "barretenberg/vm2/generated/relations/lookups_context.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using context = bb::avm2::context<FF>;
using stack_call_interaction = bb::avm2::lookup_context_ctx_stack_call_relation<FF>;
using stack_return_interaction = bb::avm2::lookup_context_ctx_stack_return_relation<FF>;

TEST(ContextConstrainingTest, EmptyRow)
{
    check_relation<context>(testing::empty_trace());
}

// This test currently does a lot, consider splitting up the various exit call conditions
TEST(ContextConstrainingTest, ContextSwitchingCallReturn)
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
                                   { C::context_stack_parent_calldata_addr, 0 },
                                   { C::context_stack_parent_calldata_size, 0 },
                                   { C::context_stack_parent_l2_gas_limit, 2000 },
                                   { C::context_stack_parent_da_gas_limit, 4000 },
                                   { C::context_stack_parent_l2_gas_used, 500 },
                                   { C::context_stack_parent_da_gas_used, 1500 },
                                   { C::context_stack_parent_calldata_addr, 0 },
                                   { C::context_stack_parent_calldata_size, 0 },
                               },
                               // First Row of execution
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 0 },
                                   { C::execution_next_pc, 1 },
                                   { C::execution_context_id, 1 },
                                   { C::execution_next_context_id, 2 },
                                   { C::execution_parent_l2_gas_limit, 2000 },
                                   { C::execution_parent_da_gas_limit, 4000 },
                                   { C::execution_parent_l2_gas_used, 500 },
                                   { C::execution_parent_da_gas_used, 1500 },
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
                                   { C::execution_rop_3_, /*cd offset=*/10 },
                                   { C::execution_rop_4_, /*cd size=*/1 },
                                   { C::execution_register_2_, /*contract address=*/0xdeadbeef },
                                   { C::execution_parent_l2_gas_limit, 2000 },
                                   { C::execution_parent_da_gas_limit, 4000 },
                                   { C::execution_parent_l2_gas_used, 500 },
                                   { C::execution_parent_da_gas_used, 1500 },
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
                                   { C::execution_parent_calldata_addr, 10 },
                                   { C::execution_parent_calldata_size, 1 },
                               },
                               // Return Row
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_pc, 20 },
                                   { C::execution_next_pc, 30 },
                                   { C::execution_sel_return, 1 },
                                   { C::execution_rop_0_, 500 },      // Return data size offset
                                   { C::execution_rop_1_, 600 },      // Return data offset
                                   { C::execution_register_0_, 200 }, // Return data size
                                   { C::execution_sel_exit_call, 1 },
                                   { C::execution_nested_exit_call, 1 },
                                   { C::execution_nested_return, 1 },
                                   { C::execution_context_id, 2 },
                                   { C::execution_next_context_id, 3 },
                                   { C::execution_parent_id, 1 },
                                   { C::execution_is_parent_id_inv, 1 },
                                   { C::execution_has_parent_ctx, 1 },
                                   { C::execution_contract_address, 0xdeadbeef },
                                   { C::execution_parent_calldata_addr, 10 },
                                   { C::execution_parent_calldata_size, 1 },
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
                                   { C::execution_parent_calldata_addr, 0 },
                                   { C::execution_parent_calldata_size, 0 },
                                   { C::execution_last_child_returndata_size, 200 }, // Return data size
                                   { C::execution_last_child_returndata_addr, 600 }, // Return data offset
                                   { C::execution_parent_l2_gas_limit, 2000 },
                                   { C::execution_parent_da_gas_limit, 4000 },
                                   { C::execution_parent_l2_gas_used, 500 },
                                   { C::execution_parent_da_gas_used, 1500 },
                                   { C::execution_parent_calldata_addr, 0 },
                                   { C::execution_parent_calldata_size, 0 },
                                   { C::execution_last_child_returndata_size, 200 }, // Return data size
                                   { C::execution_last_child_returndata_addr, 600 }, // Return data offset
                               },
                               {
                                   { C::execution_sel, 0 },
                                   { C::execution_last, 1 },
                               } });

    check_relation<context>(trace);

    // TODO: Migrate to check_interaction pattern once these lookups are added in a builder
    tracegen::LookupIntoDynamicTableSequential<stack_call_interaction::Settings>().process(trace);
    tracegen::LookupIntoDynamicTableSequential<stack_return_interaction::Settings>().process(trace);
}

TEST(ContextConstrainingTest, GasNextRow)
{
    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } },
                               {
                                   // First Row of execution
                                   { C::execution_sel, 1 },
                                   { C::execution_l2_gas_limit, 1000 },
                                   { C::execution_da_gas_limit, 2000 },
                                   { C::execution_parent_l2_gas_limit, 2000 },
                                   { C::execution_parent_da_gas_limit, 4000 },
                                   { C::execution_parent_l2_gas_used, 500 },
                                   { C::execution_parent_da_gas_used, 1500 },
                               },
                               {
                                   // CALL
                                   { C::execution_sel, 1 },
                                   { C::execution_sel_enter_call, 1 },
                                   { C::execution_l2_gas_used, 200 },
                                   { C::execution_da_gas_used, 300 },
                                   { C::execution_l2_gas_limit, 1000 },
                                   { C::execution_da_gas_limit, 2000 },
                                   { C::execution_parent_l2_gas_limit, 2000 },
                                   { C::execution_parent_da_gas_limit, 4000 },
                                   { C::execution_parent_l2_gas_used, 500 },
                                   { C::execution_parent_da_gas_used, 1500 },
                               },
                               {
                                   // Return
                                   { C::execution_sel, 1 },
                                   { C::execution_sel_exit_call, 1 },
                                   { C::execution_nested_exit_call, 1 },
                                   { C::execution_parent_l2_gas_limit, 1000 },
                                   { C::execution_parent_da_gas_limit, 2000 },
                                   { C::execution_parent_l2_gas_used, 200 },
                                   { C::execution_parent_da_gas_used, 300 },
                               },
                               {
                                   // After return
                                   { C::execution_sel, 1 },
                                   { C::execution_l2_gas_limit, 1000 },
                                   { C::execution_da_gas_limit, 2000 },
                                   { C::execution_parent_l2_gas_limit, 2000 },
                                   { C::execution_parent_da_gas_limit, 4000 },
                               },
                               {
                                   { C::execution_sel, 0 },
                                   { C::execution_last, 1 },
                               } });

    check_relation<context>(trace,
                            context::SR_L2_GAS_LIMIT_NEXT_ROW,
                            context::SR_L2_GAS_LIMIT_RESTORE_ON_EXIT,
                            context::SR_DA_GAS_LIMIT_NEXT_ROW,
                            context::SR_DA_GAS_LIMIT_RESTORE_ON_EXIT,
                            context::SR_PARENT_L2_GAS_LIMIT_NEXT_ROW,
                            context::SR_PARENT_L2_GAS_LIMIT_STORE_ON_ENTER,
                            context::SR_PARENT_DA_GAS_LIMIT_NEXT_ROW,
                            context::SR_PARENT_DA_GAS_LIMIT_STORE_ON_ENTER,
                            context::SR_PARENT_L2_GAS_USED_NEXT_ROW,
                            context::SR_PARENT_L2_GAS_USED_STORE_ON_ENTER,
                            context::SR_PARENT_DA_GAS_USED_NEXT_ROW,
                            context::SR_PARENT_DA_GAS_USED_STORE_ON_ENTER);

    // Negative test: after return, restore wrong limits
    trace.set(C::execution_l2_gas_limit, 4, 1001);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_L2_GAS_LIMIT_RESTORE_ON_EXIT),
                              "L2_GAS_LIMIT_RESTORE_ON_EXIT");
    trace.set(C::execution_da_gas_limit, 4, 2001);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_DA_GAS_LIMIT_RESTORE_ON_EXIT),
                              "DA_GAS_LIMIT_RESTORE_ON_EXIT");

    // Negative test: inside a nested call, store wrong parent limit and used
    trace.set(C::execution_parent_l2_gas_limit, 3, 2001);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PARENT_L2_GAS_LIMIT_STORE_ON_ENTER),
                              "PARENT_L2_GAS_LIMIT_STORE_ON_ENTER");
    trace.set(C::execution_parent_da_gas_limit, 3, 4001);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PARENT_DA_GAS_LIMIT_STORE_ON_ENTER),
                              "PARENT_DA_GAS_LIMIT_STORE_ON_ENTER");
    trace.set(C::execution_parent_l2_gas_used, 3, 201);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PARENT_L2_GAS_USED_STORE_ON_ENTER),
                              "PARENT_L2_GAS_USED_STORE_ON_ENTER");
    trace.set(C::execution_parent_da_gas_used, 3, 301);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PARENT_DA_GAS_USED_STORE_ON_ENTER),
                              "PARENT_DA_GAS_USED_STORE_ON_ENTER");

    // Negative test: when no calls have been made, limits, parent limits, and parent used shouldn't change
    trace.set(C::execution_l2_gas_limit, 2, 1001);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_L2_GAS_LIMIT_NEXT_ROW),
                              "L2_GAS_LIMIT_NEXT_ROW");
    trace.set(C::execution_da_gas_limit, 2, 2001);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_DA_GAS_LIMIT_NEXT_ROW),
                              "DA_GAS_LIMIT_NEXT_ROW");

    trace.set(C::execution_parent_l2_gas_limit, 2, 2001);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PARENT_L2_GAS_LIMIT_NEXT_ROW),
                              "PARENT_L2_GAS_LIMIT_NEXT_ROW");
    trace.set(C::execution_parent_da_gas_limit, 2, 4001);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PARENT_DA_GAS_LIMIT_NEXT_ROW),
                              "PARENT_DA_GAS_LIMIT_NEXT_ROW");

    trace.set(C::execution_parent_l2_gas_used, 2, 501);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PARENT_L2_GAS_USED_NEXT_ROW),
                              "PARENT_L2_GAS_USED_NEXT_ROW");
    trace.set(C::execution_parent_da_gas_used, 2, 1501);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PARENT_DA_GAS_USED_NEXT_ROW),
                              "PARENT_DA_GAS_USED_NEXT_ROW");
}

TEST(ContextConstrainingTest, GasUsedContinuity)
{
    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } },
                               {
                                   // First Row of execution
                                   { C::execution_sel, 1 },
                                   { C::execution_l2_gas_used, 100 },
                                   { C::execution_da_gas_used, 200 },
                               },
                               {
                                   // CALL
                                   { C::execution_sel, 1 },
                                   { C::execution_sel_enter_call, 1 },
                                   { C::execution_l2_gas_used, 110 },
                                   { C::execution_da_gas_used, 200 },
                                   { C::execution_prev_l2_gas_used, 100 },
                                   { C::execution_prev_da_gas_used, 200 },
                               },
                               {
                                   // Return
                                   { C::execution_sel, 1 },
                                   { C::execution_sel_exit_call, 1 },
                                   { C::execution_nested_exit_call, 1 },
                                   { C::execution_l2_gas_used, 50 },
                                   { C::execution_da_gas_used, 60 },
                                   { C::execution_parent_l2_gas_used, 110 },
                                   { C::execution_parent_da_gas_used, 200 },
                                   { C::execution_prev_l2_gas_used, 0 },
                                   { C::execution_prev_da_gas_used, 0 },
                               },
                               {
                                   // After return
                                   { C::execution_sel, 1 },
                                   { C::execution_l2_gas_used, 170 },
                                   { C::execution_da_gas_used, 260 },
                                   { C::execution_prev_l2_gas_used, 160 }, // 110 + 50
                                   { C::execution_prev_da_gas_used, 260 }, // 200 + 60
                               },
                               {
                                   { C::execution_sel, 0 },
                                   { C::execution_last, 1 },
                               } });

    check_relation<context>(trace,
                            context::SR_L2_GAS_USED_CONTINUITY,
                            context::SR_L2_GAS_USED_ZERO_AFTER_CALL,
                            context::SR_L2_GAS_USED_INGEST_AFTER_EXIT,
                            context::SR_DA_GAS_USED_CONTINUITY,
                            context::SR_DA_GAS_USED_ZERO_AFTER_CALL,
                            context::SR_DA_GAS_USED_INGEST_AFTER_EXIT);

    // Negative test: after return, ingest a wrong value
    trace.set(C::execution_prev_l2_gas_used, 4, 110);

    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_L2_GAS_USED_INGEST_AFTER_EXIT),
                              "L2_GAS_USED_INGEST_AFTER_EXIT");

    trace.set(C::execution_prev_da_gas_used, 4, 60);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_DA_GAS_USED_INGEST_AFTER_EXIT),
                              "DA_GAS_USED_INGEST_AFTER_EXIT");

    // Negative test: inside a nested call, start with non-zero gas used
    trace.set(C::execution_prev_l2_gas_used, 3, 110);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_L2_GAS_USED_ZERO_AFTER_CALL),
                              "L2_GAS_USED_ZERO_AFTER_CALL");

    trace.set(C::execution_prev_da_gas_used, 3, 200);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_DA_GAS_USED_ZERO_AFTER_CALL),
                              "DA_GAS_USED_ZERO_AFTER_CALL");

    // Negative test: when no calls are made, prev gas used should be gas used of the previous row
    trace.set(C::execution_prev_l2_gas_used, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_L2_GAS_USED_CONTINUITY),
                              "L2_GAS_USED_CONTINUITY");

    trace.set(C::execution_prev_da_gas_used, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_DA_GAS_USED_CONTINUITY),
                              "DA_GAS_USED_CONTINUITY");
}

} // namespace
} // namespace bb::avm2::constraining
