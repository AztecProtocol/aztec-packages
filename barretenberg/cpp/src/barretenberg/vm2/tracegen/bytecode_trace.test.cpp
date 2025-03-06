#include <algorithm>
#include <cstddef>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <sys/types.h>
#include <vector>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/full_row.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::testing::Field;

using R = TestTraceContainer::Row;
using FF = R::FF;

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

    // One extra empty row is prepended. Note that precomputed_first_row is not set through process_decomposition()
    // because it pertains to another subtrace.
    EXPECT_EQ(trace.as_rows().size(), 4 + 1);

    // We do not inspect row at index 0 as it is completely empty.
    EXPECT_THAT(trace.as_rows()[1],
                AllOf(ROW_FIELD_EQ(R, bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_id, 43),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes, 12),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_1, 31),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_2, 5),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_3, 2),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_4, 0),
                      ROW_FIELD_EQ(R, bc_decomposition_pc, 0),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_remaining, 4),
                      ROW_FIELD_EQ(R, bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 4),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read, 4),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read_unary, (1 << 4) - 1),
                      ROW_FIELD_EQ(R, bc_decomposition_last_of_contract, 0)));

    EXPECT_THAT(trace.as_rows()[2],
                AllOf(ROW_FIELD_EQ(R, bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_id, 43),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes, 31),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_1, 5),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_2, 2),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_3, 0),
                      ROW_FIELD_EQ(R, bc_decomposition_pc, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_remaining, 3),
                      ROW_FIELD_EQ(R, bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 3),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read, 3),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read_unary, (1 << 3) - 1),
                      ROW_FIELD_EQ(R, bc_decomposition_last_of_contract, 0)));

    EXPECT_THAT(trace.as_rows()[3],
                AllOf(ROW_FIELD_EQ(R, bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_id, 43),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes, 5),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_1, 2),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_2, 0),
                      ROW_FIELD_EQ(R, bc_decomposition_pc, 2),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_remaining, 2),
                      ROW_FIELD_EQ(R, bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 2),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read, 2),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read_unary, (1 << 2) - 1),
                      ROW_FIELD_EQ(R, bc_decomposition_last_of_contract, 0)));

    EXPECT_THAT(trace.as_rows()[4],
                AllOf(ROW_FIELD_EQ(R, bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_id, 43),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes, 2),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_pc_plus_1, 0),
                      ROW_FIELD_EQ(R, bc_decomposition_pc, 3),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_remaining, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 1),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read_unary, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_last_of_contract, 1)));
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

    // One extra empty row is prepended. Note that precomputed_first_row is not set through process_decomposition()
    // because it pertains to another subtrace.
    EXPECT_EQ(trace.as_rows().size(), bytecode_size + 1);

    // We do not inspect row at index 0 as it is completely empty.
    EXPECT_THAT(trace.as_rows()[1],
                AllOf(ROW_FIELD_EQ(R, bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_id, 7),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes, first_byte),
                      ROW_FIELD_EQ(R, bc_decomposition_pc, 0),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_remaining, bytecode_size),
                      ROW_FIELD_EQ(R, bc_decomposition_sel_overflow_correction_needed, 0),
                      ROW_FIELD_EQ(R, bc_decomposition_abs_diff, 8),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read, DECOMPOSE_WINDOW_SIZE),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read_unary, (uint64_t(1) << DECOMPOSE_WINDOW_SIZE) - 1),
                      ROW_FIELD_EQ(R, bc_decomposition_last_of_contract, 0)));

    // We are interested to inspect the boundary aroud bytes_remaining == windows size

    EXPECT_THAT(trace.as_rows()[9],
                AllOf(ROW_FIELD_EQ(R, bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_id, 7),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes, first_byte + 8),
                      ROW_FIELD_EQ(R, bc_decomposition_pc, 8),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_remaining, DECOMPOSE_WINDOW_SIZE),
                      ROW_FIELD_EQ(R, bc_decomposition_sel_overflow_correction_needed, 0),
                      ROW_FIELD_EQ(R, bc_decomposition_abs_diff, 0),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read, DECOMPOSE_WINDOW_SIZE),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read_unary, (uint64_t(1) << DECOMPOSE_WINDOW_SIZE) - 1),
                      ROW_FIELD_EQ(R, bc_decomposition_last_of_contract, 0)));

    EXPECT_THAT(
        trace.as_rows()[10],
        AllOf(ROW_FIELD_EQ(R, bc_decomposition_sel, 1),
              ROW_FIELD_EQ(R, bc_decomposition_id, 7),
              ROW_FIELD_EQ(R, bc_decomposition_bytes, first_byte + 9),
              ROW_FIELD_EQ(R, bc_decomposition_pc, 9),
              ROW_FIELD_EQ(R, bc_decomposition_bytes_remaining, DECOMPOSE_WINDOW_SIZE - 1),
              ROW_FIELD_EQ(R, bc_decomposition_sel_overflow_correction_needed, 1),
              ROW_FIELD_EQ(R, bc_decomposition_abs_diff, 1),
              ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read, DECOMPOSE_WINDOW_SIZE - 1),
              ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read_unary, (uint64_t(1) << (DECOMPOSE_WINDOW_SIZE - 1)) - 1),
              ROW_FIELD_EQ(R, bc_decomposition_last_of_contract, 0)));

    // Last row
    EXPECT_THAT(trace.as_rows()[bytecode_size],
                AllOf(ROW_FIELD_EQ(R, bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_id, 7),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes, first_byte + bytecode_size - 1),
                      ROW_FIELD_EQ(R, bc_decomposition_pc, bytecode_size - 1),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_remaining, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_sel_overflow_correction_needed, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_abs_diff, DECOMPOSE_WINDOW_SIZE - 1),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read_unary, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_last_of_contract, 1)));
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

    // One extra empty row is prepended.
    EXPECT_EQ(trace.as_rows().size(), 2 * DECOMPOSE_WINDOW_SIZE + 20 + 1);

    const auto rows = trace.as_rows();
    size_t row_pos = 1;
    for (uint32_t i = 0; i < 4; i++) {
        for (uint32_t j = 0; j < bc_sizes[i]; j++) {
            const auto bytes_rem = bc_sizes[i] - j;
            EXPECT_THAT(
                rows.at(row_pos),
                AllOf(ROW_FIELD_EQ(R, bc_decomposition_sel, 1),
                      ROW_FIELD_EQ(R, bc_decomposition_id, i),
                      ROW_FIELD_EQ(R, bc_decomposition_pc, j),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_remaining, bytes_rem),
                      ROW_FIELD_EQ(R,
                                   bc_decomposition_sel_overflow_correction_needed,
                                   bytes_rem < DECOMPOSE_WINDOW_SIZE ? 1 : 0),
                      ROW_FIELD_EQ(R,
                                   bc_decomposition_abs_diff,
                                   bytes_rem < DECOMPOSE_WINDOW_SIZE ? DECOMPOSE_WINDOW_SIZE - bytes_rem
                                                                     : bytes_rem - DECOMPOSE_WINDOW_SIZE),
                      ROW_FIELD_EQ(R, bc_decomposition_bytes_to_read, std::min(DECOMPOSE_WINDOW_SIZE, bytes_rem)),
                      ROW_FIELD_EQ(R, bc_decomposition_last_of_contract, j == bc_sizes[i] - 1 ? 1 : 0)));
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

    // One extra empty row is prepended.
    const auto rows = trace.as_rows();
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(R, bc_hashing_sel, 1),
                      ROW_FIELD_EQ(R, bc_hashing_start, 1),
                      ROW_FIELD_EQ(R, bc_hashing_latch, 0),
                      ROW_FIELD_EQ(R, bc_hashing_bytecode_id, 0),
                      ROW_FIELD_EQ(R, bc_hashing_pc_index, 0),
                      ROW_FIELD_EQ(R, bc_hashing_packed_field, 10),
                      ROW_FIELD_EQ(R, bc_hashing_incremental_hash, 6)));

    // Latched row (note we leave out the resulting hash in this test)
    EXPECT_THAT(rows.at(2),
                AllOf(ROW_FIELD_EQ(R, bc_hashing_sel, 1),
                      ROW_FIELD_EQ(R, bc_hashing_start, 0),
                      ROW_FIELD_EQ(R, bc_hashing_latch, 1),
                      ROW_FIELD_EQ(R, bc_hashing_bytecode_id, 0),
                      ROW_FIELD_EQ(R, bc_hashing_pc_index, 31),
                      ROW_FIELD_EQ(R, bc_hashing_packed_field, 20)));
}

// We build a random InstructionFetchingEvent for each wire opcode.
// We then verify that the bytes (bd0, bd1, ...) correspond to the serialized instruction.
TEST(BytecodeTraceGenTest, InstrDecompositionInBytesEachOpcode)
{
    using simulation::Instruction;
    using simulation::InstructionFetchingEvent;
    using C = Column;

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

    constexpr auto num_opcodes = static_cast<size_t>(WireOpCode::LAST_OPCODE_SENTINEL);

    std::vector<InstructionFetchingEvent> events;
    events.reserve(num_opcodes);
    std::vector<Instruction> instructions;
    instructions.reserve(num_opcodes);
    std::vector<uint32_t> pcs;
    pcs.reserve(num_opcodes);
    std::vector<uint8_t> bytecode;
    bytecode.reserve(1024); // Rough estimate

    uint32_t pc = 0;
    for (size_t i = 0; i < num_opcodes; i++) {
        const auto w_opcode = static_cast<WireOpCode>(i);
        const auto instr = testing::random_instruction(w_opcode);
        const auto instr_encoded = instr.serialize();
        instructions.emplace_back(instr);
        pcs.emplace_back(pc);
        pc += instr_encoded.size();
        bytecode.insert(bytecode.end(),
                        std::make_move_iterator(instr_encoded.begin()),
                        std::make_move_iterator(instr_encoded.end()));
    }

    auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(bytecode);
    for (size_t i = 0; i < num_opcodes; i++) {
        events.emplace_back(InstructionFetchingEvent{
            .bytecode_id = 1,
            .pc = pcs.at(i),
            .instruction = instructions.at(i),
            .bytecode = bytecode_ptr,
        });
    }

    builder.process_instruction_fetching(events, trace);

    for (uint32_t i = 0; i < num_opcodes; i++) {
        const auto instr = instructions.at(i);
        const auto instr_encoded = instr.serialize();
        const auto w_opcode = static_cast<WireOpCode>(i);

        // Check size_in_bytes column
        const auto expected_size_in_bytes = WIRE_INSTRUCTION_SPEC.at(w_opcode).size_in_bytes;
        ASSERT_EQ(instr_encoded.size(), expected_size_in_bytes);
        EXPECT_EQ(FF(expected_size_in_bytes), trace.get(C::instr_fetching_instr_size_in_bytes, i));

        // Inspect each byte
        for (size_t j = 0; j < static_cast<size_t>(expected_size_in_bytes); j++) {
            EXPECT_EQ(FF(instr_encoded.at(j)), trace.get(bd_columns.at(j), i));
        }

        // Check exection opcode
        EXPECT_EQ(FF(static_cast<uint8_t>(WIRE_INSTRUCTION_SPEC.at(w_opcode).exec_opcode)),
                  trace.get(C::instr_fetching_exec_opcode, i));

        // Check indirect
        EXPECT_EQ(FF(instr.indirect), trace.get(C::instr_fetching_indirect, i));

        // Check PCs
        EXPECT_EQ(FF(pcs.at(i)), trace.get(C::instr_fetching_pc, i));

        // Check operands
        size_t operand_idx = 0;
        for (const auto& operand : instr.operands) {
            EXPECT_EQ(FF(operand), trace.get(operand_columns.at(operand_idx++), i));
        }
    }
}

} // namespace
} // namespace bb::avm2::tracegen
