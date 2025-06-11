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
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::bb::avm2::testing::InstructionBuilder;
using enum ::bb::avm2::WireOpCode;

using ::testing::AllOf;
using ::testing::Contains;
using ::testing::Field;

using R = TestTraceContainer::Row;

// Helper functions for creating common execution events

// Base helper to set up common event fields
simulation::ExecutionEvent create_base_event(const simulation::Instruction& instruction,
                                             uint32_t context_id,
                                             uint32_t parent_id,
                                             TransactionPhase phase)
{
    simulation::ExecutionEvent ex_event;
    ex_event.addressing_event.instruction = instruction;
    ex_event.wire_instruction = instruction;
    ex_event.after_context_event.id = context_id;
    ex_event.after_context_event.parent_id = parent_id;
    ex_event.after_context_event.phase = phase;
    ex_event.before_context_event = ex_event.after_context_event;
    return ex_event;
}

simulation::ExecutionEvent create_add_event(uint32_t context_id, uint32_t parent_id, TransactionPhase phase)
{
    const auto add_instr =
        InstructionBuilder(WireOpCode::ADD_8).operand<uint8_t>(0).operand<uint8_t>(0).operand<uint8_t>(0).build();
    auto ex_event = create_base_event(add_instr, context_id, parent_id, phase);
    ex_event.inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) };
    ex_event.output = { TaggedValue::from_tag(ValueTag::U16, 8) };
    return ex_event;
}

simulation::ExecutionEvent create_call_event(uint32_t context_id,
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

simulation::ExecutionEvent create_return_event(uint32_t context_id, uint32_t parent_id, TransactionPhase phase)
{
    const auto return_instr = InstructionBuilder(WireOpCode::RETURN).operand<uint8_t>(0).operand<uint8_t>(0).build();
    auto ex_event = create_base_event(return_instr, context_id, parent_id, phase);
    ex_event.inputs = { /*rd_size=*/MemoryValue::from<uint32_t>(2) };
    return ex_event;
}

simulation::ExecutionEvent create_error_event(uint32_t context_id,
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

    simulation::ExecutionEvent ex_event = {
        .wire_instruction = instr,
        .inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) },
        .output = { TaggedValue::from_tag(ValueTag::U16, 8) },
        .addressing_event = { .instruction = instr },
    };

    builder.process({ ex_event }, trace);

    // todo: Test doesnt check the other register fields are zeroed out.
    EXPECT_THAT(trace.as_rows(),
                AllOf(Contains(Field(&R::execution_sel, 1)),
                      Contains(Field(&R::execution_sel_alu, 1)),
                      Contains(Field(&R::execution_register_0_, 5)),
                      Contains(Field(&R::execution_register_1_, 3)),
                      Contains(Field(&R::execution_register_2_, 8)),
                      Contains(Field(&R::execution_mem_tag_0_, /*U16=*/3)),
                      Contains(Field(&R::execution_mem_tag_1_, /*U16=*/3)),
                      Contains(Field(&R::execution_mem_tag_2_, /*U16=*/3)),
                      Contains(Field(&R::execution_mem_op_0_, 1)),
                      Contains(Field(&R::execution_mem_op_1_, 1)),
                      Contains(Field(&R::execution_mem_op_2_, 1)),
                      Contains(Field(&R::execution_rw_0_, 0)),
                      Contains(Field(&R::execution_rw_1_, 0)),
                      Contains(Field(&R::execution_rw_2_, 1))));
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
    simulation::ExecutionEvent ex_event = {
        .wire_instruction = call_instr,
        .inputs = { /*allocated_l2_gas_read=*/MemoryValue::from<uint32_t>(allocated_gas.l2Gas),
                    /*allocated_da_gas_read=*/MemoryValue ::from<uint32_t>(allocated_gas.daGas),
                    /*contract_address=*/MemoryValue::from<uint32_t>(0xdeadbeef) },
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
        },
    };

    Gas gas_limit = { .l2Gas = 1000, .daGas = 2000 };
    Gas gas_used = { .l2Gas = 500, .daGas = 1900 };
    Gas gas_left = gas_limit - gas_used;
    ex_event.after_context_event.gas_limit = gas_limit;
    ex_event.after_context_event.gas_used = gas_used;

    builder.process({ ex_event }, trace);
    EXPECT_THAT(
        trace.as_rows(),
        AllOf(Contains(Field(&R::execution_sel, 1)),
              Contains(Field(&R::execution_sel_call, 1)),
              Contains(Field(&R::execution_sel_enter_call, 1)),
              Contains(Field(&R::execution_rop_3_, 10)),
              Contains(Field(&R::execution_rop_4_, 20)),
              Contains(Field(&R::execution_register_0_, allocated_gas.l2Gas)),
              Contains(Field(&R::execution_register_1_, allocated_gas.daGas)),
              Contains(Field(&R::execution_register_2_, 0xdeadbeef)),
              Contains(Field(&R::execution_mem_tag_0_, /*U32=*/4)),
              Contains(Field(&R::execution_mem_tag_1_, /*U32=*/4)),
              Contains(Field(&R::execution_mem_tag_2_, /*FF=*/0)),
              Contains(Field(&R::execution_mem_op_0_, 1)),
              Contains(Field(&R::execution_mem_op_1_, 1)),
              Contains(Field(&R::execution_mem_op_2_, 1)),
              Contains(Field(&R::execution_rw_0_, 0)),
              Contains(Field(&R::execution_rw_1_, 0)),
              Contains(Field(&R::execution_rw_2_, 0)),
              Contains(Field(&R::execution_is_static, 0)),
              Contains(Field(&R::execution_context_id, 1)),
              Contains(Field(&R::execution_next_context_id, 2)),
              Contains(Field(&R::execution_constant_32, 32)),
              Contains(Field(&R::execution_call_is_l2_gas_allocated_lt_left, true)),
              Contains(Field(&R::execution_call_allocated_left_l2_cmp_diff, gas_left.l2Gas - allocated_gas.l2Gas - 1)),
              Contains(Field(&R::execution_call_is_da_gas_allocated_lt_left, false)),
              Contains(Field(&R::execution_call_allocated_left_da_cmp_diff, allocated_gas.daGas - gas_left.daGas))));
}

TEST(ExecutionTraceGenTest, Return)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Inputs
    const auto return_instr = InstructionBuilder(WireOpCode::RETURN).operand<uint8_t>(4).operand<uint8_t>(20).build();

    simulation::ExecutionEvent ex_event = {
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
                AllOf(Contains(Field(&R::execution_sel, 1)),
                      Contains(Field(&R::execution_sel_return, 1)),
                      Contains(Field(&R::execution_sel_exit_call, 1)),
                      Contains(Field(&R::execution_rop_0_, 4)),
                      Contains(Field(&R::execution_rop_1_, 5)),
                      Contains(Field(&R::execution_register_0_, 2)), /*rd_size*/
                      Contains(Field(&R::execution_mem_tag_0_, /*U32=*/4)),
                      Contains(Field(&R::execution_mem_op_0_, 1)),
                      Contains(Field(&R::execution_rw_0_, 0)),
                      Contains(Field(&R::execution_is_static, 0)),
                      Contains(Field(&R::execution_context_id, 1)),
                      Contains(Field(&R::execution_next_context_id, 2))));
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

    simulation::ExecutionEvent ex_event = {
        .wire_instruction = instr,
        .inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) },
        .output = { TaggedValue::from_tag(ValueTag::U16, 8) },
        .addressing_event = { .instruction = instr },
    };

    Gas gas_limit = { .l2Gas = 110149, .daGas = 100000 };
    Gas prev_gas_used = { .l2Gas = 100000, .daGas = 70000 };
    Gas base_gas = { .l2Gas = 150, .daGas = 5000 };
    Gas dynamic_gas = { .l2Gas = 5000, .daGas = 9000 };

    ex_event.after_context_event.gas_limit = gas_limit; // Will OOG on l2 after dynamic gas
    ex_event.before_context_event.gas_used = prev_gas_used;
    ex_event.gas_event.opcode_gas = 100;
    ex_event.gas_event.addressing_gas = 50;
    ex_event.gas_event.base_gas = base_gas;
    ex_event.gas_event.dynamic_gas = dynamic_gas;
    ex_event.gas_event.dynamic_gas_factor = { .l2Gas = 2, .daGas = 1 };
    ex_event.gas_event.oog_base_l2 = false;
    ex_event.gas_event.oog_base_da = false;
    ex_event.gas_event.oog_dynamic_l2 = true;
    ex_event.gas_event.oog_dynamic_da = false;
    ex_event.gas_event.limit_used_l2_comparison_witness = 0;
    ex_event.gas_event.limit_used_da_comparison_witness =
        gas_limit.daGas - prev_gas_used.daGas - base_gas.daGas - dynamic_gas.daGas * 1;

    builder.process({ ex_event }, trace);

    EXPECT_THAT(trace.as_rows(),
                AllOf(Contains(Field(&R::execution_opcode_gas, 100)),
                      Contains(Field(&R::execution_addressing_gas, 50)),
                      Contains(Field(&R::execution_base_da_gas, 5000)),
                      Contains(Field(&R::execution_out_of_gas_base_l2, false)),
                      Contains(Field(&R::execution_out_of_gas_base_da, false)),
                      Contains(Field(&R::execution_out_of_gas_base, false)),
                      Contains(Field(&R::execution_prev_l2_gas_used, 100000)),
                      Contains(Field(&R::execution_prev_da_gas_used, 70000)),
                      Contains(Field(&R::execution_should_run_dyn_gas_check, true)),
                      Contains(Field(&R::execution_dynamic_l2_gas_factor, 2)),
                      Contains(Field(&R::execution_dynamic_da_gas_factor, 1)),
                      Contains(Field(&R::execution_dynamic_l2_gas, 5000)),
                      Contains(Field(&R::execution_dynamic_da_gas, 9000)),
                      Contains(Field(&R::execution_out_of_gas_dynamic_l2, true)),
                      Contains(Field(&R::execution_out_of_gas_dynamic_da, false)),
                      Contains(Field(&R::execution_out_of_gas_dynamic, true)),
                      Contains(Field(&R::execution_limit_used_l2_cmp_diff, 0)),
                      Contains(Field(&R::execution_limit_used_da_cmp_diff, 16000))));
}

TEST(ExecutionTraceGenTest, DiscardNestedFailContext)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Create a sequence: parent context calls child context, child does some work then fails
    std::vector<simulation::ExecutionEvent> events = {
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
    std::vector<simulation::ExecutionEvent> events = {
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
    std::vector<simulation::ExecutionEvent> events = {
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

} // namespace
} // namespace bb::avm2::tracegen
