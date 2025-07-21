#include <algorithm>
#include <cstddef>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <sys/types.h>
#include <vector>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using C = Column;

using simulation::BytecodeId;
using simulation::Instruction;
using simulation::InstructionFetchingEvent;

TEST(BytecodeTraceGenTest, BasicShortLength)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    builder.process_decomposition(
        {
            simulation::BytecodeDecompositionEvent{
                .bytecode_id = 43,
                .bytecode = std::make_shared<std::vector<uint8_t>>(std::vector<uint8_t>{ 12, 31, 5, 2 }),
            },
        },
        trace);
    auto rows = trace.as_rows();

    // One extra empty row is prepended. Note that precomputed_first_row is not set through process_decomposition()
    // because it pertains to another subtrace.
    ASSERT_EQ(rows.size(), 4 + 1);

    // We do not inspect row at index 0 as it is completely empty.
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(bc_decomposition_id, 43),
                      ROW_FIELD_EQ(bc_decomposition_bytes, 12),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_1, 31),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_2, 5),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_3, 2),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_4, 0),
                      ROW_FIELD_EQ(bc_decomposition_pc, 0),
                      ROW_FIELD_EQ(bc_decomposition_bytes_remaining, 4),
                      ROW_FIELD_EQ(bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 4),
                      ROW_FIELD_EQ(bc_decomposition_bytes_to_read, 4),
                      ROW_FIELD_EQ(bc_decomposition_last_of_contract, 0)));

    EXPECT_THAT(rows.at(2),
                AllOf(ROW_FIELD_EQ(bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(bc_decomposition_id, 43),
                      ROW_FIELD_EQ(bc_decomposition_bytes, 31),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_1, 5),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_2, 2),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_3, 0),
                      ROW_FIELD_EQ(bc_decomposition_pc, 1),
                      ROW_FIELD_EQ(bc_decomposition_bytes_remaining, 3),
                      ROW_FIELD_EQ(bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 3),
                      ROW_FIELD_EQ(bc_decomposition_bytes_to_read, 3),
                      ROW_FIELD_EQ(bc_decomposition_last_of_contract, 0)));

    EXPECT_THAT(rows.at(3),
                AllOf(ROW_FIELD_EQ(bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(bc_decomposition_id, 43),
                      ROW_FIELD_EQ(bc_decomposition_bytes, 5),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_1, 2),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_2, 0),
                      ROW_FIELD_EQ(bc_decomposition_pc, 2),
                      ROW_FIELD_EQ(bc_decomposition_bytes_remaining, 2),
                      ROW_FIELD_EQ(bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 2),
                      ROW_FIELD_EQ(bc_decomposition_bytes_to_read, 2),
                      ROW_FIELD_EQ(bc_decomposition_last_of_contract, 0)));

    EXPECT_THAT(rows.at(4),
                AllOf(ROW_FIELD_EQ(bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(bc_decomposition_id, 43),
                      ROW_FIELD_EQ(bc_decomposition_bytes, 2),
                      ROW_FIELD_EQ(bc_decomposition_bytes_pc_plus_1, 0),
                      ROW_FIELD_EQ(bc_decomposition_pc, 3),
                      ROW_FIELD_EQ(bc_decomposition_bytes_remaining, 1),
                      ROW_FIELD_EQ(bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 1),
                      ROW_FIELD_EQ(bc_decomposition_bytes_to_read, 1),
                      ROW_FIELD_EQ(bc_decomposition_last_of_contract, 1)));
}

TEST(BytecodeTraceGenTest, BasicLongerThanWindowSize)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    constexpr auto bytecode_size = DECOMPOSE_WINDOW_SIZE + 8;
    std::vector<uint8_t> bytecode(bytecode_size);
    const uint8_t first_byte = 17; // Arbitrary start value and we increment by one. We will hit invalid opcodes
                                   // but it should not matter.

    for (uint8_t i = 0; i < bytecode_size; i++) {
        bytecode[i] = i + first_byte;
    }

    builder.process_decomposition(
        {
            simulation::BytecodeDecompositionEvent{
                .bytecode_id = 7,
                .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode),
            },
        },
        trace);
    auto rows = trace.as_rows();

    // One extra empty row is prepended. Note that precomputed_first_row is not set through process_decomposition()
    // because it pertains to another subtrace.
    ASSERT_EQ(rows.size(), bytecode_size + 1);

    // We do not inspect row at index 0 as it is completely empty.
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(bc_decomposition_id, 7),
                      ROW_FIELD_EQ(bc_decomposition_bytes, first_byte),
                      ROW_FIELD_EQ(bc_decomposition_pc, 0),
                      ROW_FIELD_EQ(bc_decomposition_bytes_remaining, bytecode_size),
                      ROW_FIELD_EQ(bc_decomposition_sel_overflow_correction_needed, 0),
                      ROW_FIELD_EQ(bc_decomposition_abs_diff, 8),
                      ROW_FIELD_EQ(bc_decomposition_bytes_to_read, DECOMPOSE_WINDOW_SIZE),
                      ROW_FIELD_EQ(bc_decomposition_last_of_contract, 0)));

    // We are interested to inspect the boundary aroud bytes_remaining == windows size

    EXPECT_THAT(rows.at(9),
                AllOf(ROW_FIELD_EQ(bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(bc_decomposition_id, 7),
                      ROW_FIELD_EQ(bc_decomposition_bytes, first_byte + 8),
                      ROW_FIELD_EQ(bc_decomposition_pc, 8),
                      ROW_FIELD_EQ(bc_decomposition_bytes_remaining, DECOMPOSE_WINDOW_SIZE),
                      ROW_FIELD_EQ(bc_decomposition_sel_overflow_correction_needed, 0),
                      ROW_FIELD_EQ(bc_decomposition_abs_diff, 0),
                      ROW_FIELD_EQ(bc_decomposition_bytes_to_read, DECOMPOSE_WINDOW_SIZE),
                      ROW_FIELD_EQ(bc_decomposition_last_of_contract, 0)));

    EXPECT_THAT(rows.at(10),
                AllOf(ROW_FIELD_EQ(bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(bc_decomposition_id, 7),
                      ROW_FIELD_EQ(bc_decomposition_bytes, first_byte + 9),
                      ROW_FIELD_EQ(bc_decomposition_pc, 9),
                      ROW_FIELD_EQ(bc_decomposition_bytes_remaining, DECOMPOSE_WINDOW_SIZE - 1),
                      ROW_FIELD_EQ(bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(bc_decomposition_abs_diff, 1),
                      ROW_FIELD_EQ(bc_decomposition_bytes_to_read, DECOMPOSE_WINDOW_SIZE - 1),
                      ROW_FIELD_EQ(bc_decomposition_last_of_contract, 0)));

    // Last row
    EXPECT_THAT(rows.at(bytecode_size),
                AllOf(ROW_FIELD_EQ(bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(bc_decomposition_id, 7),
                      ROW_FIELD_EQ(bc_decomposition_bytes, first_byte + bytecode_size - 1),
                      ROW_FIELD_EQ(bc_decomposition_pc, bytecode_size - 1),
                      ROW_FIELD_EQ(bc_decomposition_bytes_remaining, 1),
                      ROW_FIELD_EQ(bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 1),
                      ROW_FIELD_EQ(bc_decomposition_bytes_to_read, 1),
                      ROW_FIELD_EQ(bc_decomposition_last_of_contract, 1)));
}

TEST(BytecodeTraceGenTest, MultipleEvents)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    std::vector<uint32_t> bc_sizes = { DECOMPOSE_WINDOW_SIZE + 2, 17, DECOMPOSE_WINDOW_SIZE, 1 };
    std::vector<std::vector<uint8_t>> bytecodes(4);

    std::transform(bc_sizes.begin(), bc_sizes.end(), bytecodes.begin(), [](uint32_t bc_size) -> std::vector<uint8_t> {
        std::vector<uint8_t> bytecode(bc_size);
        for (uint8_t i = 0; i < bc_size; i++) {
            bytecode[i] = i * i; // Arbitrary bytecode that we will not inspect below
        }

        return bytecode;
    });

    builder.process_decomposition(
        {
            simulation::BytecodeDecompositionEvent{
                .bytecode_id = 0,
                .bytecode = std::make_shared<std::vector<uint8_t>>(bytecodes[0]),
            },
            simulation::BytecodeDecompositionEvent{
                .bytecode_id = 1,
                .bytecode = std::make_shared<std::vector<uint8_t>>(bytecodes[1]),
            },
            simulation::BytecodeDecompositionEvent{
                .bytecode_id = 2,
                .bytecode = std::make_shared<std::vector<uint8_t>>(bytecodes[2]),
            },
            simulation::BytecodeDecompositionEvent{
                .bytecode_id = 3,
                .bytecode = std::make_shared<std::vector<uint8_t>>(bytecodes[3]),
            },
        },
        trace);
    auto rows = trace.as_rows();

    // One extra empty row is prepended.
    ASSERT_EQ(rows.size(), 2 * DECOMPOSE_WINDOW_SIZE + 20 + 1);

    size_t row_pos = 1;
    for (uint32_t i = 0; i < 4; i++) {
        for (uint32_t j = 0; j < bc_sizes[i]; j++) {
            const auto bytes_rem = bc_sizes[i] - j;
            EXPECT_THAT(rows.at(row_pos),
                        AllOf(ROW_FIELD_EQ(bc_decomposition_sel, 1),
                              ROW_FIELD_EQ(bc_decomposition_id, i),
                              ROW_FIELD_EQ(bc_decomposition_pc, j),
                              ROW_FIELD_EQ(bc_decomposition_bytes_remaining, bytes_rem),
                              ROW_FIELD_EQ(bc_decomposition_sel_overflow_correction_needed,
                                           bytes_rem < DECOMPOSE_WINDOW_SIZE ? 1 : 0),
                              ROW_FIELD_EQ(bc_decomposition_abs_diff,
                                           bytes_rem < DECOMPOSE_WINDOW_SIZE ? DECOMPOSE_WINDOW_SIZE - bytes_rem
                                                                             : bytes_rem - DECOMPOSE_WINDOW_SIZE),
                              ROW_FIELD_EQ(bc_decomposition_bytes_to_read, std::min(DECOMPOSE_WINDOW_SIZE, bytes_rem)),
                              ROW_FIELD_EQ(bc_decomposition_last_of_contract, j == bc_sizes[i] - 1 ? 1 : 0)));
            row_pos++;
        }
    }
}

TEST(BytecodeTraceGenTest, BasicHashing)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    builder.process_hashing(
        {
            simulation::BytecodeHashingEvent{
                .bytecode_id = 0,
                .bytecode_length = 6,
                .bytecode_fields = { 10, 20 },
            },
        },
        trace);
    const auto rows = trace.as_rows();

    // One extra empty row is prepended.
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(bc_hashing_sel, 1),
                      ROW_FIELD_EQ(bc_hashing_start, 1),
                      ROW_FIELD_EQ(bc_hashing_latch, 0),
                      ROW_FIELD_EQ(bc_hashing_bytecode_id, 0),
                      ROW_FIELD_EQ(bc_hashing_pc_index, 0),
                      ROW_FIELD_EQ(bc_hashing_packed_field, 10),
                      ROW_FIELD_EQ(bc_hashing_incremental_hash, 6)));

    // Latched row (note we leave out the resulting hash in this test)
    EXPECT_THAT(rows.at(2),
                AllOf(ROW_FIELD_EQ(bc_hashing_sel, 1),
                      ROW_FIELD_EQ(bc_hashing_start, 0),
                      ROW_FIELD_EQ(bc_hashing_latch, 1),
                      ROW_FIELD_EQ(bc_hashing_bytecode_id, 0),
                      ROW_FIELD_EQ(bc_hashing_pc_index, 31),
                      ROW_FIELD_EQ(bc_hashing_packed_field, 20)));
}

std::vector<Instruction> gen_random_instructions(std::span<const WireOpCode> opcodes)
{
    std::vector<Instruction> instructions;
    instructions.reserve(opcodes.size());
    for (const auto& opcode : opcodes) {
        instructions.emplace_back(testing::random_instruction(opcode));
    }
    return instructions;
}

std::vector<uint8_t> create_bytecode(std::span<const Instruction> instructions)
{
    std::vector<uint8_t> bytecode;
    for (const auto& instruction : instructions) {
        auto serialized_instruction = instruction.serialize();
        bytecode.insert(bytecode.end(),
                        std::make_move_iterator(serialized_instruction.begin()),
                        std::make_move_iterator(serialized_instruction.end()));
    }
    return bytecode;
}

std::vector<size_t> gen_pcs(std::span<const WireOpCode> opcodes)
{
    std::vector<size_t> pcs;
    pcs.reserve(opcodes.size());
    size_t pc = 0;
    for (const auto& opcode : opcodes) {
        pcs.emplace_back(pc);
        pc += WIRE_INSTRUCTION_SPEC.at(opcode).size_in_bytes;
    }
    return pcs;
}

std::vector<InstructionFetchingEvent> create_instruction_fetching_events(
    const std::vector<Instruction>& instructions,
    const std::vector<size_t>& pcs,
    const std::shared_ptr<std::vector<uint8_t>>& bytecode_ptr,
    const BytecodeId bytecode_id)
{
    std::vector<InstructionFetchingEvent> events;
    events.reserve(instructions.size());

    for (size_t i = 0; i < instructions.size(); i++) {
        events.emplace_back(InstructionFetchingEvent{
            .bytecode_id = bytecode_id,
            .pc = static_cast<uint32_t>(pcs.at(i)),
            .instruction = instructions.at(i),
            .bytecode = bytecode_ptr,
        });
    }
    return events;
}

// We build a random InstructionFetchingEvent for each wire opcode.
// We then verify that the bytes (bd0, bd1, ...) correspond to the serialized instruction.
TEST(BytecodeTraceGenTest, InstrDecompositionInBytesEachOpcode)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    constexpr std::array<C, 37> bd_columns = {
        C::instr_fetching_bd0,  C::instr_fetching_bd1,  C::instr_fetching_bd2,  C::instr_fetching_bd3,
        C::instr_fetching_bd4,  C::instr_fetching_bd5,  C::instr_fetching_bd6,  C::instr_fetching_bd7,
        C::instr_fetching_bd8,  C::instr_fetching_bd9,  C::instr_fetching_bd10, C::instr_fetching_bd11,
        C::instr_fetching_bd12, C::instr_fetching_bd13, C::instr_fetching_bd14, C::instr_fetching_bd15,
        C::instr_fetching_bd16, C::instr_fetching_bd17, C::instr_fetching_bd18, C::instr_fetching_bd19,
        C::instr_fetching_bd20, C::instr_fetching_bd21, C::instr_fetching_bd22, C::instr_fetching_bd23,
        C::instr_fetching_bd24, C::instr_fetching_bd25, C::instr_fetching_bd26, C::instr_fetching_bd27,
        C::instr_fetching_bd28, C::instr_fetching_bd29, C::instr_fetching_bd30, C::instr_fetching_bd31,
        C::instr_fetching_bd32, C::instr_fetching_bd33, C::instr_fetching_bd34, C::instr_fetching_bd35,
        C::instr_fetching_bd36,
    };

    constexpr std::array<C, 7> operand_columns = {
        C::instr_fetching_op1, C::instr_fetching_op2, C::instr_fetching_op3, C::instr_fetching_op4,
        C::instr_fetching_op5, C::instr_fetching_op6, C::instr_fetching_op7,
    };

    constexpr BytecodeId bytecode_id = 1;
    constexpr auto num_opcodes = static_cast<size_t>(WireOpCode::LAST_OPCODE_SENTINEL);

    std::vector<WireOpCode> opcodes;
    opcodes.reserve(num_opcodes);
    for (size_t i = 0; i < num_opcodes; i++) {
        opcodes.emplace_back(static_cast<WireOpCode>(i));
    }

    std::vector<Instruction> instructions = gen_random_instructions(opcodes);
    std::vector<size_t> pcs = gen_pcs(opcodes);
    std::vector<uint8_t> bytecode = create_bytecode(instructions);

    auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(bytecode);
    std::vector<InstructionFetchingEvent> events =
        create_instruction_fetching_events(instructions, pcs, bytecode_ptr, bytecode_id);

    builder.process_instruction_fetching(events, trace);

    for (uint32_t i = 0; i < num_opcodes; i++) {
        const auto instr = instructions.at(i);
        const auto instr_encoded = instr.serialize();
        const auto w_opcode = static_cast<WireOpCode>(i);

        // Check size_in_bytes column
        const auto expected_size_in_bytes = WIRE_INSTRUCTION_SPEC.at(w_opcode).size_in_bytes;
        ASSERT_EQ(instr_encoded.size(), expected_size_in_bytes);
        EXPECT_EQ(FF(expected_size_in_bytes), trace.get(C::instr_fetching_instr_size, i + 1));

        // Inspect each byte
        for (size_t j = 0; j < static_cast<size_t>(expected_size_in_bytes); j++) {
            EXPECT_EQ(FF(instr_encoded.at(j)), trace.get(bd_columns.at(j), i + 1));
        }

        // Check exection opcode
        EXPECT_EQ(FF(static_cast<uint8_t>(WIRE_INSTRUCTION_SPEC.at(w_opcode).exec_opcode)),
                  trace.get(C::instr_fetching_exec_opcode, i + 1));

        // Check indirect
        EXPECT_EQ(FF(instr.indirect), trace.get(C::instr_fetching_indirect, i + 1));

        // Check PCs
        EXPECT_EQ(FF(pcs.at(i)), trace.get(C::instr_fetching_pc, i + 1));

        // Check operands
        size_t operand_idx = 0;
        for (const auto& operand : instr.operands) {
            EXPECT_EQ(FF(operand), trace.get(operand_columns.at(operand_idx++), i + 1));
        }
    }
}

TEST(BytecodeTraceGenTest, InstrFetchingSingleBytecode)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    constexpr BytecodeId bytecode_id = 1;
    constexpr size_t num_of_opcodes = 10;
    constexpr std::array<WireOpCode, num_of_opcodes> opcodes = {
        WireOpCode::DIV_16,
        WireOpCode::RETURNDATASIZE,
        WireOpCode::AND_8,
        WireOpCode::EMITUNENCRYPTEDLOG,
        WireOpCode::CAST_16,
        WireOpCode::CALL,
        WireOpCode::SUCCESSCOPY,
        WireOpCode::MOV_8,
        WireOpCode::SHA256COMPRESSION,
        WireOpCode::INTERNALCALL,
    };

    std::vector<Instruction> instructions = gen_random_instructions(opcodes);
    std::vector<size_t> pcs = gen_pcs(opcodes);
    std::vector<uint8_t> bytecode = create_bytecode(instructions);

    std::vector<InstructionFetchingEvent> events = create_instruction_fetching_events(
        instructions, pcs, std::make_shared<std::vector<uint8_t>>(bytecode), bytecode_id);

    builder.process_instruction_fetching(events, trace);

    // One extra empty row is prepended.
    const auto rows = trace.as_rows();
    const auto bytecode_size = bytecode.size();
    EXPECT_EQ(rows.size(), num_of_opcodes + 1);

    for (size_t i = 0; i < num_of_opcodes; i++) {
        const auto pc = pcs.at(i);
        const auto instr_size = WIRE_INSTRUCTION_SPEC.at(opcodes.at(i)).size_in_bytes;
        const auto has_tag = WIRE_INSTRUCTION_SPEC.at(opcodes.at(i)).tag_operand_idx.has_value();
        const auto tag_is_op2 = has_tag ? WIRE_INSTRUCTION_SPEC.at(opcodes.at(i)).tag_operand_idx.value() == 2 : 0;
        const auto bytes_remaining = bytecode_size - pc;
        const auto bytes_to_read = std::min<size_t>(DECOMPOSE_WINDOW_SIZE, bytes_remaining);

        EXPECT_LE(instr_size, bytes_to_read);
        const auto instr_abs_diff = bytes_to_read - instr_size;

        EXPECT_LT(pc, bytecode_size);
        const auto pc_abs_diff = bytecode_size - pc - 1;

        ASSERT_LE(bytecode_size, UINT16_MAX);

        EXPECT_THAT(rows.at(i + 1),
                    AllOf(ROW_FIELD_EQ(instr_fetching_sel, 1),
                          ROW_FIELD_EQ(instr_fetching_pc, pc),
                          ROW_FIELD_EQ(instr_fetching_bd0, static_cast<uint8_t>(opcodes.at(i))),
                          ROW_FIELD_EQ(instr_fetching_bytecode_id, bytecode_id),
                          ROW_FIELD_EQ(instr_fetching_bytes_to_read, bytes_to_read),
                          ROW_FIELD_EQ(instr_fetching_bytecode_size, bytecode_size),
                          ROW_FIELD_EQ(instr_fetching_instr_size, instr_size),
                          ROW_FIELD_EQ(instr_fetching_instr_abs_diff, instr_abs_diff),
                          ROW_FIELD_EQ(instr_fetching_pc_abs_diff, pc_abs_diff),
                          ROW_FIELD_EQ(instr_fetching_pc_out_of_range, 0),
                          ROW_FIELD_EQ(instr_fetching_opcode_out_of_range, 0),
                          ROW_FIELD_EQ(instr_fetching_instr_out_of_range, 0),
                          ROW_FIELD_EQ(instr_fetching_tag_out_of_range, 0),
                          ROW_FIELD_EQ(instr_fetching_sel_parsing_err, 0),
                          ROW_FIELD_EQ(instr_fetching_sel_pc_in_range, 1),
                          ROW_FIELD_EQ(instr_fetching_sel_has_tag, has_tag),
                          ROW_FIELD_EQ(instr_fetching_sel_tag_is_op2, tag_is_op2),
                          ROW_FIELD_EQ(instr_fetching_sel_pc_in_range, 1)));
    }
}

// Test involving 3 different bytecode_id's for each 2 opcodes (same bytecode).
TEST(BytecodeTraceGenTest, InstrFetchingMultipleBytecodes)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    constexpr size_t num_of_opcodes = 2;
    constexpr std::array<WireOpCode, num_of_opcodes> opcodes = {
        WireOpCode::DIV_16,
        WireOpCode::RETURNDATASIZE,
    };

    std::vector<Instruction> instructions = gen_random_instructions(opcodes);
    std::vector<size_t> pcs = gen_pcs(opcodes);
    std::vector<uint8_t> bytecode = create_bytecode(instructions);

    std::vector<InstructionFetchingEvent> events;
    for (size_t i = 0; i < 3; i++) {
        auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(bytecode);
        auto new_events =
            create_instruction_fetching_events(instructions, pcs, bytecode_ptr, static_cast<BytecodeId>(i + 1));
        events.insert(events.end(), new_events.begin(), new_events.end());
    }

    builder.process_instruction_fetching(events, trace);

    // One extra empty row is prepended.
    const auto rows = trace.as_rows();
    EXPECT_EQ(rows.size(), 6 + 1);

    for (size_t i = 0; i < 3; i++) {
        EXPECT_THAT(rows.at(2 * i + 1), ROW_FIELD_EQ(instr_fetching_pc, 0));
    }
}

// Test which processes three single instruction events, each of one with a different parsing error.
// The bytecode can be filled with trivial bytes of size 20 with all bytes being increasing from 0 to 19.
// First byte at index 0 is set to LAST_OPCODE_SENTINEL + 1.
// Then consider for the instruction events pc = 0, pc = 19, pc = 38.
// pc == 0 will correspond to the error OPCODE_OUT_OF_RANGE
// pc == 19 will have INSTRUCTION_OUT_OF_RANGE
// pc == 38 will have PC_OUT_OF_RANGE
// Check for each row that column instr_fetching_parsing_err in addition to the column of the respective error.
// It is not an issue that the instruction is generated at random in the event and is not consistent with the
// bytecode for this test case.
TEST(BytecodeTraceGenTest, InstrFetchingParsingErrors)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    constexpr BytecodeId bytecode_id = 1;
    constexpr size_t bytecode_size = 20;
    std::vector<uint8_t> bytecode(bytecode_size);
    for (size_t i = 0; i < bytecode_size; i++) {
        bytecode[i] = static_cast<uint8_t>(i);
    }
    bytecode[0] = static_cast<uint8_t>(WireOpCode::LAST_OPCODE_SENTINEL) + 1;

    std::vector<InstructionFetchingEvent> events;
    auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(bytecode);
    events.emplace_back(InstructionFetchingEvent{
        .bytecode_id = bytecode_id,
        .pc = 0,
        .bytecode = bytecode_ptr,
        .error = simulation::InstrDeserializationError::OPCODE_OUT_OF_RANGE,
    });
    events.emplace_back(InstructionFetchingEvent{
        .bytecode_id = bytecode_id,
        .pc = 19,
        .bytecode = bytecode_ptr,
        .error = simulation::InstrDeserializationError::INSTRUCTION_OUT_OF_RANGE,
    });
    events.emplace_back(InstructionFetchingEvent{
        .bytecode_id = bytecode_id,
        .pc = 38,
        .bytecode = bytecode_ptr,
        .error = simulation::InstrDeserializationError::PC_OUT_OF_RANGE,
    });

    builder.process_instruction_fetching(events, trace);

    // One extra empty row is prepended.
    const auto rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 3 + 1);

    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(instr_fetching_sel, 1),
                      ROW_FIELD_EQ(instr_fetching_sel_pc_in_range, 1),
                      ROW_FIELD_EQ(instr_fetching_pc, 0),
                      ROW_FIELD_EQ(instr_fetching_bytes_to_read, 20),
                      ROW_FIELD_EQ(instr_fetching_instr_size, 0),
                      ROW_FIELD_EQ(instr_fetching_instr_abs_diff,
                                   20), // instr_size <= bytes_to_read: bytes_to_read - instr_size
                      ROW_FIELD_EQ(instr_fetching_sel_parsing_err, 1),
                      ROW_FIELD_EQ(instr_fetching_pc_abs_diff, 19), // bytecode_size - pc - 1   if bytecode_size > pc
                      ROW_FIELD_EQ(instr_fetching_opcode_out_of_range, 1)));

    EXPECT_THAT(rows.at(2),
                AllOf(ROW_FIELD_EQ(instr_fetching_sel, 1),
                      ROW_FIELD_EQ(instr_fetching_sel_pc_in_range, 1),
                      ROW_FIELD_EQ(instr_fetching_pc, 19), // OR_16 opcode
                      ROW_FIELD_EQ(instr_fetching_bytes_to_read, 1),
                      ROW_FIELD_EQ(instr_fetching_instr_size, 8), // OR_16 is 8 bytes long
                      ROW_FIELD_EQ(instr_fetching_instr_abs_diff,
                                   6), // instr_size > bytes_to_read: instr_size - bytes_to_read - 1
                      ROW_FIELD_EQ(instr_fetching_sel_parsing_err, 1),
                      ROW_FIELD_EQ(instr_fetching_pc_abs_diff, 0), // bytecode_size - pc - 1   if bytecode_size > pc
                      ROW_FIELD_EQ(instr_fetching_instr_out_of_range, 1)));

    EXPECT_THAT(
        rows.at(3),
        AllOf(ROW_FIELD_EQ(instr_fetching_sel, 1),
              ROW_FIELD_EQ(instr_fetching_sel_pc_in_range, 0),
              ROW_FIELD_EQ(instr_fetching_pc, 38),
              ROW_FIELD_EQ(instr_fetching_bytes_to_read, 0),
              ROW_FIELD_EQ(instr_fetching_instr_size, 0),
              ROW_FIELD_EQ(instr_fetching_instr_abs_diff, 0), // instr_size <= bytes_to_read: bytes_to_read - instr_size
              ROW_FIELD_EQ(instr_fetching_sel_parsing_err, 1),
              ROW_FIELD_EQ(instr_fetching_pc_abs_diff, 18), // pc - bytecode_size if bytecode_size <= pc
              ROW_FIELD_EQ(instr_fetching_pc_out_of_range, 1)));
}

// Test on error tag out of range
TEST(BytecodeTraceGenTest, InstrFetchingErrorTagOutOfRange)
{
    using simulation::deserialize_instruction;
    using simulation::Operand;
    using testing::random_instruction;
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    auto instr_cast = random_instruction(WireOpCode::CAST_16);
    auto instr_set = random_instruction(WireOpCode::SET_64);
    constexpr uint32_t cast_size = 7;
    constexpr uint32_t set_64_size = 13;

    instr_cast.operands.at(2) = Operand::from<uint8_t>(0x09); // tag operand mutation to 0x09 which is out of range
    instr_set.operands.at(1) = Operand::from<uint8_t>(0x0A);  // tag operand mutation to 0x0A which is out of range

    auto bytecode = instr_cast.serialize();
    ASSERT_EQ(bytecode.size(), cast_size);

    auto instr_set_bytecode = instr_set.serialize();
    ASSERT_EQ(instr_set_bytecode.size(), set_64_size);

    bytecode.insert(bytecode.end(), instr_set_bytecode.begin(), instr_set_bytecode.end());

    const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(bytecode);

    std::vector<InstructionFetchingEvent> events;
    events.emplace_back(InstructionFetchingEvent{
        .bytecode_id = 1,
        .pc = 0,
        .instruction = deserialize_instruction(bytecode, 0), // Reflect more the real code path than passing instr_cast.
        .bytecode = bytecode_ptr,
        .error = simulation::InstrDeserializationError::TAG_OUT_OF_RANGE,
    });

    events.emplace_back(InstructionFetchingEvent{
        .bytecode_id = 1,
        .pc = cast_size,
        .instruction =
            deserialize_instruction(bytecode, cast_size), // Reflect more the real code path than passing instr_set.
        .bytecode = bytecode_ptr,
        .error = simulation::InstrDeserializationError::TAG_OUT_OF_RANGE,
    });

    builder.process_instruction_fetching(events, trace);

    // One extra empty row is prepended.
    const auto rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 2 + 1);

    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(instr_fetching_sel, 1),
                      ROW_FIELD_EQ(instr_fetching_sel_pc_in_range, 1),
                      ROW_FIELD_EQ(instr_fetching_sel_has_tag, 1),
                      ROW_FIELD_EQ(instr_fetching_sel_tag_is_op2, 0),
                      ROW_FIELD_EQ(instr_fetching_tag_value, 9),
                      ROW_FIELD_EQ(instr_fetching_pc, 0),
                      ROW_FIELD_EQ(instr_fetching_bytes_to_read, cast_size + set_64_size),
                      ROW_FIELD_EQ(instr_fetching_instr_size, cast_size),
                      ROW_FIELD_EQ(instr_fetching_instr_abs_diff,
                                   set_64_size), // instr_size <= bytes_to_read: bytes_to_read - instr_size
                      ROW_FIELD_EQ(instr_fetching_sel_parsing_err, 1),
                      ROW_FIELD_EQ(instr_fetching_pc_abs_diff,
                                   cast_size + set_64_size - 1), // bytecode_size - pc - 1 if bytecode_size > pc
                      ROW_FIELD_EQ(instr_fetching_tag_out_of_range, 1)));

    EXPECT_THAT(
        rows.at(2),
        AllOf(ROW_FIELD_EQ(instr_fetching_sel, 1),
              ROW_FIELD_EQ(instr_fetching_sel_pc_in_range, 1),
              ROW_FIELD_EQ(instr_fetching_sel_has_tag, 1),
              ROW_FIELD_EQ(instr_fetching_sel_tag_is_op2, 1),
              ROW_FIELD_EQ(instr_fetching_tag_value, 10),
              ROW_FIELD_EQ(instr_fetching_pc, cast_size),
              ROW_FIELD_EQ(instr_fetching_bytes_to_read, set_64_size),
              ROW_FIELD_EQ(instr_fetching_instr_size, set_64_size),
              ROW_FIELD_EQ(instr_fetching_instr_abs_diff, 0), // instr_size <= bytes_to_read: bytes_to_read - instr_size
              ROW_FIELD_EQ(instr_fetching_sel_parsing_err, 1),
              ROW_FIELD_EQ(instr_fetching_pc_abs_diff, set_64_size - 1), // bytecode_size - pc - 1 if bytecode_size > pc
              ROW_FIELD_EQ(instr_fetching_tag_out_of_range, 1)));
}

} // namespace
} // namespace bb::avm2::tracegen
