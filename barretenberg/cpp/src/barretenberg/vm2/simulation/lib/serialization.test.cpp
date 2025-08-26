#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2 {
namespace {

using simulation::check_tag;
using simulation::Instruction;
using simulation::Operand;

// Testing check_tag with a valid instruction for wire opcode SET_128
TEST(SerializationTest, CheckTagValid)
{
    Instruction instr = { .opcode = WireOpCode::SET_128,
                          .indirect = 2,
                          .operands = { Operand::from<uint16_t>(1002),
                                        Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::U128)),
                                        Operand::from<uint128_t>(12345) } };
    EXPECT_TRUE(check_tag(instr));
}

// Testing check_tag with an invalid tag for wire opcode SET_128
TEST(SerializationTest, CheckTagInvalid)
{
    Instruction instr = { .opcode = WireOpCode::SET_128,
                          .indirect = 2,
                          .operands = { Operand::from<uint16_t>(1002),
                                        Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::MAX) + 1),
                                        Operand::from<uint128_t>(12345) } };
    EXPECT_FALSE(check_tag(instr));
}

// Testing check_tag with an invalid instruction for wire opcode SET_128, not enough operands
TEST(SerializationTest, CheckTagInvalidNotEnoughOperands)
{
    Instruction instr = { .opcode = WireOpCode::SET_128, .indirect = 2, .operands = { Operand::from<uint16_t>(1002) } };
    EXPECT_FALSE(check_tag(instr));
}

// Testing check_tag with an invalid instruction for wire opcode SET_128, tag is not a byte
TEST(SerializationTest, CheckTagInvalidTagNotByte)
{
    Instruction instr = { .opcode = WireOpCode::SET_128,
                          .indirect = 2,
                          .operands = { Operand::from<uint16_t>(1002),
                                        Operand::from<uint16_t>(static_cast<uint8_t>(MemoryTag::U128)),
                                        Operand::from<uint128_t>(12345) } };
    EXPECT_FALSE(check_tag(instr));
}

} // namespace
} // namespace bb::avm2
