#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_execution.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::ExecutionEvent;
using testing::InstructionBuilder;
using tracegen::ExecutionTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::SUBTRACE_INFO_MAP;
using tracegen::SubtraceSel;

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution = bb::avm2::execution<FF>;

constexpr std::array<WireOpCode, 22> WIRE_OPCODES = {
    WireOpCode::GETENVVAR_16,    WireOpCode::SET_8,          WireOpCode::SET_16,    WireOpCode::SET_32,
    WireOpCode::SET_64,          WireOpCode::SET_128,        WireOpCode::SET_FF,    WireOpCode::MOV_8,
    WireOpCode::MOV_16,          WireOpCode::JUMP_32,        WireOpCode::JUMPI_32,  WireOpCode::CALL,
    WireOpCode::INTERNALCALL,    WireOpCode::INTERNALRETURN, WireOpCode::RETURN,    WireOpCode::SUCCESSCOPY,
    WireOpCode::STATICCALL,      WireOpCode::REVERT_8,       WireOpCode::REVERT_16, WireOpCode::RETURNDATASIZE,
    WireOpCode::NULLIFIEREXISTS, WireOpCode::EMITNULLIFIER,
};

constexpr std::array<uint32_t, 22> OPERATION_IDS = {
    AVM_EXEC_OP_ID_GETENVVAR,
    AVM_EXEC_OP_ID_SET,
    AVM_EXEC_OP_ID_SET,
    AVM_EXEC_OP_ID_SET,
    AVM_EXEC_OP_ID_SET,
    AVM_EXEC_OP_ID_SET,
    AVM_EXEC_OP_ID_SET,
    AVM_EXEC_OP_ID_MOV,
    AVM_EXEC_OP_ID_MOV,
    AVM_EXEC_OP_ID_JUMP,
    AVM_EXEC_OP_ID_JUMPI,
    AVM_EXEC_OP_ID_CALL,
    AVM_EXEC_OP_ID_INTERNALCALL,
    AVM_EXEC_OP_ID_INTERNALRETURN,
    AVM_EXEC_OP_ID_RETURN,
    AVM_EXEC_OP_ID_SUCCESSCOPY,
    AVM_EXEC_OP_ID_STATICCALL,
    AVM_EXEC_OP_ID_REVERT,
    AVM_EXEC_OP_ID_REVERT,
    AVM_EXEC_OP_ID_RETURNDATASIZE,
    AVM_EXEC_OP_ID_NULLIFIEREXISTS,
    AVM_EXEC_OP_ID_EMITNULLIFIER,
};

constexpr std::array<C, 22> SELECTOR_COLUMNS = {
    C::execution_sel_get_env_var,
    C::execution_sel_set,
    C::execution_sel_set,
    C::execution_sel_set,
    C::execution_sel_set,
    C::execution_sel_set,
    C::execution_sel_set,
    C::execution_sel_mov,
    C::execution_sel_mov,
    C::execution_sel_jump,
    C::execution_sel_jumpi,
    C::execution_sel_call,
    C::execution_sel_internal_call,
    C::execution_sel_internal_return,
    C::execution_sel_return,
    C::execution_sel_success_copy,
    C::execution_sel_static_call,
    C::execution_sel_revert,
    C::execution_sel_revert,
    C::execution_sel_returndata_size,
    C::execution_sel_nullifier_exists,
    C::execution_sel_emit_nullifier,
};

// Ensure that WIRE_OPCODES contains all wire opcodes which have an execution opcode belonging
// to the execution subtrace.
TEST(ExecOpIdConstrainingTest, WireOpcodeListCompleteness)
{
    for (uint8_t opcode = 0; opcode < static_cast<uint8_t>(WireOpCode::LAST_OPCODE_SENTINEL); opcode++) {
        const auto wire_opcode = static_cast<WireOpCode>(opcode);
        const auto& exec_opcode = WIRE_INSTRUCTION_SPEC.at(wire_opcode).exec_opcode;

        if (SUBTRACE_INFO_MAP.contains(exec_opcode)) {
            const auto& subtrace_info = SUBTRACE_INFO_MAP.at(exec_opcode);
            if (subtrace_info.subtrace_selector == SubtraceSel::EXECUTION) {
                EXPECT_TRUE(std::find(WIRE_OPCODES.begin(), WIRE_OPCODES.end(), wire_opcode) != WIRE_OPCODES.end());
            }
        }
    }
}

// Magic constant ensuring that for any index i, the index i + INCREMENT_FOR_NEGATIVE_TEST modulo
// WIRE_OPCODES.size() has a different value in OPERATION_IDS and SELECTOR_COLUMNS. 6 corresponds to the
// number of SET wire opcodes. This is the execution opcode with the largest number of wire opcodes.
constexpr size_t INCREMENT_FOR_NEGATIVE_TEST = 6;

TEST(ExecOpIdConstrainingTest, Decomposition)
{
    for (size_t i = 0; i < WIRE_OPCODES.size(); i++) {
        TestTraceContainer trace({
            {
                { C::execution_sel_execution, 1 },
                { C::execution_subtrace_operation_id, OPERATION_IDS.at(i) },
                { SELECTOR_COLUMNS.at(i), 1 },
            },
        });

        check_relation<execution>(trace, execution::SR_EXEC_OP_ID_DECOMPOSITION);

        // Negative test: untoggle the selector
        trace.set(SELECTOR_COLUMNS.at(i), 0, 0);
        EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_EXEC_OP_ID_DECOMPOSITION),
                                  "EXEC_OP_ID_DECOMPOSITION");

        // Negative test: toggle another selector
        trace.set(SELECTOR_COLUMNS.at((i + INCREMENT_FOR_NEGATIVE_TEST) % WIRE_OPCODES.size()), 0, 1);
        EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_EXEC_OP_ID_DECOMPOSITION),
                                  "EXEC_OP_ID_DECOMPOSITION");
    }
}

// Show that the precomputed trace contains the correct execution operation id
// which maps to the correct opcode selectors.
// Show also that execution relations are satisfied.
TEST(ExecOpIdConstrainingTest, InteractionWithExecInstructionSpec)
{
    PrecomputedTraceBuilder precomputed_builder;

    std::vector<ExecutionEvent> events;
    events.reserve(WIRE_OPCODES.size());
    for (const auto& wire_opcode : WIRE_OPCODES) {
        events.push_back({
            .wire_instruction = InstructionBuilder(wire_opcode).build(),
        });
    }

    TestTraceContainer trace;
    ExecutionTraceBuilder exec_builder;
    uint32_t row = 1;

    for (const auto& event : events) {
        exec_builder.process_execution_spec(event, trace, row);
        row++;
    }

    // Check that the operation ids and relevant selectors are toggled.
    for (size_t i = 0; i < WIRE_OPCODES.size(); i++) {
        ASSERT_EQ(trace.get(C::execution_subtrace_operation_id, static_cast<uint32_t>(i + 1)), OPERATION_IDS.at(i));
        ASSERT_EQ(trace.get(SELECTOR_COLUMNS.at(i), static_cast<uint32_t>(i + 1)), 1);
        ASSERT_EQ(trace.get(C::execution_sel_execution, static_cast<uint32_t>(i + 1)), 1);
    }

    // Activate the lookup selector execution_sel_instruction_fetching_success for each row.
    // Activate the execution selector execution_sel for each row.
    // Set the execution opcode for each row.
    for (size_t i = 0; i < WIRE_OPCODES.size(); i++) {
        trace.set(C::execution_sel_instruction_fetching_success, static_cast<uint32_t>(i + 1), 1);
        trace.set(C::execution_sel, static_cast<uint32_t>(i + 1), 1);
        trace.set(C::execution_ex_opcode,
                  static_cast<uint32_t>(i + 1),
                  static_cast<uint8_t>(events.at(i).wire_instruction.get_exec_opcode()));
    }

    precomputed_builder.process_misc(
        trace, 256); // number of clk set to 256 to ensure it covers all the rows of exec instruction spec
    precomputed_builder.process_exec_instruction_spec(trace);

    check_relation<execution>(trace, execution::SR_EXEC_OP_ID_DECOMPOSITION);
    check_interaction<ExecutionTraceBuilder, lookup_execution_exec_spec_read_settings>(trace);

    // Negative test: copy a wrong operation id
    for (size_t i = 0; i < WIRE_OPCODES.size(); i++) {
        auto mutated_trace = trace;
        mutated_trace.set(C::execution_subtrace_operation_id,
                          static_cast<uint32_t>(i + 1),
                          OPERATION_IDS.at((i + INCREMENT_FOR_NEGATIVE_TEST) % WIRE_OPCODES.size()));
        EXPECT_THROW_WITH_MESSAGE(
            (check_interaction<ExecutionTraceBuilder, lookup_execution_exec_spec_read_settings>(mutated_trace)),
            "Failed.*LOOKUP_EXECUTION_EXEC_SPEC_READ.*Could not find tuple in destination.");
    }
}

} // namespace
} // namespace bb::avm2::constraining
