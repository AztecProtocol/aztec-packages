#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/instr_fetching.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::BytecodeTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using instr_fetching = bb::avm2::instr_fetching<FF>;
using simulation::Instruction;
using simulation::InstructionFetchingEvent;
using simulation::Operand;
using testing::random_bytes;

TEST(InstrFetchingConstrainingTest, EmptyRow)
{
    check_relation<instr_fetching>(testing::empty_trace());
}

// Basic positive test with a hardcoded bytecode for ADD_8
TEST(InstrFetchingConstrainingTest, Add8WithTraceGen)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;
    Instruction add_8_instruction = {
        .opcode = WireOpCode::ADD_8,
        .indirect = 3,
        .operands = { Operand::u8(0x34), Operand::u8(0x35), Operand::u8(0x36) },
    };

    std::vector<uint8_t> bytecode = add_8_instruction.serialize();

    builder.process_instruction_fetching({ { .bytecode_id = 1,
                                             .pc = 0,
                                             .instruction = add_8_instruction,
                                             .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                         trace);

    EXPECT_EQ(trace.get_num_rows(), 1);
    check_relation<instr_fetching>(trace);
}

// Basic positive test with a hardcoded bytecode for ECADD
// Cover the longest amount of operands.
TEST(InstrFetchingConstrainingTest, EcaddWithTraceGen)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;
    Instruction ecadd_instruction = {
        .opcode = WireOpCode::ECADD,
        .indirect = 0x1f1f,
        .operands = { Operand::u16(0x1279),
                      Operand::u16(0x127a),
                      Operand::u16(0x127b),
                      Operand::u16(0x127c),
                      Operand::u16(0x127d),
                      Operand::u16(0x127e),
                      Operand::u16(0x127f) },
    };

    std::vector<uint8_t> bytecode = ecadd_instruction.serialize();
    builder.process_instruction_fetching({ { .bytecode_id = 1,
                                             .pc = 0,
                                             .instruction = ecadd_instruction,
                                             .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                         trace);

    EXPECT_EQ(trace.get_num_rows(), 1);
    check_relation<instr_fetching>(trace);
}

// Helper routine generating a vector of instruction fetching events for each
// opcode.
std::vector<InstructionFetchingEvent> gen_instr_events_each_opcode()
{
    std::vector<uint8_t> bytecode;
    std::vector<Instruction> instructions;
    constexpr auto num_opcodes = static_cast<size_t>(WireOpCode::LAST_OPCODE_SENTINEL);
    instructions.reserve(num_opcodes);
    std::array<uint32_t, num_opcodes> pc_positions;

    for (size_t i = 0; i < num_opcodes; i++) {
        pc_positions.at(i) = static_cast<uint32_t>(bytecode.size());
        const auto instr = testing::random_instruction(static_cast<WireOpCode>(i));
        instructions.emplace_back(instr);
        const auto instruction_bytes = instr.serialize();
        bytecode.insert(bytecode.end(),
                        std::make_move_iterator(instruction_bytes.begin()),
                        std::make_move_iterator(instruction_bytes.end()));
    }

    const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(std::move(bytecode));
    // Always use *bytecode_ptr from now on instead of bytecode as this one was moved.

    std::vector<InstructionFetchingEvent> instr_events;
    instr_events.reserve(num_opcodes);
    for (size_t i = 0; i < num_opcodes; i++) {
        instr_events.emplace_back(InstructionFetchingEvent{
            .bytecode_id = 1, .pc = pc_positions.at(i), .instruction = instructions.at(i), .bytecode = bytecode_ptr });
    }
    return instr_events;
}

// Positive test for each opcode. We assume that decode instruction is working correctly.
// It works as long as the relations are not constraining the correct range for TAG nor indirect.
TEST(InstrFetchingConstrainingTest, EachOpcodeWithTraceGen)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    builder.process_instruction_fetching(gen_instr_events_each_opcode(), trace);

    constexpr auto num_opcodes = static_cast<size_t>(WireOpCode::LAST_OPCODE_SENTINEL);
    EXPECT_EQ(trace.get_num_rows(), num_opcodes);
    check_relation<instr_fetching>(trace);
}

// Negative test about decomposition of operands. We mutate correct operand values in the trace.
// This also covers wrong operands which are not "involved" by the instruction.
// We perform this for a random instruction for opcodes: REVERT_16, CAST_8, TORADIXBE
TEST(InstrFetchingConstrainingTest, NegativeWrongOperand)
{
    BytecodeTraceBuilder builder;

    std::vector<WireOpCode> opcodes = { WireOpCode::REVERT_16, WireOpCode::CAST_8, WireOpCode::TORADIXBE };
    std::vector<size_t> sub_relations = {
        instr_fetching::SR_INDIRECT_BYTES_DECOMPOSITION, instr_fetching::SR_OP1_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP2_BYTES_DECOMPOSITION,      instr_fetching::SR_OP3_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP4_BYTES_DECOMPOSITION,      instr_fetching::SR_OP5_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP6_BYTES_DECOMPOSITION,      instr_fetching::SR_OP7_BYTES_DECOMPOSITION,
    };

    constexpr std::array<C, 8> operand_cols = {
        C::instr_fetching_indirect, C::instr_fetching_op1, C::instr_fetching_op2, C::instr_fetching_op3,
        C::instr_fetching_op4,      C::instr_fetching_op5, C::instr_fetching_op6, C::instr_fetching_op7,
    };

    for (const auto& opcode : opcodes) {
        TestTraceContainer trace;
        const auto instr = testing::random_instruction(opcode);
        builder.process_instruction_fetching(
            { { .bytecode_id = 1,
                .pc = 0,
                .instruction = instr,
                .bytecode = std::make_shared<std::vector<uint8_t>>(instr.serialize()) } },
            trace);
        check_relation<instr_fetching>(trace);

        EXPECT_EQ(trace.get_num_rows(), 1);

        for (size_t i = 0; i < operand_cols.size(); i++) {
            auto mutated_trace = trace;
            const FF mutated_operand = trace.get(operand_cols.at(i), 0) + 1; // Mutate to value + 1
            mutated_trace.set(operand_cols.at(i), 0, mutated_operand);
            EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(mutated_trace, sub_relations.at(i)),
                                      instr_fetching::get_subrelation_label(sub_relations.at(i)));
        }
    }
}

// Positive test for interaction with instruction spec table using same events as for the test
// EachOpcodeWithTraceGen, i.e., one event/row is generated per wire opcode.
// It works as long as the relations are not constraining the correct range for TAG nor indirect.
TEST(InstrFetchingConstrainingTest, WireInstructionSpecInteractions)
{
    using wire_instr_spec_lookup = lookup_instr_fetching_wire_instruction_info_relation<FF>;

    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;

    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_wire_instruction_spec(trace);
    bytecode_builder.process_instruction_fetching(gen_instr_events_each_opcode(), trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    tracegen::LookupIntoIndexedByClk<wire_instr_spec_lookup::Settings>().process(trace);

    check_relation<instr_fetching>(trace);
    check_interaction<wire_instr_spec_lookup>(trace);
}

// Positive test for the interaction with bytecode decomposition table.
// One event/row is generated per wire opcode (same as for test WireInstructionSpecInteractions).
// It works as long as the relations are not constraining the correct range for TAG nor indirect.
TEST(InstrFetchingConstrainingTest, BcDecompositionInteractions)
{
    using bc_decomposition_lookup = lookup_instr_fetching_bytes_from_bc_dec_relation<FF>;

    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;

    const auto instr_fetch_events = gen_instr_events_each_opcode();
    bytecode_builder.process_instruction_fetching(instr_fetch_events, trace);
    bytecode_builder.process_decomposition({ {
                                               .bytecode_id = instr_fetch_events.at(0).bytecode_id,
                                               .bytecode = instr_fetch_events.at(0).bytecode,
                                           } },
                                           trace);

    tracegen::LookupIntoDynamicTableSequential<bc_decomposition_lookup::Settings>().process(trace);

    check_relation<instr_fetching>(trace);
    check_interaction<bc_decomposition_lookup>(trace);
}

// Negative interaction test with some values not matching the instruction spec table.
TEST(InstrFetchingConstrainingTest, NegativeWrongWireInstructionSpecInteractions)
{
    using wire_instr_spec_lookup = lookup_instr_fetching_wire_instruction_info_relation<FF>;
    using tracegen::LookupIntoIndexedByClk;

    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;

    // Some arbitrary chosen opcodes. We limit to one as this unit test is costly.
    // Test works if the following vector is extended to other opcodes though.
    std::vector<WireOpCode> opcodes = { WireOpCode::CALLDATACOPY };

    for (const auto& opcode : opcodes) {
        TestTraceContainer trace;
        const auto instr = testing::random_instruction(opcode);
        bytecode_builder.process_instruction_fetching(
            { { .bytecode_id = 1,
                .pc = 0,
                .instruction = instr,
                .bytecode = std::make_shared<std::vector<uint8_t>>(instr.serialize()) } },
            trace);
        precomputed_builder.process_wire_instruction_spec(trace);
        precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

        LookupIntoIndexedByClk<wire_instr_spec_lookup::Settings>().process(trace);

        ASSERT_EQ(trace.get(C::lookup_instr_fetching_wire_instruction_info_counts, static_cast<uint32_t>(opcode)), 1);
        check_interaction<wire_instr_spec_lookup>(trace);

        constexpr std::array<C, 20> mutated_cols = {
            C::instr_fetching_exec_opcode,  C::instr_fetching_instr_size_in_bytes, C::instr_fetching_sel_op_dc_0,
            C::instr_fetching_sel_op_dc_1,  C::instr_fetching_sel_op_dc_2,         C::instr_fetching_sel_op_dc_3,
            C::instr_fetching_sel_op_dc_4,  C::instr_fetching_sel_op_dc_5,         C::instr_fetching_sel_op_dc_6,
            C::instr_fetching_sel_op_dc_7,  C::instr_fetching_sel_op_dc_8,         C::instr_fetching_sel_op_dc_9,
            C::instr_fetching_sel_op_dc_10, C::instr_fetching_sel_op_dc_11,        C::instr_fetching_sel_op_dc_12,
            C::instr_fetching_sel_op_dc_13, C::instr_fetching_sel_op_dc_14,        C::instr_fetching_sel_op_dc_15,
            C::instr_fetching_sel_op_dc_16, C::instr_fetching_sel_op_dc_17,
        };

        // Mutate execution opcode
        for (const auto& col : mutated_cols) {
            auto mutated_trace = trace;
            const FF mutated_value = trace.get(col, 0) + 1; // Mutate to value + 1
            mutated_trace.set(col, 0, mutated_value);

            // We do not need to re-run LookupIntoIndexedByClk<wire_instr_spec_lookup::Settings>().process(trace);
            // because we never mutate the indexing column for this lookup (clk) and for this lookup
            // find_in_dst only uses column C::instr_fetching_bd0 mapped to (clk). So, the counts are still valid.

            EXPECT_THROW_WITH_MESSAGE(check_interaction<wire_instr_spec_lookup>(mutated_trace),
                                      "Relation.*WIRE_INSTRUCTION_INFO.* ACCUMULATION.* is non-zero");
        }
    }
}

// Negative interaction test with some values not matching the bytecode decomposition table.
TEST(InstrFetchingConstrainingTest, NegativeWrongBcDecompositionInteractions)
{
    using bc_decomposition_lookup = lookup_instr_fetching_bytes_from_bc_dec_relation<FF>;
    using tracegen::LookupIntoDynamicTableSequential;

    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;

    // Some arbitrary chosen opcodes. We limit to one as this unit test is costly.
    // Test works if the following vector is extended to other opcodes though.
    std::vector<WireOpCode> opcodes = { WireOpCode::STATICCALL };

    for (const auto& opcode : opcodes) {
        TestTraceContainer trace;
        const auto instr = testing::random_instruction(opcode);
        auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(instr.serialize());
        bytecode_builder.process_instruction_fetching({ {
                                                          .bytecode_id = 1,
                                                          .pc = 0,
                                                          .instruction = instr,
                                                          .bytecode = bytecode_ptr,
                                                      } },
                                                      trace);
        bytecode_builder.process_decomposition({ {
                                                   .bytecode_id = 1,
                                                   .bytecode = bytecode_ptr,
                                               } },
                                               trace);

        auto valid_trace = trace; // Keep original trace before lookup processing
        LookupIntoDynamicTableSequential<bc_decomposition_lookup::Settings>().process(valid_trace);
        check_interaction<bc_decomposition_lookup>(valid_trace);

        constexpr std::array<C, 39> mutated_cols = {
            C::instr_fetching_pc,   C::instr_fetching_bytecode_id, C::instr_fetching_bd0,  C::instr_fetching_bd1,
            C::instr_fetching_bd2,  C::instr_fetching_bd3,         C::instr_fetching_bd4,  C::instr_fetching_bd5,
            C::instr_fetching_bd6,  C::instr_fetching_bd7,         C::instr_fetching_bd8,  C::instr_fetching_bd9,
            C::instr_fetching_bd10, C::instr_fetching_bd11,        C::instr_fetching_bd12, C::instr_fetching_bd13,
            C::instr_fetching_bd14, C::instr_fetching_bd15,        C::instr_fetching_bd16, C::instr_fetching_bd17,
            C::instr_fetching_bd18, C::instr_fetching_bd19,        C::instr_fetching_bd20, C::instr_fetching_bd21,
            C::instr_fetching_bd22, C::instr_fetching_bd23,        C::instr_fetching_bd24, C::instr_fetching_bd25,
            C::instr_fetching_bd26, C::instr_fetching_bd27,        C::instr_fetching_bd28, C::instr_fetching_bd29,
            C::instr_fetching_bd30, C::instr_fetching_bd31,        C::instr_fetching_bd32, C::instr_fetching_bd33,
            C::instr_fetching_bd34, C::instr_fetching_bd35,        C::instr_fetching_bd36,
        };

        // Mutate execution opcode
        for (const auto& col : mutated_cols) {
            auto mutated_trace = trace;
            const FF mutated_value = trace.get(col, 0) + 1; // Mutate to value + 1
            mutated_trace.set(col, 0, mutated_value);

            // This sets the length of the inverse polynomial via SetDummyInverses, so we still need to call this even
            // though we know it will fail.
            EXPECT_THROW_WITH_MESSAGE(
                LookupIntoDynamicTableSequential<bc_decomposition_lookup::Settings>().process(mutated_trace),
                "Failed.*BYTES_FROM_BC_DEC. Could not find tuple in destination.");

            EXPECT_THROW_WITH_MESSAGE(check_interaction<bc_decomposition_lookup>(mutated_trace),
                                      "Relation.*BYTES_FROM_BC_DEC.* ACCUMULATION.* is non-zero");
        }
    }
}

} // namespace
} // namespace bb::avm2::constraining
