#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_execution.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution = bb::avm2::execution<FF>;

TEST(ExecOpIdConstrainingTest, Jump)
{
    TestTraceContainer trace({
        {
            { C::execution_sel_execution, 1 },
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_JUMP },
            { C::execution_sel_jump, 1 },
        },
    });

    check_relation<execution>(trace, execution::SR_EXEC_OP_ID_DECOMPOSITION);

    // Negative test: untoggle jump selector
    trace.set(C::execution_sel_jump, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_EXEC_OP_ID_DECOMPOSITION),
                              "EXEC_OP_ID_DECOMPOSITION");

    // Negative test: toggle another selector
    trace.set(C::execution_sel_set, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_EXEC_OP_ID_DECOMPOSITION),
                              "EXEC_OP_ID_DECOMPOSITION");
}

// Show that the precomputed trace contains the correct execution operation id
// which maps to the correct opcode selectors.
TEST(ExecOpIdConstrainingTest, InteractionWithExecInstructionSpec)
{
    tracegen::PrecomputedTraceBuilder precomputed_builder;

    TestTraceContainer trace({
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::SET) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SET },
            { C::execution_sel_set, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::MOV) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_MOV },
            { C::execution_sel_mov, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::JUMP) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_JUMP },
            { C::execution_sel_jump, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::JUMPI) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_JUMPI },
            { C::execution_sel_jumpi, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::CALL) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_CALL },
            { C::execution_sel_call, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::STATICCALL) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_STATICCALL },
            { C::execution_sel_static_call, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::INTERNALCALL) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_INTERNALCALL },
            { C::execution_sel_internal_call, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::INTERNALRETURN) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_INTERNALRETURN },
            { C::execution_sel_internal_return, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::RETURN) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_RETURN },
            { C::execution_sel_return, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::REVERT) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_REVERT },
            { C::execution_sel_revert, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_ex_opcode, static_cast<uint8_t>(ExecutionOpCode::SUCCESSCOPY) },
            { C::execution_sel_execution, 1 },
            { C::execution_sel_instruction_fetching_success, 1 }, // Activate lookup
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SUCCESSCOPY },
            { C::execution_sel_success_copy, 1 },
        },
    });

    precomputed_builder.process_misc(
        trace, 256); // number of clk set to 256 to ensure it covers all the rows of exec instruction spec
    precomputed_builder.process_exec_instruction_spec(trace);

    // InteractiveDebugger debugger(trace);
    // debugger.run();

    check_relation<execution>(trace, execution::SR_EXEC_OP_ID_DECOMPOSITION);
    check_interaction<tracegen::ExecutionTraceBuilder, lookup_execution_exec_spec_read_settings>(trace);

    // Negative test: copy a wrong operation id
    trace.set(C::execution_subtrace_operation_id, 0, AVM_EXEC_OP_ID_JUMP);
    check_interaction<tracegen::ExecutionTraceBuilder, lookup_execution_exec_spec_read_settings>(trace);
    // EXPECT_THROW_WITH_MESSAGE(
    //     (check_interaction<tracegen::ExecutionTraceBuilder, lookup_execution_exec_spec_read_settings>(trace)),
    //     "Failed.*LOOKUP_EXECUTION_EXEC_SPEC_READ.*Could not find tuple in destination.");
}

} // namespace
} // namespace bb::avm2::constraining
