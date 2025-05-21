#include "barretenberg/vm2/tracegen/execution_trace.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
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

TEST(ExecutionTraceGenTest, RegisterAllocation)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    // Some inputs
    ExecInstructionSpec spec = {
        .num_addresses = 3, .gas_cost = { .base_l2 = AVM_ADD_BASE_L2_GAS, .base_da = 0, .dyn_l2 = 0, .dyn_da = 0 }
    };
    // Use the instruction builder - we can make the operands more complex
    const auto instr = InstructionBuilder(WireOpCode::ADD_8)
                           // All operands are direct - for simplicity
                           .operand<uint8_t>(0)
                           .operand<uint8_t>(0)
                           .operand<uint8_t>(0)
                           .build();
    simulation::AddressingEvent addressing_event{
        .instruction = instr,
        .spec = &spec,
    };

    auto ex_event = simulation::ExecutionEvent::allocate();
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
    ExecInstructionSpec call_spec = {
        .num_addresses = 5, .gas_cost = { .base_l2 = AVM_CALL_BASE_L2_GAS, .base_da = 0, .dyn_l2 = 0, .dyn_da = 0 }
    };
    const auto call_instr = InstructionBuilder(WireOpCode::CALL)
                                .operand<uint8_t>(2)
                                .operand<uint8_t>(4)
                                .operand<uint8_t>(6)
                                .operand<uint8_t>(10)
                                .operand<uint8_t>(20)
                                .build();

    simulation::AddressingEvent addressing_event{
        .instruction = call_instr,
        .spec = &call_spec,
    };

    simulation::ContextEvent context_event{
        .id = 1,
        .contract_addr = 0xdeadbeef,
    };

    auto ex_event = simulation::ExecutionEvent::allocate();
    ex_event.opcode = ExecutionOpCode::CALL;
    ex_event.addressing_event = addressing_event;
    ex_event.context_event = context_event;
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
    const ExecInstructionSpec return_spec = {
        .num_addresses = 2, .gas_cost = { .base_l2 = AVM_RETURN_BASE_L2_GAS, .base_da = 0, .dyn_l2 = 0, .dyn_da = 0 }
    };
    const auto return_instr = InstructionBuilder(WireOpCode::RETURN).operand<uint8_t>(4).operand<uint8_t>(20).build();

    simulation::AddressingEvent addressing_event{
        .instruction = return_instr,
        .spec = &return_spec,
    };

    simulation::ContextEvent context_event{
        .id = 1,
        .contract_addr = 0xdeadbeef,
    };

    auto ex_event = simulation::ExecutionEvent::allocate();
    ex_event.opcode = ExecutionOpCode::RETURN;
    ex_event.addressing_event = addressing_event;
    ex_event.context_event = context_event;
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

    // Some inputs
    ExecInstructionSpec spec = {
        .num_addresses = 3, .gas_cost = { .base_l2 = AVM_ADD_BASE_L2_GAS, .base_da = 0, .dyn_l2 = 0, .dyn_da = 0 }
    };
    // Use the instruction builder - we can make the operands more complex
    const auto instr = InstructionBuilder(WireOpCode::ADD_8)
                           // All operands are direct - for simplicity
                           .operand<uint8_t>(0)
                           .operand<uint8_t>(0)
                           .operand<uint8_t>(0)
                           .build();
    simulation::AddressingEvent addressing_event{
        .instruction = instr,
        .spec = &spec,
    };

    auto ex_event = simulation::ExecutionEvent::allocate();
    ex_event.inputs = { TaggedValue::from_tag(ValueTag::U16, 5), TaggedValue::from_tag(ValueTag::U16, 3) };
    ex_event.output = { TaggedValue::from_tag(ValueTag::U16, 8) };
    ex_event.opcode = ExecutionOpCode::ADD;
    ex_event.addressing_event = addressing_event;

    Gas gas_limit = { .l2Gas = 110149, .daGas = 100000 };
    Gas prev_gas_used = { .l2Gas = 100000, .daGas = 70000 };
    Gas base_gas = { .l2Gas = 150, .daGas = 5000 };
    Gas dynamic_gas = { .l2Gas = 10000, .daGas = 9000 };

    ex_event.context_event.gas_limit = gas_limit; // Will OOG on l2 after dynamic gas
    ex_event.gas_event.prev_gas_used = prev_gas_used;
    ex_event.gas_event.opcode_gas = 100;
    ex_event.gas_event.addressing_gas = 50;
    ex_event.gas_event.base_gas = base_gas;
    ex_event.gas_event.dynamic_gas = dynamic_gas;
    ex_event.gas_event.dynamic_gas_factor = { .l2Gas = 2, .daGas = 1 };
    ex_event.gas_event.oog_l2_base = false;
    ex_event.gas_event.oog_da_base = false;
    ex_event.gas_event.oog_l2_dynamic = true;
    ex_event.gas_event.oog_da_dynamic = false;

    builder.process({ ex_event }, trace);

    ASSERT_THAT(trace.as_rows(),
                AllOf(Contains(Field(&R::execution_opcode_gas, 100)),
                      Contains(Field(&R::execution_addressing_gas, 50)),
                      Contains(Field(&R::execution_l2_base_gas, 150)),
                      Contains(Field(&R::execution_da_base_gas, 5000)),
                      Contains(Field(&R::execution_out_of_gas_l2_base, false)),
                      Contains(Field(&R::execution_out_of_gas_da_base, false)),
                      Contains(Field(&R::execution_out_of_gas_base, false)),
                      Contains(Field(&R::execution_prev_l2_gas_used, 100000)),
                      Contains(Field(&R::execution_prev_da_gas_used, 70000)),
                      Contains(Field(&R::execution_should_run_dyn_gas_check, true)),
                      Contains(Field(&R::execution_l2_dynamic_gas_factor, 2)),
                      Contains(Field(&R::execution_da_dynamic_gas_factor, 1)),
                      Contains(Field(&R::execution_l2_dynamic_gas, 10000)),
                      Contains(Field(&R::execution_da_dynamic_gas, 9000)),
                      Contains(Field(&R::execution_out_of_gas_l2_dynamic, true)),
                      Contains(Field(&R::execution_out_of_gas_da_dynamic, false)),
                      Contains(Field(&R::execution_out_of_gas_dynamic, true))));

    // Test the comparisons
    Gas gas_used_after_base = ex_event.gas_event.prev_gas_used + ex_event.gas_event.base_gas;

    uint32_t limit_used_l2_base_cmp_diff = gas_limit.l2Gas - gas_used_after_base.l2Gas;
    uint32_t limit_used_da_base_cmp_diff = gas_limit.daGas - gas_used_after_base.daGas;

    Gas gas_used_after_dynamic = gas_used_after_base + ex_event.gas_event.dynamic_gas;
    uint32_t limit_used_da_dynamic_cmp_diff = gas_limit.daGas - gas_used_after_dynamic.daGas;

    ASSERT_THAT(trace.as_rows(),
                AllOf(Contains(Field(&R::execution_limit_used_l2_base_cmp_diff, limit_used_l2_base_cmp_diff)),
                      Contains(Field(&R::execution_limit_used_da_base_cmp_diff, limit_used_da_base_cmp_diff)),
                      Contains(Field(&R::execution_limit_used_l2_dynamic_cmp_diff, 0)), // Exactly out of gas
                      Contains(Field(&R::execution_limit_used_da_dynamic_cmp_diff, limit_used_da_dynamic_cmp_diff))));

    // Test decompositions of the comparisons
    ASSERT_THAT(
        trace.as_rows(),
        AllOf(Contains(Field(&R::execution_limit_used_l2_base_cmp_diff_lo, limit_used_l2_base_cmp_diff & 0xffff)),
              Contains(Field(&R::execution_limit_used_l2_base_cmp_diff_hi, limit_used_l2_base_cmp_diff >> 16)),
              Contains(Field(&R::execution_limit_used_da_base_cmp_diff_lo, limit_used_da_base_cmp_diff & 0xffff)),
              Contains(Field(&R::execution_limit_used_da_base_cmp_diff_hi, limit_used_da_base_cmp_diff >> 16)),
              Contains(Field(&R::execution_limit_used_l2_dynamic_cmp_diff_lo, 0)), // Exactly out of gas
              Contains(Field(&R::execution_limit_used_l2_dynamic_cmp_diff_hi, 0)),
              Contains(Field(&R::execution_limit_used_da_dynamic_cmp_diff_lo, limit_used_da_dynamic_cmp_diff & 0xffff)),
              Contains(Field(&R::execution_limit_used_da_dynamic_cmp_diff_hi, limit_used_da_dynamic_cmp_diff >> 16))));
}

} // namespace
} // namespace bb::avm2::tracegen
