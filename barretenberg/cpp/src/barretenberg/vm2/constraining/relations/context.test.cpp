#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/context.hpp"
#include "barretenberg/vm2/generated/relations/lookups_context.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using context = bb::avm2::context<FF>;

TEST(ContextConstrainingTest, EmptyRow)
{
    check_relation<context>(testing::empty_trace());
}

// This test currently does a lot, consider splitting up the various exit call conditions
TEST(ContextConstrainingTest, ContextSwitchingCallReturn)
{
    constexpr uint32_t top_bytecode_id = 0x12345678;
    constexpr uint32_t nested_bytecode_id = 0x456789ab;

    TestTraceContainer trace(
        { {
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
              { C::context_stack_bytecode_id, top_bytecode_id },
              { C::context_stack_is_static, 0 },
              { C::context_stack_parent_calldata_addr, 0 },
              { C::context_stack_parent_calldata_size, 0 },
              { C::context_stack_parent_l2_gas_limit, 2000 },
              { C::context_stack_parent_da_gas_limit, 4000 },
              { C::context_stack_parent_l2_gas_used, 500 },
              { C::context_stack_parent_da_gas_used, 1500 },
          },
          // First Row of execution
          {
              { C::execution_sel, 1 },
              { C::execution_pc, 0 },
              { C::execution_next_pc, 1 },
              { C::execution_context_id, 1 },
              { C::execution_next_context_id, 2 },
              { C::execution_bytecode_id, top_bytecode_id },
              { C::execution_is_static, 0 }, // Non-static context
              { C::execution_parent_l2_gas_limit, 2000 },
              { C::execution_parent_da_gas_limit, 4000 },
              { C::execution_parent_l2_gas_used, 500 },
              { C::execution_parent_da_gas_used, 1500 },
              { C::execution_enqueued_call_start, 1 },
          },
          // CALL
          {
              { C::execution_sel, 1 },
              { C::execution_pc, 1 },
              { C::execution_next_pc, 2 },
              { C::execution_sel_execute_call, 1 },
              { C::execution_sel_execute_static_call, 0 }, // Regular CALL, not STATICCALL
              { C::execution_sel_enter_call, 1 },
              { C::execution_context_id, 1 },
              { C::execution_next_context_id, 2 },
              { C::execution_bytecode_id, top_bytecode_id }, // Same as previous row (propagated)
              { C::execution_is_static, 0 },                 // Still non-static
              { C::execution_rop_4_, /*cd offset=*/10 },
              { C::execution_register_2_, /*contract address=*/0xdeadbeef },
              { C::execution_register_3_, /*cd size=*/1 },
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
              { C::execution_bytecode_id, nested_bytecode_id }, // New bytecode_id on entering new context
              { C::execution_is_static, 0 },                    // Remains non-static after regular CALL
              { C::execution_parent_calldata_addr, 10 },
              { C::execution_parent_calldata_size, 1 },
          },
          // Return Row
          {
              { C::execution_sel, 1 },
              { C::execution_pc, 20 },
              { C::execution_next_pc, 30 },
              { C::execution_sel_execute_return, 1 },
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
              { C::execution_bytecode_id, nested_bytecode_id }, // Propagated within same context
              { C::execution_parent_calldata_addr, 10 },
              { C::execution_parent_calldata_size, 1 },
          },
          {
              { C::execution_sel, 1 },
              { C::execution_next_context_id, 3 },
              { C::execution_context_id, 1 },
              { C::execution_parent_id, 0 },
              { C::execution_last_child_id, 2 }, // Previous context id
              { C::execution_pc, 2 },            // Based on next_pc of CALL step
              { C::execution_msg_sender, 0 },
              { C::execution_contract_address, 0 },
              { C::execution_bytecode_id, top_bytecode_id }, // Restored from context stack
              { C::execution_is_static, 0 },
              { C::execution_parent_calldata_addr, 0 },
              { C::execution_parent_calldata_size, 0 },
              { C::execution_last_child_returndata_size, 200 }, // Return data size
              { C::execution_last_child_returndata_addr, 600 }, // Return data offset
              { C::execution_parent_l2_gas_limit, 2000 },
              { C::execution_parent_da_gas_limit, 4000 },
              { C::execution_parent_l2_gas_used, 500 },
              { C::execution_parent_da_gas_used, 1500 },
          },
          {
              { C::execution_sel, 0 },
              { C::execution_last, 1 },
          } });

    check_relation<context>(trace);

    check_interaction<tracegen::ExecutionTraceBuilder,
                      lookup_context_ctx_stack_call_settings,
                      lookup_context_ctx_stack_rollback_settings,
                      lookup_context_ctx_stack_return_settings>(trace);
}

TEST(ContextConstrainingTest, ContextSwitchingExceptionalHalt)
{
    constexpr uint32_t top_bytecode_id = 0x12345678;
    constexpr uint32_t nested_bytecode_id = 0x456789ab;

    TestTraceContainer trace(
        { {
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
              { C::context_stack_bytecode_id, top_bytecode_id },
              { C::context_stack_is_static, 0 },
              { C::context_stack_parent_calldata_addr, 0 },
              { C::context_stack_parent_calldata_size, 0 },
              { C::context_stack_parent_l2_gas_limit, 2000 },
              { C::context_stack_parent_da_gas_limit, 4000 },
              { C::context_stack_parent_l2_gas_used, 500 },
              { C::context_stack_parent_da_gas_used, 1500 },
          },
          // First Row of execution
          {
              { C::execution_sel, 1 },
              { C::execution_pc, 0 },
              { C::execution_next_pc, 1 },
              { C::execution_context_id, 1 },
              { C::execution_next_context_id, 2 },
              { C::execution_bytecode_id, top_bytecode_id },
              { C::execution_parent_l2_gas_limit, 2000 },
              { C::execution_parent_da_gas_limit, 4000 },
              { C::execution_parent_l2_gas_used, 500 },
              { C::execution_parent_da_gas_used, 1500 },
              { C::execution_enqueued_call_start, 1 },
          },
          // CALL
          {
              { C::execution_sel, 1 },
              { C::execution_pc, 1 },
              { C::execution_next_pc, 2 },
              { C::execution_sel_execute_call, 1 },
              { C::execution_sel_enter_call, 1 },
              { C::execution_context_id, 1 },
              { C::execution_next_context_id, 2 },
              { C::execution_bytecode_id, top_bytecode_id }, // Same as previous row (propagated)
              { C::execution_rop_4_, /*cd offset=*/10 },
              { C::execution_register_2_, /*contract address=*/0xdeadbeef },
              { C::execution_register_3_, /*cd size=*/1 },
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
              { C::execution_bytecode_id, nested_bytecode_id }, // New bytecode_id on entering new context
              { C::execution_parent_calldata_addr, 10 },
              { C::execution_parent_calldata_size, 1 },
          },
          // Exceptional Halt Row
          {
              { C::execution_sel, 1 },
              { C::execution_pc, 20 },
              { C::execution_next_pc, 30 },
              { C::execution_sel_execute_return, 1 },
              { C::execution_rop_0_, 500 },      // Return data size offset
              { C::execution_rop_1_, 600 },      // Return data offset
              { C::execution_register_0_, 200 }, // Return data size
              { C::execution_sel_exit_call, 1 },
              { C::execution_nested_exit_call, 1 },
              { C::execution_sel_error, 1 }, // Exceptional Halt
              { C::execution_context_id, 2 },
              { C::execution_next_context_id, 3 },
              { C::execution_parent_id, 1 },
              { C::execution_is_parent_id_inv, 1 },
              { C::execution_has_parent_ctx, 1 },
              { C::execution_contract_address, 0xdeadbeef },
              { C::execution_bytecode_id, nested_bytecode_id }, // Propagated within same context
              { C::execution_parent_calldata_addr, 10 },
              { C::execution_parent_calldata_size, 1 },
          },
          {
              { C::execution_sel, 1 },
              { C::execution_next_context_id, 3 },
              { C::execution_context_id, 1 },
              { C::execution_parent_id, 0 },
              { C::execution_last_child_id, 2 }, // Previous context id
              { C::execution_pc, 2 },            // Based on next_pc of CALL step
              { C::execution_next_pc, 3 },
              { C::execution_msg_sender, 0 },
              { C::execution_contract_address, 0 },
              { C::execution_bytecode_id, top_bytecode_id }, // Restored from context stack
              { C::execution_is_static, 0 },
              { C::execution_parent_calldata_addr, 0 },
              { C::execution_parent_calldata_size, 0 },
              { C::execution_last_child_returndata_size, 0 }, // Return data size reset
              { C::execution_last_child_returndata_addr, 0 }, // Return data offset reset
              { C::execution_parent_l2_gas_limit, 2000 },
              { C::execution_parent_da_gas_limit, 4000 },
              { C::execution_parent_l2_gas_used, 500 },
              { C::execution_parent_da_gas_used, 1500 },
          },
          {
              { C::execution_sel, 0 },
              { C::execution_last, 1 },
          } });

    check_relation<context>(trace);

    check_interaction<tracegen::ExecutionTraceBuilder,
                      lookup_context_ctx_stack_call_settings,
                      lookup_context_ctx_stack_rollback_settings,
                      lookup_context_ctx_stack_return_settings>(trace);
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

TEST(ContextConstrainingTest, TreeStateContinuity)
{
    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } },
                               {
                                   // First Row of execution
                                   { C::execution_sel, 1 },
                                   { C::execution_note_hash_tree_root, 10 },
                                   { C::execution_note_hash_tree_size, 9 },
                                   { C::execution_num_note_hashes_emitted, 8 },
                                   { C::execution_nullifier_tree_root, 7 },
                                   { C::execution_nullifier_tree_size, 6 },
                                   { C::execution_num_nullifiers_emitted, 5 },
                                   { C::execution_public_data_tree_root, 4 },
                                   { C::execution_public_data_tree_size, 3 },
                                   { C::execution_written_public_data_slots_tree_root, 2 },
                                   { C::execution_written_public_data_slots_tree_size, 1 },
                                   { C::execution_l1_l2_tree_root, 27 },
                                   { C::execution_retrieved_bytecodes_tree_root, 26 },
                                   { C::execution_retrieved_bytecodes_tree_size, 25 },
                               },
                               {
                                   // Second row of execution
                                   { C::execution_sel, 1 },
                                   { C::execution_prev_note_hash_tree_root, 10 },
                                   { C::execution_prev_note_hash_tree_size, 9 },
                                   { C::execution_prev_num_note_hashes_emitted, 8 },
                                   { C::execution_prev_nullifier_tree_root, 7 },
                                   { C::execution_prev_nullifier_tree_size, 6 },
                                   { C::execution_prev_num_nullifiers_emitted, 5 },
                                   { C::execution_prev_public_data_tree_root, 4 },
                                   { C::execution_prev_public_data_tree_size, 3 },
                                   { C::execution_prev_written_public_data_slots_tree_root, 2 },
                                   { C::execution_prev_written_public_data_slots_tree_size, 1 },
                                   { C::execution_l1_l2_tree_root, 27 },
                                   { C::execution_prev_retrieved_bytecodes_tree_root, 26 },
                                   { C::execution_prev_retrieved_bytecodes_tree_size, 25 },
                                   { C::execution_enqueued_call_end, 1 },
                                   { C::execution_sel_exit_call, 1 },
                               },
                               {
                                   // Third row of execution
                                   { C::execution_sel, 1 },
                                   { C::execution_prev_note_hash_tree_root, 100 },
                                   { C::execution_prev_note_hash_tree_size, 90 },
                                   { C::execution_prev_num_note_hashes_emitted, 80 },
                                   { C::execution_prev_nullifier_tree_root, 70 },
                                   { C::execution_prev_nullifier_tree_size, 60 },
                                   { C::execution_prev_num_nullifiers_emitted, 50 },
                                   { C::execution_prev_public_data_tree_root, 40 },
                                   { C::execution_prev_public_data_tree_size, 30 },
                                   { C::execution_prev_written_public_data_slots_tree_root, 20 },
                                   { C::execution_prev_written_public_data_slots_tree_size, 10 },
                                   { C::execution_l1_l2_tree_root, 27 },
                                   { C::execution_prev_retrieved_bytecodes_tree_root, 260 },
                                   { C::execution_prev_retrieved_bytecodes_tree_size, 250 },
                               } });

    check_relation<context>(trace,
                            context::SR_NOTE_HASH_TREE_ROOT_CONTINUITY,
                            context::SR_NOTE_HASH_TREE_SIZE_CONTINUITY,
                            context::SR_NUM_NOTE_HASHES_EMITTED_CONTINUITY,
                            context::SR_NULLIFIER_TREE_ROOT_CONTINUITY,
                            context::SR_NULLIFIER_TREE_SIZE_CONTINUITY,
                            context::SR_NUM_NULLIFIERS_EMITTED_CONTINUITY,
                            context::SR_PUBLIC_DATA_TREE_ROOT_CONTINUITY,
                            context::SR_PUBLIC_DATA_TREE_SIZE_CONTINUITY,
                            context::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_CONTINUITY,
                            context::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_CONTINUITY,
                            context::SR_L1_L2_TREE_ROOT_CONTINUITY,
                            context::SR_RETRIEVED_BYTECODES_TREE_ROOT_CONTINUITY,
                            context::SR_RETRIEVED_BYTECODES_TREE_SIZE_CONTINUITY);

    // Negative test: change note hash tree root
    trace.set(C::execution_prev_note_hash_tree_root, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_NOTE_HASH_TREE_ROOT_CONTINUITY),
                              "NOTE_HASH_TREE_ROOT_CONTINUITY");

    // Negative test: change note hash tree size
    trace.set(C::execution_prev_note_hash_tree_size, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_NOTE_HASH_TREE_SIZE_CONTINUITY),
                              "NOTE_HASH_TREE_SIZE_CONTINUITY");

    // Negative test: change num note hashes emitted
    trace.set(C::execution_prev_num_note_hashes_emitted, 2, 10);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_NUM_NOTE_HASHES_EMITTED_CONTINUITY),
                              "NUM_NOTE_HASHES_EMITTED_CONTINUITY");

    // Negative test: change nullifier tree root
    trace.set(C::execution_prev_nullifier_tree_root, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_NULLIFIER_TREE_ROOT_CONTINUITY),
                              "NULLIFIER_TREE_ROOT_CONTINUITY");

    // Negative test: change nullifier tree size
    trace.set(C::execution_prev_nullifier_tree_size, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_NULLIFIER_TREE_SIZE_CONTINUITY),
                              "NULLIFIER_TREE_SIZE_CONTINUITY");

    // Negative test: change num nullifiers emitted
    trace.set(C::execution_prev_num_nullifiers_emitted, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_NUM_NULLIFIERS_EMITTED_CONTINUITY),
                              "NUM_NULLIFIERS_EMITTED_CONTINUITY");

    // Negative test: change public data tree root
    trace.set(C::execution_prev_public_data_tree_root, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PUBLIC_DATA_TREE_ROOT_CONTINUITY),
                              "PUBLIC_DATA_TREE_ROOT_CONTINUITY");

    // Negative test: change public data tree size
    trace.set(C::execution_prev_public_data_tree_size, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_PUBLIC_DATA_TREE_SIZE_CONTINUITY),
                              "PUBLIC_DATA_TREE_SIZE_CONTINUITY");

    // Negative test: change written public data slots tree root
    trace.set(C::execution_prev_written_public_data_slots_tree_root, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<context>(trace, context::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_CONTINUITY),
        "WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_CONTINUITY");

    // Negative test: change written public data slots tree size
    trace.set(C::execution_prev_written_public_data_slots_tree_size, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<context>(trace, context::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_CONTINUITY),
        "WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_CONTINUITY");

    // Negative test: change l1 l2 tree root
    trace.set(C::execution_l1_l2_tree_root, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_L1_L2_TREE_ROOT_CONTINUITY),
                              "L1_L2_TREE_ROOT_CONTINUITY");

    // Negative test: change retrieved bytecodes tree root
    trace.set(C::execution_prev_retrieved_bytecodes_tree_root, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_RETRIEVED_BYTECODES_TREE_ROOT_CONTINUITY),
                              "RETRIEVED_BYTECODES_TREE_ROOT_CONTINUITY");

    // Negative test: change retrieved bytecodes tree size
    trace.set(C::execution_prev_retrieved_bytecodes_tree_size, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_RETRIEVED_BYTECODES_TREE_SIZE_CONTINUITY),
                              "RETRIEVED_BYTECODES_TREE_SIZE_CONTINUITY");
}

TEST(ContextConstrainingTest, SideEffectStateContinuity)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            // First Row of execution
            { C::execution_sel, 1 },
            { C::execution_num_unencrypted_log_fields, 10 },
            { C::execution_num_l2_to_l1_messages, 11 },
        },
        {
            // Second row of execution
            { C::execution_sel, 1 },
            { C::execution_prev_num_unencrypted_log_fields, 10 },
            { C::execution_prev_num_l2_to_l1_messages, 11 },
        },
    });

    check_relation<context>(
        trace, context::SR_NUM_UNENCRYPTED_LOGS_CONTINUITY, context::SR_NUM_L2_TO_L1_MESSAGES_CONTINUITY);

    // Negative test: change num unencrypted logs
    trace.set(C::execution_prev_num_unencrypted_log_fields, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_NUM_UNENCRYPTED_LOGS_CONTINUITY),
                              "NUM_UNENCRYPTED_LOGS_CONTINUITY");

    // Negative test: change num l2 to l1 messages
    trace.set(C::execution_prev_num_l2_to_l1_messages, 2, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_NUM_L2_TO_L1_MESSAGES_CONTINUITY),
                              "NUM_L2_TO_L1_MESSAGES_CONTINUITY");
}

TEST(ContextConstrainingTest, BytecodeIdPropagation)
{
    TestTraceContainer trace({ // First row - setup
                               {
                                   { C::precomputed_first_row, 1 },
                                   { C::execution_sel, 1 },
                                   { C::execution_context_id, 1 },
                                   { C::execution_next_context_id, 1 },
                                   { C::execution_bytecode_id, 42 }, // Initial bytecode_id
                               },
                               // Second row - should propagate bytecode_id
                               {
                                   { C::execution_sel, 1 },
                                   { C::execution_context_id, 1 },
                                   { C::execution_next_context_id, 1 },
                                   { C::execution_bytecode_id, 42 }, // Same bytecode_id (propagated)
                               } });

    check_relation<context>(trace);
    // mutate the bytecode_id and confirm that it is a violation
    trace.set(C::execution_bytecode_id, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_BYTECODE_ID_NEXT_ROW),
                              "BYTECODE_ID_NEXT_ROW"); // Should fail constraint
}

TEST(ContextConstrainingTest, IsStaticRegularCallFromNonStaticContext)
{
    // Non-static context making a regular CALL - should remain non-static
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 1 },
            { C::execution_next_context_id, 2 },
            { C::execution_is_static, 0 }, // Non-static context
            { C::execution_sel_enter_call, 1 },
            { C::execution_sel_execute_call, 1 }, // Regular CALL
            { C::execution_sel_execute_static_call, 0 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 2 },
            { C::execution_next_context_id, 3 },
            { C::execution_is_static, 0 }, // Should remain non-static
        },
    });
    check_relation<context>(
        trace, context::SR_IS_STATIC_IF_STATIC_CALL, context::SR_IS_STATIC_IF_CALL_FROM_STATIC_CONTEXT);

    // Negative test: change is_static
    // regular call from non-static context cannot become static
    trace.set(C::execution_is_static, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_IS_STATIC_IF_STATIC_CALL),
                              "IS_STATIC_IF_STATIC_CALL");

    // reset is_static
    trace.set(C::execution_is_static, 2, 0);
}

TEST(ContextConstrainingTest, IsStaticStaticCallFromNonStaticContext)
{
    // Non-static context making a STATICCALL - should become static
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 1 },
            { C::execution_next_context_id, 2 },
            { C::execution_is_static, 0 }, // Non-static context
            { C::execution_sel_enter_call, 1 },
            { C::execution_sel_execute_call, 0 },
            { C::execution_sel_execute_static_call, 1 }, // STATICCALL
        },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 2 },
            { C::execution_next_context_id, 3 },
            { C::execution_is_static, 1 }, // Should become static
        },
    });
    check_relation<context>(
        trace, context::SR_IS_STATIC_IF_STATIC_CALL, context::SR_IS_STATIC_IF_CALL_FROM_STATIC_CONTEXT);

    // Negative test: change is_static
    // static call from non-static context MUST become static
    trace.set(C::execution_is_static, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_IS_STATIC_IF_STATIC_CALL),
                              "IS_STATIC_IF_STATIC_CALL");

    // reset is_static
    trace.set(C::execution_is_static, 2, 1);
}

TEST(ContextConstrainingTest, IsStaticCallFromStaticContext)
{
    // Static context making any call - must remain static
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 1 },
            { C::execution_next_context_id, 2 },
            { C::execution_is_static, 1 }, // Static context
            { C::execution_sel_enter_call, 1 },
            { C::execution_sel_execute_call, 1 }, // Regular CALL
            { C::execution_sel_execute_static_call, 0 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 2 },
            { C::execution_next_context_id, 3 },
            { C::execution_is_static, 1 }, // Must remain static
        },
    });
    check_relation<context>(
        trace, context::SR_IS_STATIC_IF_STATIC_CALL, context::SR_IS_STATIC_IF_CALL_FROM_STATIC_CONTEXT);

    // Negative test: change is_static
    // static call from static context MUST remain static
    trace.set(C::execution_is_static, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_IS_STATIC_IF_CALL_FROM_STATIC_CONTEXT),
                              "IS_STATIC_IF_CALL_FROM_STATIC_CONTEXT");

    // reset is_static
    trace.set(C::execution_is_static, 2, 1);
}

TEST(ContextConstrainingTest, IsStaticPropagationWithoutCalls)
{
    // is_static propagation without calls
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 1 },
            { C::execution_next_context_id, 1 },
            { C::execution_is_static, 1 }, // Static context
        },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 1 },
            { C::execution_next_context_id, 1 },
            { C::execution_is_static, 1 }, // Should propagate
        },
    });
    check_relation<context>(trace, context::SR_IS_STATIC_NEXT_ROW);

    // Negative test: change is_static
    // staticness must propagate without calls
    trace.set(C::execution_is_static, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_IS_STATIC_NEXT_ROW), "IS_STATIC_NEXT_ROW");

    // reset is_static
    trace.set(C::execution_is_static, 2, 1);
}

TEST(ContextConstrainingTest, ContextIdPropagation)
{
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_enqueued_call_start, 1 },
            { C::execution_context_id, 1 },
            { C::execution_next_context_id, 2 },
            { C::execution_sel_enter_call, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 2 },
            { C::execution_next_context_id, 3 },
            { C::execution_sel_exit_call, 1 },
            { C::execution_nested_exit_call, 1 },
            { C::execution_parent_id, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 1 },
            { C::execution_next_context_id, 3 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_context_id, 1 },
            { C::execution_next_context_id, 3 },
        },
    });
    check_relation<context>(trace,
                            context::SR_ENQUEUED_CALL_START_NEXT_CTX_ID,
                            context::SR_INCR_NEXT_CONTEXT_ID,
                            context::SR_CONTEXT_ID_NEXT_ROW,
                            context::SR_CONTEXT_ID_EXT_CALL,
                            context::SR_CONTEXT_ID_NESTED_EXIT);

    // Negative test: next context id should be context id + 1 on enqueued call start
    trace.set(C::execution_next_context_id, 1, 3);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_ENQUEUED_CALL_START_NEXT_CTX_ID),
                              "ENQUEUED_CALL_START_NEXT_CTX_ID");
    trace.set(C::execution_next_context_id, 1, 2);

    // Negative test: next context id should increase on external call
    trace.set(C::execution_next_context_id, 2, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_INCR_NEXT_CONTEXT_ID), "INCR_NEXT_CONTEXT_ID");
    trace.set(C::execution_next_context_id, 2, 3);

    // Negative test: next context id should be propagated
    trace.set(C::execution_next_context_id, 4, 4);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_INCR_NEXT_CONTEXT_ID), "INCR_NEXT_CONTEXT_ID");
    trace.set(C::execution_next_context_id, 4, 3);

    // Negative test: context id should be propagated
    trace.set(C::execution_context_id, 4, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_CONTEXT_ID_NEXT_ROW), "CONTEXT_ID_NEXT_ROW");
    trace.set(C::execution_context_id, 4, 1);

    // Negative test: context id should be next context id when entering call
    trace.set(C::execution_context_id, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_CONTEXT_ID_EXT_CALL), "CONTEXT_ID_EXT_CALL");
    trace.set(C::execution_context_id, 2, 2);

    // Negative test: context id should be restored on exit
    trace.set(C::execution_context_id, 3, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<context>(trace, context::SR_CONTEXT_ID_NESTED_EXIT),
                              "CONTEXT_ID_NESTED_EXIT");
    trace.set(C::execution_context_id, 3, 1);
}

} // namespace
} // namespace bb::avm2::constraining
