#include "barretenberg/vm/avm/trace/deserialization.hpp"
#include "barretenberg/vm/avm/trace/opcode.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "common.test.hpp"
#include <cstdint>

namespace tests_avm {

using namespace bb;
using namespace bb::avm_trace;

namespace {

void validate_internal_call(Row const& row, uint32_t current_pc, uint32_t target_pc)
{
    EXPECT_EQ(row.main_sel_op_internal_call, FF(1));
    EXPECT_EQ(row.main_pc, FF(current_pc));
    EXPECT_EQ(row.main_ia, FF(target_pc));
    EXPECT_EQ(row.main_ib, FF(current_pc + Deserialization::get_pc_increment(OpCode::INTERNALCALL)));
};

void validate_internal_return(Row const& row, uint32_t current_pc, uint32_t return_pc)
{
    EXPECT_EQ(row.main_sel_op_internal_return, FF(1));
    EXPECT_EQ(row.main_pc, FF(current_pc));
    EXPECT_EQ(row.main_ia, FF(return_pc));
};

} // namespace

class AvmControlFlowTests : public ::testing::Test {
  public:
    AvmControlFlowTests()
        : public_inputs(generate_base_public_inputs())
        , trace_builder(
              AvmTraceBuilder(public_inputs).set_full_precomputed_tables(false).set_range_check_required(false))
    {
        srs::init_crs_factory(bb::srs::get_ignition_crs_path());
    }

    AvmPublicInputs public_inputs;
    AvmTraceBuilder trace_builder;
};

/******************************************************************************
 *
 * POSITIVE TESTS - Control Flow
 *
 *****************************************************************************/

TEST_F(AvmControlFlowTests, simpleCall)
{
    uint32_t const SET_PC = 4;
    uint32_t const CALL_PC = 41;

    // trace_builder for the following operation
    // pc   opcode
    // 0    INTERNAL_CALL(pc=4)
    // 4    SET(0, 0, 100)
    // 41   RETURN
    trace_builder.op_internal_call(SET_PC);
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);

    auto trace = trace_builder.finalize();

    // Check call
    {
        auto call_row_iter = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_internal_call == FF(1); });
        EXPECT_TRUE(call_row_iter != trace.end());
        auto& call_row = trace.at(static_cast<size_t>(call_row_iter - trace.begin()));
        validate_internal_call(call_row, 0, SET_PC);
    }

    // Check halt
    {
        auto halt_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_external_return == FF(1); });

        // Check that the correct result is stored at the expected memory location.
        EXPECT_TRUE(halt_row != trace.end());
        EXPECT_EQ(halt_row->main_pc, FF(CALL_PC));
    }
    validate_trace(std::move(trace), public_inputs, {}, {});
}

TEST_F(AvmControlFlowTests, simpleJump)
{
    uint32_t const SET_PC = 4;
    uint32_t const JUMP_PC = 41;

    // trace_builder for the following operation
    // pc   opcode
    // 0    JUMP(pc=4)
    // 4    SET(0, 0, 100)
    // 41   RETURN
    trace_builder.op_jump(SET_PC);
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);

    auto trace = trace_builder.finalize();

    // Check jump
    {
        auto call_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_jump == FF(1); });
        EXPECT_TRUE(call_row != trace.end());
        EXPECT_EQ(call_row->main_pc, FF(0));
        EXPECT_EQ(call_row->main_ia, FF(SET_PC));
    }

    // Check halt
    {
        auto halt_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_external_return == FF(1); });

        EXPECT_TRUE(halt_row != trace.end());
        EXPECT_EQ(halt_row->main_pc, FF(JUMP_PC));
    }
    validate_trace(std::move(trace), public_inputs);
}

TEST_F(AvmControlFlowTests, simpleCallAndReturn)
{
    uint32_t const SET_PC = Deserialization::get_pc_increment(OpCode::INTERNALCALL);
    uint32_t const RETURN_PC = SET_PC + Deserialization::get_pc_increment(OpCode::SET_FF);
    uint32_t const INTERNAL_RETURN_PC = RETURN_PC + Deserialization::get_pc_increment(OpCode::RETURN);

    // trace_builder for the following operation
    // pc   opcode
    // 0    INTERNAL_CALL(pc=57)
    // 57   INTERNAL_RETURN
    // 5    SET(0, 0, 100)
    // 42   RETURN
    trace_builder.op_internal_call(INTERNAL_RETURN_PC);
    trace_builder.op_internal_return();
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);

    auto trace = trace_builder.finalize();

    // Check call
    {
        auto call_row_iter = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_internal_call == FF(1); });
        EXPECT_TRUE(call_row_iter != trace.end());
        auto& call_row = trace.at(static_cast<size_t>(call_row_iter - trace.begin()));
        validate_internal_call(call_row, 0, INTERNAL_RETURN_PC);
    }

    // Check return
    {
        auto return_row_iter = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_internal_return == FF(1); });

        // Check that the correct result is stored at the expected memory location.
        EXPECT_TRUE(return_row_iter != trace.end());
        auto& return_row = trace.at(static_cast<size_t>(return_row_iter - trace.begin()));
        validate_internal_return(return_row, INTERNAL_RETURN_PC, SET_PC);
    }

    // Check halt
    {
        auto halt_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_external_return == FF(1); });

        EXPECT_TRUE(halt_row != trace.end());
        EXPECT_EQ(halt_row->main_pc, FF(RETURN_PC));
    }

    validate_trace(std::move(trace), public_inputs);
}

TEST_F(AvmControlFlowTests, multipleCallsAndReturns)
{
    const uint32_t CALL_PC_1 = 420;
    const uint32_t CALL_PC_2 = 69;
    const uint32_t CALL_PC_3 = 1337;
    const uint32_t CALL_PC_4 = 10;

    const uint32_t JUMP_PC_1 = 22;

    const uint32_t INTERNALCALL_SIZE = Deserialization::get_pc_increment(OpCode::INTERNALCALL);
    const uint32_t NEXT_PC_1 = INTERNALCALL_SIZE;
    const uint32_t NEXT_PC_2 = CALL_PC_1 + INTERNALCALL_SIZE;
    const uint32_t NEXT_PC_3 = CALL_PC_2 + INTERNALCALL_SIZE;
    const uint32_t NEXT_PC_4 = CALL_PC_2 + 2 * INTERNALCALL_SIZE;
    const uint32_t RETURN_PC = NEXT_PC_1 + Deserialization::get_pc_increment(OpCode::SET_FF);

    // trace_builder for the following operation
    // pc    opcode
    // 0     INTERNAL_CALL(pc=420)
    // 420   INTERNAL_CALL(pc=69)
    // 69    INTERNAL_CALL(pc=1337)
    // 1337  INTERNAL_RETURN
    // 74    INTERNAL_CALL(pc=10)
    // 10    INTERNAL_RETURN
    // 79    JUMP(pc=22)
    // 22    INTERNAL_RETURN
    // 425   INTERNAL_RETURN
    // 1     RETURN
    trace_builder.op_internal_call(CALL_PC_1);
    trace_builder.op_internal_call(CALL_PC_2);
    trace_builder.op_internal_call(CALL_PC_3);
    trace_builder.op_internal_return();
    trace_builder.op_internal_call(CALL_PC_4);
    trace_builder.op_internal_return();
    trace_builder.op_jump(JUMP_PC_1);
    trace_builder.op_internal_return();
    trace_builder.op_internal_return();
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);

    auto trace = trace_builder.finalize();

    // Check call 1
    {
        auto call_1 = std::ranges::find_if(trace.begin(), trace.end(), [NEXT_PC_1](Row r) {
            return r.main_sel_op_internal_call == FF(1) && r.main_ib == FF(NEXT_PC_1);
        });
        EXPECT_TRUE(call_1 != trace.end());
        auto& call_1_row = trace.at(static_cast<size_t>(call_1 - trace.begin()));
        validate_internal_call(call_1_row, 0, CALL_PC_1);
    }

    // Call 2
    {
        auto call_2 = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) {
            return r.main_sel_op_internal_call == FF(1) && r.main_pc == FF(CALL_PC_1);
        });
        EXPECT_TRUE(call_2 != trace.end());
        auto& call_2_row = trace.at(static_cast<size_t>(call_2 - trace.begin()));
        validate_internal_call(call_2_row, CALL_PC_1, CALL_PC_2);
    }

    // Call 3
    {
        auto call_3 = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) {
            return r.main_sel_op_internal_call == FF(1) && r.main_pc == FF(CALL_PC_2);
        });
        EXPECT_TRUE(call_3 != trace.end());
        auto& call_3_row = trace.at(static_cast<size_t>(call_3 - trace.begin()));
        validate_internal_call(call_3_row, CALL_PC_2, CALL_PC_3);
    }

    // Return 1
    {
        auto return_1 = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_internal_return == FF(1); });
        EXPECT_TRUE(return_1 != trace.end());
        auto& return_1_row = trace.at(static_cast<size_t>(return_1 - trace.begin()));
        validate_internal_return(return_1_row, CALL_PC_3, NEXT_PC_3);
    }

    // Call 4
    {
        auto call_4 = std::ranges::find_if(trace.begin(), trace.end(), [NEXT_PC_3](Row r) {
            return r.main_sel_op_internal_call == FF(1) && r.main_pc == FF(NEXT_PC_3);
        });
        EXPECT_TRUE(call_4 != trace.end());
        auto& call_4_row = trace.at(static_cast<size_t>(call_4 - trace.begin()));
        validate_internal_call(call_4_row, NEXT_PC_3, CALL_PC_4);
    }

    // Return 2
    {
        auto return_2 = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) {
            return r.main_sel_op_internal_return == FF(1) && r.main_pc == FF(CALL_PC_4);
        });
        EXPECT_TRUE(return_2 != trace.end());
        auto& return_2_row = trace.at(static_cast<size_t>(return_2 - trace.begin()));
        validate_internal_return(return_2_row, CALL_PC_4, NEXT_PC_4);
    }

    // Jump 1
    {
        auto jump_1 = std::ranges::find_if(trace.begin(), trace.end(), [NEXT_PC_4](Row r) {
            return r.main_sel_op_jump == FF(1) && r.main_pc == FF(NEXT_PC_4);
        });
        EXPECT_TRUE(jump_1 != trace.end());
        EXPECT_EQ(jump_1->main_ia, FF(JUMP_PC_1));
    }

    // Return 3
    {
        auto return_3 = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) {
            return r.main_sel_op_internal_return == FF(1) && r.main_pc == FF(JUMP_PC_1);
        });
        EXPECT_TRUE(return_3 != trace.end());
        auto& return_3_row = trace.at(static_cast<size_t>(return_3 - trace.begin()));
        validate_internal_return(return_3_row, JUMP_PC_1, NEXT_PC_2);
    }

    // Return 4
    {
        auto return_4 = std::ranges::find_if(trace.begin(), trace.end(), [NEXT_PC_2](Row r) {
            return r.main_sel_op_internal_return == FF(1) && r.main_pc == FF(NEXT_PC_2);
        });
        EXPECT_TRUE(return_4 != trace.end());
        auto& return_4_row = trace.at(static_cast<size_t>(return_4 - trace.begin()));
        validate_internal_return(return_4_row, NEXT_PC_2, NEXT_PC_1);
    }

    // Halt row
    auto halt_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_external_return == FF(1); });

    EXPECT_TRUE(halt_row != trace.end());
    EXPECT_EQ(halt_row->main_pc, FF(RETURN_PC));

    validate_trace(std::move(trace), public_inputs);
}

} // namespace tests_avm
