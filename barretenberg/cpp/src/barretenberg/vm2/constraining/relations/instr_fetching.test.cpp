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

} // namespace
} // namespace bb::avm2::constraining
