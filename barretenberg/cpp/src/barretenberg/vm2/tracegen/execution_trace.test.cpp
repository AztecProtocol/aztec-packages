#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
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
simulation::ExecutionEvent createBaseEvent(const simulation::Instruction& instruction,
                                           uint32_t context_id,
                                           uint32_t parent_id,
                                           TransactionPhase phase)
{
    const WireOpCode wire_opcode = instruction.opcode;
    const WireInstructionSpec& wire_spec = WIRE_INSTRUCTION_SPEC.at(wire_opcode);

    simulation::ExecutionEvent ex_event;
    ex_event.opcode = wire_spec.exec_opcode;
    ex_event.addressing_event.instruction = instruction;
    ex_event.wire_instruction = instruction;
    ex_event.after_context_event.id = context_id;
    ex_event.after_context_event.parent_id = parent_id;
    ex_event.after_context_event.phase = phase;
    ex_event.before_context_event = ex_event.after_context_event;
    return ex_event;
}

simulation::ExecutionEvent createAddEvent(uint32_t context_id, uint32_t parent_id, TransactionPhase phase)
{
    const auto add_instr =
        InstructionBuilder(WireOpCode::ADD_8).operand<uint8_t>(0).operand<uint8_t>(0).operand<uint8_t>(0).build();
    auto ex_event = createBaseEvent(add_instr, context_id, parent_id, phase);
    ex_event.inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) };
    ex_event.output = { TaggedValue::from_tag(ValueTag::U16, 8) };
    ex_event.opcode = ExecutionOpCode::ADD;
    return ex_event;
}

simulation::ExecutionEvent createCallEvent(uint32_t context_id,
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
    auto ex_event = createBaseEvent(call_instr, context_id, parent_id, phase);
    ex_event.next_context_id = next_context_id;
    ex_event.inputs = { /*allocated_l2_gas_read=*/MemoryValue::from<uint32_t>(10),
                        /*allocated_da_gas_read=*/MemoryValue ::from<uint32_t>(11),
                        /*contract_address=*/MemoryValue::from<uint32_t>(0xdeadbeef) };
    return ex_event;
}

simulation::ExecutionEvent createReturnEvent(uint32_t context_id, uint32_t parent_id, TransactionPhase phase)
{
    const auto return_instr = InstructionBuilder(WireOpCode::RETURN).operand<uint8_t>(0).operand<uint8_t>(0).build();
    auto ex_event = createBaseEvent(return_instr, context_id, parent_id, phase);
    ex_event.inputs = { /*rd_size=*/MemoryValue::from<uint32_t>(2) };
    return ex_event;
}

simulation::ExecutionEvent createErrorEvent(uint32_t context_id,
                                            uint32_t parent_id,
                                            TransactionPhase phase,
                                            uint32_t next_context_id)
{
    // Actually an ADD instruction with exception=true
    const auto add_instr =
        InstructionBuilder(WireOpCode::ADD_8).operand<uint8_t>(0).operand<uint8_t>(0).operand<uint8_t>(0).build();
    auto ex_event = createBaseEvent(add_instr, context_id, parent_id, phase);
    ex_event.exception = true;                  // This should trigger error behavior (like discard)
    ex_event.next_context_id = next_context_id; // Return to parent
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
    simulation::AddressingEvent addressing_event{
        .instruction = instr,
    };

    simulation::ExecutionEvent ex_event;
    ex_event.inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) };
    ex_event.output = { TaggedValue::from_tag(ValueTag::U16, 8) };
    ex_event.opcode = ExecutionOpCode::ADD;

    ex_event.addressing_event = addressing_event;

    builder.process({ ex_event }, trace);
    // todo: Test doesnt check the other register fields are zeroed out.
    EXPECT_THAT(trace.as_rows(),
                AllOf(Contains(Field(&R::execution_sel, 1)),
                      Contains(Field(&R::execution_sel_alu, 1)),
                      Contains(Field(&R::execution_reg1, 5)),
                      Contains(Field(&R::execution_reg2, 3)),
                      Contains(Field(&R::execution_reg3, 8)),
                      Contains(Field(&R::execution_mem_tag1, /*U16=*/3)),
                      Contains(Field(&R::execution_mem_tag2, /*U16=*/3)),
                      Contains(Field(&R::execution_mem_tag3, /*U16=*/3)),
                      Contains(Field(&R::execution_mem_op1, 1)),
                      Contains(Field(&R::execution_mem_op2, 1)),
                      Contains(Field(&R::execution_mem_op3, 1)),
                      Contains(Field(&R::execution_rw1, 0)),
                      Contains(Field(&R::execution_rw2, 0)),
                      Contains(Field(&R::execution_rw3, 1))));
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

    simulation::AddressingEvent addressing_event{
        .instruction = call_instr,
    };

    simulation::ContextEvent context_event{
        .id = 1,
        .contract_addr = 0xdeadbeef,
    };

    simulation::ExecutionEvent ex_event;
    ex_event.opcode = ExecutionOpCode::CALL;
    ex_event.addressing_event = addressing_event;
    ex_event.after_context_event = context_event;
    ex_event.next_context_id = 2;
    ex_event.inputs = { /*allocated_l2_gas_read=*/MemoryValue::from<uint32_t>(10),
                        /*allocated_da_gas_read=*/MemoryValue ::from<uint32_t>(11),
                        /*contract_address=*/MemoryValue::from<uint32_t>(0xdeadbeef) };
    ex_event.resolved_operands = { MemoryValue::from<uint32_t>(0),
                                   MemoryValue::from<uint32_t>(0),
                                   MemoryValue::from<uint32_t>(0),
                                   MemoryValue::from<uint32_t>(10),
                                   MemoryValue::from<uint32_t>(20) };

    builder.process({ ex_event }, trace);
    EXPECT_THAT(trace.as_rows(),
                AllOf(Contains(Field(&R::execution_sel, 1)),
                      Contains(Field(&R::execution_sel_call, 1)),
                      Contains(Field(&R::execution_sel_enter_call, 1)),
                      Contains(Field(&R::execution_rop4, 10)),
                      Contains(Field(&R::execution_rop5, 20)),
                      Contains(Field(&R::execution_reg1, 10)),
                      Contains(Field(&R::execution_reg2, 11)),
                      Contains(Field(&R::execution_reg3, 0xdeadbeef)),
                      Contains(Field(&R::execution_mem_tag1, /*U32=*/4)),
                      Contains(Field(&R::execution_mem_tag2, /*U32=*/4)),
                      Contains(Field(&R::execution_mem_tag3, /*FF=*/0)),
                      Contains(Field(&R::execution_mem_op1, 1)),
                      Contains(Field(&R::execution_mem_op2, 1)),
                      Contains(Field(&R::execution_mem_op3, 1)),
                      Contains(Field(&R::execution_rw1, 0)),
                      Contains(Field(&R::execution_rw2, 0)),
                      Contains(Field(&R::execution_rw3, 0)),
                      Contains(Field(&R::execution_is_static, 0)),
                      Contains(Field(&R::execution_context_id, 1)),
                      Contains(Field(&R::execution_next_context_id, 2))));
}

TEST(ExecutionTraceGenTest, Return)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Inputs
    const auto return_instr = InstructionBuilder(WireOpCode::RETURN).operand<uint8_t>(4).operand<uint8_t>(20).build();

    simulation::AddressingEvent addressing_event{
        .instruction = return_instr,
    };

    simulation::ContextEvent context_event{
        .id = 1,
        .contract_addr = 0xdeadbeef,
    };

    simulation::ExecutionEvent ex_event;
    ex_event.opcode = ExecutionOpCode::RETURN;
    ex_event.addressing_event = addressing_event;
    ex_event.after_context_event = context_event;
    ex_event.next_context_id = 2;
    ex_event.inputs = { /*rd_size=*/MemoryValue::from<uint32_t>(2) };
    ex_event.resolved_operands = { /*rd_size_offset=*/MemoryValue::from<uint32_t>(4),
                                   /*rd_offset=*/MemoryValue::from<uint32_t>(5) };

    builder.process({ ex_event }, trace);
    EXPECT_THAT(trace.as_rows(),
                AllOf(Contains(Field(&R::execution_sel, 1)),
                      Contains(Field(&R::execution_sel_return, 1)),
                      Contains(Field(&R::execution_sel_exit_call, 1)),
                      Contains(Field(&R::execution_rop1, 4)),
                      Contains(Field(&R::execution_rop2, 5)),
                      Contains(Field(&R::execution_reg1, 2)), /*rd_size*/
                      Contains(Field(&R::execution_mem_tag1, /*U32=*/4)),
                      Contains(Field(&R::execution_mem_op1, 1)),
                      Contains(Field(&R::execution_rw1, 0)),
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
    simulation::AddressingEvent addressing_event{
        .instruction = instr,
    };

    simulation::ExecutionEvent ex_event;
    ex_event.inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) };
    ex_event.output = { TaggedValue::from_tag(ValueTag::U16, 8) };
    ex_event.opcode = ExecutionOpCode::ADD;
    ex_event.addressing_event = addressing_event;

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
    ex_event.gas_event.dynamic_gas_used = { .l2Gas = dynamic_gas.l2Gas * 2, .daGas = dynamic_gas.daGas * 1 };
    ex_event.gas_event.oog_base_l2 = false;
    ex_event.gas_event.oog_base_da = false;
    ex_event.gas_event.oog_dynamic_l2 = true;
    ex_event.gas_event.oog_dynamic_da = false;

    builder.process({ ex_event }, trace);

    EXPECT_THAT(trace.as_rows(),
                AllOf(Contains(Field(&R::execution_opcode_gas, 100)),
                      Contains(Field(&R::execution_addressing_gas, 50)),
                      Contains(Field(&R::execution_base_l2_gas, 150)),
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
                      Contains(Field(&R::execution_dynamic_l2_gas_used, 10000)),
                      Contains(Field(&R::execution_dynamic_da_gas_used, 9000)),
                      Contains(Field(&R::execution_out_of_gas_dynamic_l2, true)),
                      Contains(Field(&R::execution_out_of_gas_dynamic_da, false)),
                      Contains(Field(&R::execution_out_of_gas_dynamic, true))));

    // Test the comparisons
    Gas gas_used_after_base = ex_event.before_context_event.gas_used + ex_event.gas_event.base_gas;

    uint32_t limit_used_base_l2_cmp_diff = gas_limit.l2Gas - gas_used_after_base.l2Gas;
    uint32_t limit_used_base_da_cmp_diff = gas_limit.daGas - gas_used_after_base.daGas;

    Gas gas_used_after_dynamic = gas_used_after_base + ex_event.gas_event.dynamic_gas_used;
    uint32_t limit_used_dynamic_da_cmp_diff = gas_limit.daGas - gas_used_after_dynamic.daGas;

    EXPECT_THAT(trace.as_rows(),
                AllOf(Contains(Field(&R::execution_limit_used_base_l2_cmp_diff, limit_used_base_l2_cmp_diff)),
                      Contains(Field(&R::execution_limit_used_base_da_cmp_diff, limit_used_base_da_cmp_diff)),
                      Contains(Field(&R::execution_limit_used_dynamic_l2_cmp_diff, 0)), // Exactly out of gas
                      Contains(Field(&R::execution_limit_used_dynamic_da_cmp_diff, limit_used_dynamic_da_cmp_diff))));

    // Test decompositions of the comparisons
    EXPECT_THAT(
        trace.as_rows(),
        AllOf(Contains(Field(&R::execution_limit_used_base_l2_cmp_diff_lo, limit_used_base_l2_cmp_diff & 0xffff)),
              Contains(Field(&R::execution_limit_used_base_l2_cmp_diff_hi, limit_used_base_l2_cmp_diff >> 16)),
              Contains(Field(&R::execution_limit_used_base_da_cmp_diff_lo, limit_used_base_da_cmp_diff & 0xffff)),
              Contains(Field(&R::execution_limit_used_base_da_cmp_diff_hi, limit_used_base_da_cmp_diff >> 16)),
              Contains(Field(&R::execution_limit_used_dynamic_l2_cmp_diff_lo, 0)), // Exactly out of gas
              Contains(Field(&R::execution_limit_used_dynamic_l2_cmp_diff_hi, 0)),
              Contains(Field(&R::execution_limit_used_dynamic_da_cmp_diff_lo, limit_used_dynamic_da_cmp_diff & 0xffff)),
              Contains(Field(&R::execution_limit_used_dynamic_da_cmp_diff_hi, limit_used_dynamic_da_cmp_diff >> 16))));
}

TEST(ExecutionTraceGenTest, SimpleDiscardSingleEvent)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Just test a single event to isolate the issue
    std::vector<simulation::ExecutionEvent> events;

    // Single ADD operation
    events.push_back(createAddEvent(1, 0, TransactionPhase::APP_LOGIC));

    builder.process(events, trace);

    const auto& rows = trace.as_rows();
    EXPECT_GE(rows.size(), 1);
}

TEST(ExecutionTraceGenTest, DiscardNestedRevertContext)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Create a sequence: parent context calls child context, child does some work then reverts
    std::vector<simulation::ExecutionEvent> events;

    // Event 1: Parent context does ADD
    events.push_back(createAddEvent(1, 0, TransactionPhase::APP_LOGIC));

    // Event 2: Parent calls child (context 1 -> 2)
    events.push_back(createCallEvent(1, 0, TransactionPhase::APP_LOGIC, 2));

    // Event 3: Child context does ADD - this should have discard=1 since child will revert
    events.push_back(createAddEvent(2, 1, TransactionPhase::APP_LOGIC));

    // Event 4: Child context reverts
    events.push_back(createErrorEvent(2, 1, TransactionPhase::APP_LOGIC, 1));

    // Event 5: Parent continues after child reverted
    events.push_back(createAddEvent(1, 0, TransactionPhase::APP_LOGIC));

    // Event 6: Parent returns successfully (top-level exit)
    events.push_back(createReturnEvent(1, 0, TransactionPhase::APP_LOGIC));

    builder.process(events, trace);

    const auto& rows = trace.as_rows();

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

    // Row 4: Child REVERT - should still have discard=1, dying_context_id=2
    EXPECT_EQ(rows[4].execution_discard, 1);
    EXPECT_EQ(rows[4].execution_dying_context_id, 2);
    EXPECT_EQ(rows[4].execution_is_dying_context, 1);
    EXPECT_EQ(rows[4].execution_sel_error, 1);        // Using exception instead of revert
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
    std::vector<simulation::ExecutionEvent> events;

    // Event 1: App logic phase - successful ADD
    events.push_back(createAddEvent(1, 0, TransactionPhase::APP_LOGIC));

    // Event 2: App logic phase - successful RETURN (exits app logic phase)
    events.push_back(createReturnEvent(1, 0, TransactionPhase::APP_LOGIC));

    // Event 3: Teardown phase - some operation
    events.push_back(createAddEvent(2, 0, TransactionPhase::TEARDOWN));

    // Event 4: Teardown phase - REVERT (error that exits teardown)
    events.push_back(createErrorEvent(2, 0, TransactionPhase::TEARDOWN, 0));

    builder.process(events, trace);

    const auto& rows = trace.as_rows();

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

    // Row 4: Teardown REVERT - should have discard=1
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
    std::vector<simulation::ExecutionEvent> events;

    // First enqueued call
    // Event 1: First call's app logic - successful ADD
    events.push_back(createAddEvent(1, 0, TransactionPhase::APP_LOGIC));

    // Event 2: First call's app logic - successful RETURN (exits first call)
    events.push_back(createReturnEvent(1, 0, TransactionPhase::APP_LOGIC));

    // Second enqueued call
    // Event 3: Second call's app logic - ADD operation
    events.push_back(createAddEvent(2, 0, TransactionPhase::APP_LOGIC));

    // Event 4: Second call's app logic - ERROR (causes second enqueued call to fail)
    events.push_back(createErrorEvent(2, 0, TransactionPhase::APP_LOGIC, 0));

    builder.process(events, trace);

    const auto& rows = trace.as_rows();

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
