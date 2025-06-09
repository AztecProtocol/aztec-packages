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
        .resolved_operands = { MemoryValue::from<uint32_t>(0),
                               MemoryValue::from<uint32_t>(0),
                               MemoryValue::from<uint32_t>(0),
                               MemoryValue::from<uint32_t>(10),
                               MemoryValue::from<uint32_t>(20) },
        .inputs = { /*allocated_l2_gas_read=*/MemoryValue::from<uint32_t>(allocated_gas.l2Gas),
                    /*allocated_da_gas_read=*/MemoryValue ::from<uint32_t>(allocated_gas.daGas),
                    /*contract_address=*/MemoryValue::from<uint32_t>(0xdeadbeef) },
        .next_context_id = 2,
        .addressing_event = { .instruction = call_instr },
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
        .resolved_operands = { /*rd_size_offset=*/MemoryValue::from<uint32_t>(4),
                               /*rd_offset=*/MemoryValue::from<uint32_t>(5) },
        .inputs = { /*rd_size=*/MemoryValue::from<uint32_t>(2) },
        .next_context_id = 2,
        .addressing_event = { .instruction = return_instr },
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

} // namespace
} // namespace bb::avm2::tracegen
