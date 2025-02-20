#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/instr_fetching.hpp"
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
using simulation::Operand;

TEST(InstrFetchingConstrainingTest, EmptyRow)
{
    TestTraceContainer trace({
        { { C::precomputed_clk, 1 } },
    });

    check_relation<instr_fetching>(trace);
}

// Basic positive test with a hardcoded bytecode for ADD_8
TEST(InstrFetchingConstrainingTest, add8WithTraceGen)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;
    simulation::Instruction add_8_instruction = {
        .opcode = WireOpCode::ADD_8,
        .indirect = 3,
        .operands = { Operand::u8(0x34), Operand::u8(0x35), Operand::u8(0x36) },
        .size_in_bytes = 5,
    };

    std::vector<uint8_t> bytecode = { static_cast<uint8_t>(WireOpCode::ADD_8), 0x03, 0x34, 0x35, 0x36 };

    builder.process_instruction_fetching({ { .bytecode_id = 1,
                                             .pc = 0,
                                             .instruction = add_8_instruction,
                                             .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                         trace);

    EXPECT_EQ(trace.get_num_rows(), 1);
    check_relation<instr_fetching>(trace);
}

// Basic positive test with a hardcoded bytecode for ECADD
TEST(InstrFetchingConstrainingTest, ecaddWithTraceGen)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;
    simulation::Instruction ecadd_instruction = {
        .opcode = WireOpCode::ECADD,
        .indirect = 0x1f1f,
        .operands = { Operand::u16(0x1279),
                      Operand::u16(0x127a),
                      Operand::u16(0x127b),
                      Operand::u16(0x127c),
                      Operand::u16(0x127d),
                      Operand::u16(0x127e),
                      Operand::u16(0x127f) },
        .size_in_bytes = 17,
    };

    std::vector<uint8_t> bytecode = {
        static_cast<uint8_t>(WireOpCode::ECADD),
        0x1f,
        0x1f,
        0x12,
        0x79,
        0x12,
        0x7a,
        0x12,
        0x7b,
        0x12,
        0x7c,
        0x12,
        0x7d,
        0x12,
        0x7e,
        0x12,
        0x7f,
    };

    builder.process_instruction_fetching({ { .bytecode_id = 1,
                                             .pc = 0,
                                             .instruction = ecadd_instruction,
                                             .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                         trace);

    EXPECT_EQ(trace.get_num_rows(), 1);
    check_relation<instr_fetching>(trace);
}

// Positive test for each opcode. We assume that decode instruction is working correctly.
// It works as long as the relations are not constraining correct range for TAG and or indirect.
TEST(InstrFetchingConstrainingTest, eachOpcodeWithTraceGen)
{
    uint32_t seed = 987137937; // Arbitrary number serving as pseudo-random seed to generate bytes

    auto gen_40_bytes = [&]() {
        std::vector<uint8_t> bytes;
        bytes.resize(40);

        for (size_t i = 0; i < 40; i++) {
            bytes.at(i) = static_cast<uint8_t>(seed % 256);
            seed *= seed;
        }
        return bytes;
    };

    for (uint8_t i = 0; i < static_cast<int>(WireOpCode::LAST_OPCODE_SENTINEL); i++) {
        TestTraceContainer trace;
        BytecodeTraceBuilder builder;

        std::vector<uint8_t> bytecode = gen_40_bytes();
        bytecode.at(0) = i;

        const auto instr = simulation::decode_instruction(bytecode, 0);

        builder.process_instruction_fetching({ { .bytecode_id = 1,
                                                 .pc = 0,
                                                 .instruction = instr,
                                                 .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                             trace);

        EXPECT_EQ(trace.get_num_rows(), 1);
        check_relation<instr_fetching>(trace);
    }
}

} // namespace
} // namespace bb::avm2::constraining
