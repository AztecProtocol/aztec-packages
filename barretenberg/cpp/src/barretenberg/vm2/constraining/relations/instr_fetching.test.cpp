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
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::BytecodeTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using instr_fetching = bb::avm2::instr_fetching<FF>;
using simulation::Instruction;
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

    std::vector<uint8_t> bytecode = add_8_instruction.encode();

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

    std::vector<uint8_t> bytecode = ecadd_instruction.encode();
    builder.process_instruction_fetching({ { .bytecode_id = 1,
                                             .pc = 0,
                                             .instruction = ecadd_instruction,
                                             .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                         trace);

    EXPECT_EQ(trace.get_num_rows(), 1);
    check_relation<instr_fetching>(trace);
}

// Positive test for each opcode. We assume that decode instruction is working correctly.
// It works as long as the relations are not constraining the correct range for TAG nor indirect.
TEST(InstrFetchingConstrainingTest, EachOpcodeWithTraceGen)
{
    std::vector<uint8_t> bytecode;
    std::vector<uint32_t> pc_positions;
    constexpr auto num_opcodes = static_cast<size_t>(WireOpCode::LAST_OPCODE_SENTINEL);
    pc_positions.reserve(num_opcodes);

    for (size_t i = 0; i < num_opcodes; i++) {
        pc_positions.emplace_back(static_cast<uint32_t>(bytecode.size()));
        bytecode.emplace_back(i);
        const auto instruction_bytes =
            random_bytes(WIRE_INSTRUCTION_SPEC.at(static_cast<WireOpCode>(i)).size_in_bytes - 1);
        bytecode.insert(bytecode.end(),
                        std::make_move_iterator(instruction_bytes.begin()),
                        std::make_move_iterator(instruction_bytes.end()));
    }

    const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(bytecode);

    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    std::vector<simulation::InstructionFetchingEvent> instr_events;
    instr_events.reserve(num_opcodes);

    for (size_t i = 0; i < num_opcodes; i++) {
        const auto instr = simulation::decode_instruction(bytecode, pc_positions.at(i));
        instr_events.emplace_back(simulation::InstructionFetchingEvent{
            .bytecode_id = 1, .pc = pc_positions.at(i), .instruction = instr, .bytecode = bytecode_ptr });
    }

    builder.process_instruction_fetching(instr_events, trace);

    EXPECT_EQ(trace.get_num_rows(), num_opcodes);
    check_relation<instr_fetching>(trace);
}

// Negative test about decomposition of operands. We mutate correct operand values in the trace.
// This also covers wrong operands which are not "involved" by the instruction.
// We perform this for a random instruction for opcodes:
TEST(InstrFetchingConstrainingTest, NegativeWrongOperand)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;

    std::vector<WireOpCode> opcodes = { WireOpCode::REVERT_16, WireOpCode::CAST_8, WireOpCode::TORADIXBE };
    std::vector<size_t> sub_relations = {
        instr_fetching::SR_INDIRECT_BYTES_DECOMPOSITION, instr_fetching::SR_OP1_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP2_BYTES_DECOMPOSITION,      instr_fetching::SR_OP3_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP4_BYTES_DECOMPOSITION,      instr_fetching::SR_OP5_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP6_BYTES_DECOMPOSITION,      instr_fetching::SR_OP7_BYTES_DECOMPOSITION,
    };

    const std::vector<C> operand_cols = {
        C::instr_fetching_indirect, C::instr_fetching_op1, C::instr_fetching_op2, C::instr_fetching_op3,
        C::instr_fetching_op4,      C::instr_fetching_op5, C::instr_fetching_op6, C::instr_fetching_op7,
    };

    for (const auto& opcode : opcodes) {
        const auto instr = testing::random_instruction(opcode);
        builder.process_instruction_fetching({ simulation::InstructionFetchingEvent{
                                                 .bytecode_id = 1,
                                                 .pc = 0,
                                                 .instruction = instr,
                                                 .bytecode = std::make_shared<std::vector<uint8_t>>(instr.encode()) } },
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

} // namespace
} // namespace bb::avm2::constraining
