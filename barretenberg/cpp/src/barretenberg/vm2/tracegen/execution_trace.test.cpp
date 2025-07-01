#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using simulation::ExecutionEvent;

using ::bb::avm2::testing::InstructionBuilder;
using enum ::bb::avm2::WireOpCode;

using ::testing::AllOf;
using ::testing::ElementsAre;

// Helper functions for creating common execution events

// Base helper to set up common event fields
ExecutionEvent create_base_event(const simulation::Instruction& instruction,
                                 uint32_t context_id,
                                 uint32_t parent_id,
                                 TransactionPhase phase)
{
    ExecutionEvent ex_event;
    ex_event.addressing_event.instruction = instruction;
    ex_event.wire_instruction = instruction;
    ex_event.after_context_event.id = context_id;
    ex_event.after_context_event.parent_id = parent_id;
    ex_event.after_context_event.phase = phase;
    ex_event.before_context_event = ex_event.after_context_event;
    return ex_event;
}

ExecutionEvent create_add_event(uint32_t context_id, uint32_t parent_id, TransactionPhase phase)
{
    const auto add_instr =
        InstructionBuilder(WireOpCode::ADD_8).operand<uint8_t>(0).operand<uint8_t>(0).operand<uint8_t>(0).build();
    auto ex_event = create_base_event(add_instr, context_id, parent_id, phase);
    ex_event.inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) };
    ex_event.output = { TaggedValue::from_tag(ValueTag::U16, 8) };
    return ex_event;
}

ExecutionEvent create_call_event(uint32_t context_id,
                                 uint32_t parent_id,
                                 TransactionPhase phase,
                                 uint32_t next_context_id)
{
    const auto call_instr = InstructionBuilder(WireOpCode::CALL)
                                .operand<uint8_t>(2)
                                .operand<uint8_t>(4)
                                .operand<uint8_t>(6)
                                .operand<uint8_t>(10)
                                .operand<uint8_t>(20)
                                .build();
    auto ex_event = create_base_event(call_instr, context_id, parent_id, phase);
    ex_event.next_context_id = next_context_id;
    ex_event.inputs = { /*allocated_l2_gas_read=*/MemoryValue::from<uint32_t>(10),
                        /*allocated_da_gas_read=*/MemoryValue ::from<uint32_t>(11),
                        /*contract_address=*/MemoryValue::from<uint32_t>(0xdeadbeef) };
    return ex_event;
}

ExecutionEvent create_return_event(uint32_t context_id, uint32_t parent_id, TransactionPhase phase)
{
    const auto return_instr = InstructionBuilder(WireOpCode::RETURN).operand<uint8_t>(0).operand<uint8_t>(0).build();
    auto ex_event = create_base_event(return_instr, context_id, parent_id, phase);
    ex_event.inputs = { /*rd_size=*/MemoryValue::from<uint32_t>(2) };
    return ex_event;
}

ExecutionEvent create_error_event(uint32_t context_id,
                                  uint32_t parent_id,
                                  TransactionPhase phase,
                                  uint32_t next_context_id)
{
    // Actually an ADD instruction with exception=true
    const auto add_instr =
        InstructionBuilder(WireOpCode::ADD_8).operand<uint8_t>(0).operand<uint8_t>(0).operand<uint8_t>(0).build();
    auto ex_event = create_base_event(add_instr, context_id, parent_id, phase);
    ex_event.error =
        simulation::ExecutionError::INSTRUCTION_FETCHING; // This should trigger error behavior (like discard)
    ex_event.next_context_id = next_context_id;           // Return to parent
    // inputs and output are not used for error events
    ex_event.inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) };
    ex_event.output = { TaggedValue::from_tag(ValueTag::U16, 8) };
    return ex_event;
}

TEST(ExecutionTraceGenTest, RegisterAllocation)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Some inputs
    // Use the instruction builder - we can make the operands more complex
    const auto instr = InstructionBuilder(WireOpCode::ADD_8)
                           // All operands are direct - for simplicity
                           .operand<uint8_t>(0)
                           .operand<uint8_t>(0)
                           .operand<uint8_t>(0)
                           .build();

    ExecutionEvent ex_event = {
        .wire_instruction = instr,
        .inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) },
        .output = { TaggedValue::from_tag(ValueTag::U16, 8) },
        .addressing_event = { .instruction = instr },
    };

    builder.process({ ex_event }, trace);

    // todo: Test doesnt check the other register fields are zeroed out.
    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // First real row
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_sel_alu, 1),
                          ROW_FIELD_EQ(execution_register_0_, 5),
                          ROW_FIELD_EQ(execution_register_1_, 3),
                          ROW_FIELD_EQ(execution_register_2_, 8),
                          ROW_FIELD_EQ(execution_mem_tag_reg_0_, static_cast<uint8_t>(ValueTag::U16)),
                          ROW_FIELD_EQ(execution_mem_tag_reg_1_, static_cast<uint8_t>(ValueTag::U16)),
                          ROW_FIELD_EQ(execution_mem_tag_reg_2_, static_cast<uint8_t>(ValueTag::U16)),
                          ROW_FIELD_EQ(execution_sel_mem_op_reg_0_, 1),
                          ROW_FIELD_EQ(execution_sel_mem_op_reg_1_, 1),
                          ROW_FIELD_EQ(execution_sel_mem_op_reg_2_, 1),
                          ROW_FIELD_EQ(execution_rw_reg_0_, 0),
                          ROW_FIELD_EQ(execution_rw_reg_1_, 0),
                          ROW_FIELD_EQ(execution_rw_reg_2_, 1))));
}

TEST(ExecutionTraceGenTest, Call)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Inputs
    const auto call_instr = InstructionBuilder(WireOpCode::CALL)
                                .operand<uint8_t>(2)
                                .operand<uint8_t>(4)
                                .operand<uint8_t>(6)
                                .operand<uint8_t>(10)
                                .operand<uint8_t>(20)
                                .build();

    Gas allocated_gas = { .l2Gas = 100, .daGas = 200 };
    Gas gas_limit = { .l2Gas = 1000, .daGas = 2000 };
    Gas gas_used = { .l2Gas = 500, .daGas = 1900 };
    Gas gas_left = gas_limit - gas_used;

    ExecutionEvent ex_event = {
        .wire_instruction = call_instr,
        .inputs = { /*allocated_l2_gas_read=*/MemoryValue::from<uint32_t>(allocated_gas.l2Gas),
                    /*allocated_da_gas_read=*/MemoryValue ::from<uint32_t>(allocated_gas.daGas),
                    /*contract_address=*/MemoryValue::from<FF>(0xdeadbeef) },
        .next_context_id = 2,
        .addressing_event = { .instruction = call_instr,
                              .resolution_info = {
                                { .after_relative = MemoryValue::from<uint32_t>(0),
                                  .resolved_operand = MemoryValue::from<uint32_t>(0),
                                  },
                                  { .after_relative = MemoryValue::from<uint32_t>(0),
                                  .resolved_operand = MemoryValue::from<uint32_t>(0),
                                  },
                                  { .after_relative = MemoryValue::from<uint32_t>(0),
                                    .resolved_operand = MemoryValue::from<uint32_t>(0) },
                                    { .after_relative = MemoryValue::from<uint32_t>(0),
                                    .resolved_operand = MemoryValue::from<uint32_t>(10) },
                                  { .after_relative = MemoryValue::from<uint32_t>(0),
                                    .resolved_operand = MemoryValue::from<uint32_t>(20) },
                              } },
        .after_context_event = {
            .id = 1,
            .contract_addr = 0xdeadbeef,
            .gas_used = gas_used,
            .gas_limit = gas_limit,
        },
    };

    builder.process({ ex_event }, trace);
    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            // First row is empty
            AllOf(ROW_FIELD_EQ(execution_sel, 0)),
            // First real row
            AllOf(ROW_FIELD_EQ(execution_sel, 1),
                  ROW_FIELD_EQ(execution_sel_call, 1),
                  ROW_FIELD_EQ(execution_sel_enter_call, 1),
                  ROW_FIELD_EQ(execution_rop_3_, 10),
                  ROW_FIELD_EQ(execution_rop_4_, 20),
                  ROW_FIELD_EQ(execution_register_0_, allocated_gas.l2Gas),
                  ROW_FIELD_EQ(execution_register_1_, allocated_gas.daGas),
                  ROW_FIELD_EQ(execution_register_2_, 0xdeadbeef),
                  ROW_FIELD_EQ(execution_mem_tag_reg_0_, static_cast<uint8_t>(ValueTag::U32)),
                  ROW_FIELD_EQ(execution_mem_tag_reg_1_, static_cast<uint8_t>(ValueTag::U32)),
                  ROW_FIELD_EQ(execution_mem_tag_reg_2_, static_cast<uint8_t>(ValueTag::FF)),
                  ROW_FIELD_EQ(execution_sel_mem_op_reg_0_, 1),
                  ROW_FIELD_EQ(execution_sel_mem_op_reg_1_, 1),
                  ROW_FIELD_EQ(execution_sel_mem_op_reg_2_, 1),
                  ROW_FIELD_EQ(execution_rw_reg_0_, 0),
                  ROW_FIELD_EQ(execution_rw_reg_1_, 0),
                  ROW_FIELD_EQ(execution_rw_reg_2_, 0),
                  ROW_FIELD_EQ(execution_is_static, 0),
                  ROW_FIELD_EQ(execution_context_id, 1),
                  ROW_FIELD_EQ(execution_next_context_id, 2),
                  ROW_FIELD_EQ(execution_constant_32, 32),
                  ROW_FIELD_EQ(execution_call_is_l2_gas_allocated_lt_left, true),
                  ROW_FIELD_EQ(execution_call_allocated_left_l2_cmp_diff, gas_left.l2Gas - allocated_gas.l2Gas - 1),
                  ROW_FIELD_EQ(execution_call_is_da_gas_allocated_lt_left, false),
                  ROW_FIELD_EQ(execution_call_allocated_left_da_cmp_diff, allocated_gas.daGas - gas_left.daGas))));
}

TEST(ExecutionTraceGenTest, Return)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Inputs
    const auto return_instr = InstructionBuilder(WireOpCode::RETURN).operand<uint8_t>(4).operand<uint8_t>(20).build();

    ExecutionEvent ex_event = {
        .wire_instruction = return_instr,
        .inputs = { /*rd_size=*/MemoryValue::from<uint32_t>(2) },
        .next_context_id = 2,
        .addressing_event = { .instruction = return_instr,
                              .resolution_info = {
                                /*rd_size_offset=*/{ .after_relative = MemoryValue::from<uint32_t>(0),
                                  .resolved_operand = MemoryValue::from<uint32_t>(4),
                                  },
                                  /*rd_offset=*/{ .after_relative = MemoryValue::from<uint32_t>(0),
                                  .resolved_operand = MemoryValue::from<uint32_t>(5),
                                  },
                              } },
        .after_context_event = {
            .id = 1,
            .contract_addr = 0xdeadbeef,
        },
    };

    builder.process({ ex_event }, trace);
    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // First real row
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_sel_return, 1),
                          ROW_FIELD_EQ(execution_sel_exit_call, 1),
                          ROW_FIELD_EQ(execution_rop_0_, 4),
                          ROW_FIELD_EQ(execution_rop_1_, 5),
                          ROW_FIELD_EQ(execution_register_0_, /*rd_size*/ 2),
                          ROW_FIELD_EQ(execution_mem_tag_reg_0_, static_cast<uint8_t>(ValueTag::U32)),
                          ROW_FIELD_EQ(execution_sel_mem_op_reg_0_, 1),
                          ROW_FIELD_EQ(execution_rw_reg_0_, 0),
                          ROW_FIELD_EQ(execution_is_static, 0),
                          ROW_FIELD_EQ(execution_context_id, 1),
                          ROW_FIELD_EQ(execution_next_context_id, 2))));
}

TEST(ExecutionTraceGenTest, Gas)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Use the instruction builder - we can make the operands more complex
    const auto instr = InstructionBuilder(WireOpCode::ADD_8)
                           // All operands are direct - for simplicity
                           .operand<uint8_t>(0)
                           .operand<uint8_t>(0)
                           .operand<uint8_t>(0)
                           .build();

    ExecutionEvent ex_event = {
        .wire_instruction = instr,
        .inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) },
        .output = { TaggedValue::from_tag(ValueTag::U16, 8) },
        .addressing_event = { .instruction = instr },
    };

    const auto& exec_instruction_spec = EXEC_INSTRUCTION_SPEC.at(instr.get_exec_opcode());

    const uint32_t addressing_gas = 50;
    const uint32_t opcode_gas = exec_instruction_spec.gas_cost.opcode_gas;
    const uint32_t dynamic_l2_gas = exec_instruction_spec.gas_cost.dyn_l2;
    const uint32_t dynamic_da_gas = exec_instruction_spec.gas_cost.dyn_da;
    const uint32_t base_da_gas = exec_instruction_spec.gas_cost.base_da;

    Gas gas_limit = { .l2Gas = 110149, .daGas = 100000 };
    Gas prev_gas_used = { .l2Gas = 100000, .daGas = 70000 };

    ex_event.after_context_event.gas_limit = gas_limit; // Will OOG on l2 after dynamic gas
    ex_event.before_context_event.gas_used = prev_gas_used;
    ex_event.gas_event.addressing_gas = addressing_gas;
    ex_event.gas_event.dynamic_gas_factor = { .l2Gas = 2, .daGas = 1 };
    ex_event.gas_event.oog_base_l2 = false;
    ex_event.gas_event.oog_base_da = false;
    ex_event.gas_event.oog_dynamic_l2 = true;
    ex_event.gas_event.oog_dynamic_da = false;
    ex_event.gas_event.limit_used_l2_comparison_witness = 0;
    ex_event.gas_event.limit_used_da_comparison_witness =
        gas_limit.daGas - prev_gas_used.daGas - base_da_gas - dynamic_da_gas * 1;

    builder.process({ ex_event }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // First real row
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_opcode_gas, opcode_gas),
                          ROW_FIELD_EQ(execution_addressing_gas, addressing_gas),
                          ROW_FIELD_EQ(execution_base_da_gas, base_da_gas),
                          ROW_FIELD_EQ(execution_out_of_gas_base_l2, false),
                          ROW_FIELD_EQ(execution_out_of_gas_base_da, false),
                          ROW_FIELD_EQ(execution_out_of_gas_base, false),
                          ROW_FIELD_EQ(execution_prev_l2_gas_used, 100000),
                          ROW_FIELD_EQ(execution_prev_da_gas_used, 70000),
                          ROW_FIELD_EQ(execution_should_run_dyn_gas_check, true),
                          ROW_FIELD_EQ(execution_dynamic_l2_gas_factor, 2),
                          ROW_FIELD_EQ(execution_dynamic_da_gas_factor, 1),
                          ROW_FIELD_EQ(execution_dynamic_l2_gas, dynamic_l2_gas),
                          ROW_FIELD_EQ(execution_dynamic_da_gas, dynamic_da_gas),
                          ROW_FIELD_EQ(execution_out_of_gas_dynamic_l2, true),
                          ROW_FIELD_EQ(execution_out_of_gas_dynamic_da, false),
                          ROW_FIELD_EQ(execution_out_of_gas_dynamic, true),
                          ROW_FIELD_EQ(execution_limit_used_l2_cmp_diff, 0),
                          ROW_FIELD_EQ(execution_limit_used_da_cmp_diff,
                                       ex_event.gas_event.limit_used_da_comparison_witness))));
}

TEST(ExecutionTraceGenTest, DiscardNestedFailContext)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Create a sequence: parent context calls child context, child does some work then fails
    std::vector<ExecutionEvent> events = {
        // Event 1: Parent context does ADD
        create_add_event(1, 0, TransactionPhase::APP_LOGIC),

        // Event 2: Parent calls child (context 1 -> 2)
        create_call_event(1, 0, TransactionPhase::APP_LOGIC, 2),

        // Event 3: Child context does ADD - this should have discard=1 since child will fail
        create_add_event(2, 1, TransactionPhase::APP_LOGIC),

        // Event 4: Child context fails
        create_error_event(2, 1, TransactionPhase::APP_LOGIC, 1),

        // Event 5: Parent continues after child fails
        create_add_event(1, 0, TransactionPhase::APP_LOGIC),

        // Event 6: Parent returns successfully (top-level exit)
        create_return_event(1, 0, TransactionPhase::APP_LOGIC),
    };

    builder.process(events, trace);

    const auto rows = trace.as_rows();

    ASSERT_EQ(rows.size(), 7);

    // Row 1: Parent ADD before call - no discard
    EXPECT_EQ(rows[1].execution_discard, 0);
    EXPECT_EQ(rows[1].execution_dying_context_id, 0);
    EXPECT_EQ(rows[1].execution_is_dying_context, 0);

    // Row 2: Parent CALL - no discard yet (discard is set for the NEXT event)
    EXPECT_EQ(rows[2].execution_discard, 0);
    EXPECT_EQ(rows[2].execution_dying_context_id, 0);
    EXPECT_EQ(rows[2].execution_is_dying_context, 0);

    // Row 3: Child ADD - should have discard=1, dying_context_id=2
    EXPECT_EQ(rows[3].execution_discard, 1);
    EXPECT_EQ(rows[3].execution_dying_context_id, 2);
    EXPECT_EQ(rows[3].execution_is_dying_context, 1);

    // Row 4: Child fail - should still have discard=1, dying_context_id=2
    EXPECT_EQ(rows[4].execution_discard, 1);
    EXPECT_EQ(rows[4].execution_dying_context_id, 2);
    EXPECT_EQ(rows[4].execution_is_dying_context, 1);
    EXPECT_EQ(rows[4].execution_sel_error, 1);        // failure
    EXPECT_EQ(rows[4].execution_rollback_context, 1); // Has parent, so rollback

    // Row 5: Parent continues - discard should be reset to 0
    EXPECT_EQ(rows[5].execution_discard, 0);
    EXPECT_EQ(rows[5].execution_dying_context_id, 0);
    EXPECT_EQ(rows[5].execution_is_dying_context, 0);

    // Row 6: Parent returns - no discard
    EXPECT_EQ(rows[6].execution_discard, 0);
    EXPECT_EQ(rows[6].execution_dying_context_id, 0);
    EXPECT_EQ(rows[6].execution_is_dying_context, 0);
}

TEST(ExecutionTraceGenTest, DiscardAppLogicDueToTeardownError)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Create a sequence that has app logic success but teardown failure, which should discard app logic too
    std::vector<ExecutionEvent> events = {
        // Event 1: App logic phase - successful ADD
        create_add_event(1, 0, TransactionPhase::APP_LOGIC),

        // Event 2: App logic phase - successful RETURN (exits app logic phase)
        create_return_event(1, 0, TransactionPhase::APP_LOGIC),

        // Event 3: Teardown phase - some operation
        create_add_event(2, 0, TransactionPhase::TEARDOWN),

        // Event 4: Teardown phase - failure (that exits teardown)
        create_error_event(2, 0, TransactionPhase::TEARDOWN, 0),
    };

    builder.process(events, trace);

    const auto rows = trace.as_rows();

    ASSERT_EQ(rows.size(), 5);

    // Row 1: App logic ADD - should have discard=1 because teardown will error
    EXPECT_EQ(rows[1].execution_discard, 1);
    EXPECT_EQ(rows[1].execution_dying_context_id, 2); // Teardown context id
    EXPECT_EQ(rows[1].execution_is_dying_context, 0); // Not the dying context itself

    // Row 2: App logic RETURN - should have discard=1 because teardown will error
    EXPECT_EQ(rows[2].execution_discard, 1);
    EXPECT_EQ(rows[2].execution_dying_context_id, 2);
    EXPECT_EQ(rows[2].execution_is_dying_context, 0);

    // Row 3: Teardown ADD - should have discard=1
    EXPECT_EQ(rows[3].execution_discard, 1);
    EXPECT_EQ(rows[3].execution_dying_context_id, 2);
    EXPECT_EQ(rows[3].execution_is_dying_context, 1); // This IS the dying context

    // Row 4: Teardown failure - should have discard=1
    EXPECT_EQ(rows[4].execution_discard, 1);
    EXPECT_EQ(rows[4].execution_dying_context_id, 2);
    EXPECT_EQ(rows[4].execution_is_dying_context, 1);
    EXPECT_EQ(rows[4].execution_sel_error, 1);
    EXPECT_EQ(rows[4].execution_rollback_context, 0); // No parent, so no rollback
}

TEST(ExecutionTraceGenTest, DiscardAppLogicDueToSecondEnqueuedCallError)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Create a sequence with two enqueued calls where the second one errors
    // This should cause the app logic from the first call to be discarded
    std::vector<ExecutionEvent> events = {
        // First enqueued call
        // Event 1: First call's app logic - successful ADD
        create_add_event(1, 0, TransactionPhase::APP_LOGIC),
        // Event 2: First call's app logic - successful RETURN (exits first call)
        create_return_event(1, 0, TransactionPhase::APP_LOGIC),

        // Second enqueued call
        // Event 3: Second call's app logic - ADD operation
        create_add_event(2, 0, TransactionPhase::APP_LOGIC),
        // Event 4: Second call's app logic - ERROR (causes second enqueued call to fail)
        create_error_event(2, 0, TransactionPhase::APP_LOGIC, 0),
    };

    builder.process(events, trace);

    const auto rows = trace.as_rows();

    ASSERT_EQ(rows.size(), 5);

    // Row 1: First call's ADD - should have discard=1 because second call will error
    EXPECT_EQ(rows[1].execution_discard, 1);
    EXPECT_EQ(rows[1].execution_dying_context_id, 2); // Second call's context id
    EXPECT_EQ(rows[1].execution_is_dying_context, 0); // Not the dying context itself

    // Row 2: First call's RETURN - should have discard=1 because second call will error
    EXPECT_EQ(rows[2].execution_discard, 1);
    EXPECT_EQ(rows[2].execution_dying_context_id, 2);
    EXPECT_EQ(rows[2].execution_is_dying_context, 0);

    // Row 3: Second call's ADD - should have discard=1
    EXPECT_EQ(rows[3].execution_discard, 1);
    EXPECT_EQ(rows[3].execution_dying_context_id, 2);
    EXPECT_EQ(rows[3].execution_is_dying_context, 1); // This IS the dying context

    // Row 4: Second call's ERROR - should have discard=1
    EXPECT_EQ(rows[4].execution_discard, 1);
    EXPECT_EQ(rows[4].execution_dying_context_id, 2);
    EXPECT_EQ(rows[4].execution_is_dying_context, 1);
    EXPECT_EQ(rows[4].execution_sel_error, 1);
    EXPECT_EQ(rows[4].execution_rollback_context, 0); // No parent, so no rollback
}

TEST(ExecutionTraceGenTest, InternalCall)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;
    // Use the instruction builder - we can make the operands more complex
    const auto instr = InstructionBuilder(WireOpCode::INTERNALCALL)
                           // All operands are direct - for simplicity
                           .operand<uint32_t>(10)
                           .build();

    ExecutionEvent ex_event = {
        .wire_instruction = instr,
        .addressing_event = {
            .instruction = instr,
            .resolution_info = {
                {
                  .resolved_operand = MemoryValue::from<uint32_t>(10) },
            },
        },
        .before_context_event {
        .internal_call_id = 1,
        .internal_call_return_id = 0,
        .next_internal_call_id = 2,
        }
    };

    builder.process({ ex_event }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // Second row is the internal call
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_sel_internal_call, 1),
                          ROW_FIELD_EQ(execution_next_internal_call_id, 2),
                          ROW_FIELD_EQ(execution_internal_call_id, 1),
                          ROW_FIELD_EQ(execution_internal_call_return_id, 0),
                          ROW_FIELD_EQ(execution_rop_0_, 10))));
}

TEST(ExecutionTraceGenTest, InternalRetError)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;
    // Use the instruction builder - we can make the operands more complex
    const auto instr = InstructionBuilder(WireOpCode::INTERNALRETURN).build();

    simulation::ExecutionEvent ex_event = {
        .error = simulation::ExecutionError::DISPATCHING,
        .wire_instruction = instr,
        .addressing_event = {
            .instruction = instr,
        },
        .before_context_event {
        .internal_call_id = 1,
        .internal_call_return_id = 0,
        .next_internal_call_id = 2,
        }
    };

    builder.process({ ex_event }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // Second row is the internal call
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_sel_internal_return, 1),
                          ROW_FIELD_EQ(execution_next_internal_call_id, 2),
                          ROW_FIELD_EQ(execution_internal_call_id, 1),
                          ROW_FIELD_EQ(execution_internal_call_return_id, 0),
                          ROW_FIELD_EQ(execution_sel_opcode_error, 1),
                          ROW_FIELD_EQ(execution_internal_call_return_id_inv, 0))));
}

TEST(ExecutionTraceGenTest, Jump)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    const auto instr = InstructionBuilder(WireOpCode::JUMP_32)
                           .operand<uint32_t>(120) // Immediate operand
                           .build();

    ExecutionEvent ex_event_jump = {
        .wire_instruction = instr,
        .addressing_event = { .instruction = instr,
                              .resolution_info = { {
                                  .resolved_operand = MemoryValue::from<uint32_t>(120),
                              } } },
    };

    builder.process({ ex_event_jump }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // Second row is the jump
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_sel_jump, 1),
                          ROW_FIELD_EQ(execution_rop_0_, 120),
                          ROW_FIELD_EQ(execution_subtrace_operation_id, AVM_EXEC_OP_ID_JUMP))));
}

TEST(ExecutionTraceGenTest, JumpI)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    const auto instr = InstructionBuilder(WireOpCode::JUMPI_32)
                           .operand<uint16_t>(654)  // Condition Offset
                           .operand<uint32_t>(9876) // Immediate operand
                           .build();

    ExecutionEvent ex_event_jumpi = {
        .wire_instruction = instr,
        .inputs = { MemoryValue::from<uint1_t>(1) }, // Conditional value
        .addressing_event = { .instruction = instr,
                              .resolution_info = { {
                                                       .resolved_operand = MemoryValue::from<uint32_t>(654),
                                                   },
                                                   {
                                                       .resolved_operand = MemoryValue::from<uint32_t>(9876),
                                                   } } },
    };

    builder.process({ ex_event_jumpi }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // Second row is the jumpi
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_sel_jumpi, 1),
                          ROW_FIELD_EQ(execution_rop_0_, 654),
                          ROW_FIELD_EQ(execution_rop_1_, 9876),
                          ROW_FIELD_EQ(execution_register_0_, 1),
                          ROW_FIELD_EQ(execution_mem_tag_reg_0_, static_cast<uint8_t>(ValueTag::U1)),
                          ROW_FIELD_EQ(execution_expected_tag_reg_0_, static_cast<uint8_t>(ValueTag::U1)),
                          ROW_FIELD_EQ(execution_sel_tag_check_reg_0_, 1),
                          ROW_FIELD_EQ(execution_sel_should_read_registers, 1),
                          ROW_FIELD_EQ(execution_sel_register_read_error, 0),
                          ROW_FIELD_EQ(execution_subtrace_operation_id, AVM_EXEC_OP_ID_JUMPI))));
}

TEST(ExecutionTraceGenTest, JumpiWrongTag)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    const auto instr = InstructionBuilder(WireOpCode::JUMPI_32)
                           .operand<uint16_t>(654)  // Condition Offset
                           .operand<uint32_t>(9876) // Immediate operand
                           .build();

    ExecutionEvent ex_event_jumpi = {
        .wire_instruction = instr,
        .inputs = { MemoryValue::from<uint8_t>(1) }, // Conditional value with tag != U1
        .addressing_event = { .instruction = instr,
                              .resolution_info = { {
                                                       .resolved_operand = MemoryValue::from<uint32_t>(654),
                                                   },
                                                   {
                                                       .resolved_operand = MemoryValue::from<uint32_t>(9876),
                                                   } } },
    };

    builder.process({ ex_event_jumpi }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // Second row is the jumpi
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_sel_jumpi, 1),
                          ROW_FIELD_EQ(execution_rop_0_, 654),
                          ROW_FIELD_EQ(execution_rop_1_, 9876),
                          ROW_FIELD_EQ(execution_register_0_, 1),
                          ROW_FIELD_EQ(execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U8)),
                          ROW_FIELD_EQ(execution_expected_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U1)),
                          ROW_FIELD_EQ(execution_sel_tag_check_reg_0_, 1),
                          ROW_FIELD_EQ(execution_sel_should_read_registers, 1),
                          ROW_FIELD_EQ(execution_batched_tags_diff_inv_reg,
                                       1), // (2**0  * (mem_tag_reg[0] - expected_tag_reg[0]))^-1 = 1
                          ROW_FIELD_EQ(execution_sel_register_read_error, 1),
                          ROW_FIELD_EQ(execution_subtrace_operation_id, AVM_EXEC_OP_ID_JUMPI))));
}

TEST(ExecutionTraceGenTest, Mov16)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    const auto instr = InstructionBuilder(WireOpCode::MOV_16)
                           .operand<uint32_t>(1000) // srcOffset
                           .operand<uint32_t>(1001) // dstOffset
                           .build();

    ExecutionEvent ex_event_mov = {
        .wire_instruction = instr,
        .inputs = { MemoryValue::from<uint128_t>(100) }, // src value
        .output = MemoryValue::from<uint128_t>(100),     // dst value
        .addressing_event = { .instruction = instr,
                              .resolution_info = { {
                                                       .resolved_operand = MemoryValue::from<uint32_t>(1000),
                                                   },
                                                   {
                                                       .resolved_operand = MemoryValue::from<uint32_t>(1001),
                                                   } } },
    };

    builder.process({ ex_event_mov }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // Second row is the mov
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_sel_mov, 1),
                          ROW_FIELD_EQ(execution_rop_0_, 1000),
                          ROW_FIELD_EQ(execution_rop_1_, 1001),
                          ROW_FIELD_EQ(execution_register_0_, 100),
                          ROW_FIELD_EQ(execution_register_1_, 100),
                          ROW_FIELD_EQ(execution_sel_mem_op_reg_0_, 1),
                          ROW_FIELD_EQ(execution_sel_mem_op_reg_1_, 1),
                          ROW_FIELD_EQ(execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U128)),
                          ROW_FIELD_EQ(execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U128)),
                          ROW_FIELD_EQ(execution_rw_reg_0_, 0),
                          ROW_FIELD_EQ(execution_rw_reg_1_, 1),
                          ROW_FIELD_EQ(execution_subtrace_operation_id, AVM_EXEC_OP_ID_MOV))));
}

TEST(ExecutionTraceGenTest, Mov8)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    const auto instr = InstructionBuilder(WireOpCode::MOV_8)
                           .operand<uint32_t>(10) // srcOffset
                           .operand<uint32_t>(11) // dstOffset
                           .build();

    ExecutionEvent ex_event_mov = {
        .wire_instruction = instr,
        .inputs = { MemoryValue::from<uint64_t>(100) }, // src value
        .output = MemoryValue::from<uint64_t>(100),     // dst value
        .addressing_event = { .instruction = instr,
                              .resolution_info = { {
                                                       .resolved_operand = MemoryValue::from<uint32_t>(10),
                                                   },
                                                   {
                                                       .resolved_operand = MemoryValue::from<uint32_t>(11),
                                                   } } },
    };

    builder.process({ ex_event_mov }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(ROW_FIELD_EQ(execution_sel, 0)),
                    // Second row is the mov
                    AllOf(ROW_FIELD_EQ(execution_sel, 1),
                          ROW_FIELD_EQ(execution_sel_mov, 1),
                          ROW_FIELD_EQ(execution_rop_0_, 10),
                          ROW_FIELD_EQ(execution_rop_1_, 11),
                          ROW_FIELD_EQ(execution_register_0_, 100),
                          ROW_FIELD_EQ(execution_register_1_, 100),
                          ROW_FIELD_EQ(execution_sel_mem_op_reg_0_, 1),
                          ROW_FIELD_EQ(execution_sel_mem_op_reg_1_, 1),
                          ROW_FIELD_EQ(execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U64)),
                          ROW_FIELD_EQ(execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U64)),
                          ROW_FIELD_EQ(execution_rw_reg_0_, 0),
                          ROW_FIELD_EQ(execution_rw_reg_1_, 1),
                          ROW_FIELD_EQ(execution_subtrace_operation_id, AVM_EXEC_OP_ID_MOV))));
}

} // namespace
} // namespace bb::avm2::tracegen
