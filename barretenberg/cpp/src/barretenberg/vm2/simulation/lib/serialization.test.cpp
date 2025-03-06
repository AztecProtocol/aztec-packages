#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2 {
namespace {
using simulation::deserialize_instruction;
using simulation::Instruction;
using simulation::Operand;

// Testing serialization with some u8 variants
TEST(SerializationTest, Not8RoundTrip)
{
    const Instruction instr = { .opcode = WireOpCode::NOT_8,
                                .indirect = 5,
                                .operands = { Operand::u8(123), Operand::u8(45) } };
    const auto decoded = deserialize_instruction(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with some u16 variants
TEST(SerializationTest, Add16RoundTrip)
{
    const Instruction instr = { .opcode = WireOpCode::ADD_16,
                                .indirect = 3,
                                .operands = { Operand::u16(1000), Operand::u16(1001), Operand::u16(1002) } };
    const auto decoded = deserialize_instruction(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with a u32 variant
TEST(SerializationTest, Jumpi32RoundTrip)
{
    const Instruction instr = { .opcode = WireOpCode::JUMPI_32,
                                .indirect = 7,
                                .operands = { Operand::u16(12345), Operand::u32(678901234) } };
    const auto decoded = deserialize_instruction(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with a u64 variant
TEST(SerializationTest, Set64RoundTrip)
{
    const uint64_t value_64 = 0xABCDEF0123456789LLU;

    const Instruction instr = {
        .opcode = WireOpCode::SET_64,
        .indirect = 2,
        .operands = { Operand::u16(1002), Operand::u8(static_cast<uint8_t>(MemoryTag::U64)), Operand::u64(value_64) }
    };
    const auto decoded = deserialize_instruction(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with a u128 variant
TEST(SerializationTest, Set128RoundTrip)
{
    const uint128_t value_128 = (uint128_t{ 0x123456789ABCDEF0LLU } << 64) + uint128_t{ 0xABCDEF0123456789LLU };

    const Instruction instr = {
        .opcode = WireOpCode::SET_128,
        .indirect = 2,
        .operands = { Operand::u16(1002), Operand::u8(static_cast<uint8_t>(MemoryTag::U128)), Operand::u128(value_128) }
    };
    const auto decoded = deserialize_instruction(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with ff variant
TEST(SerializationTest, SetFFRoundTrip)
{
    const FF large_ff = FF::modulus - 981723;

    const Instruction instr = {
        .opcode = WireOpCode::SET_FF,
        .indirect = 2,
        .operands = { Operand::u16(1002), Operand::u8(static_cast<uint8_t>(MemoryTag::FF)), Operand::ff(large_ff) }
    };
    const auto decoded = deserialize_instruction(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

} // namespace
} // namespace bb::avm2
