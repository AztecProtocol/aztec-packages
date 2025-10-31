#include "barretenberg/vm2/simulation_helper.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

namespace bb::avm2 {
namespace {

using avm2::testing::InstructionBuilder;
using simulation::Instruction;
using simulation::Operand;
using ::testing::ElementsAre;

// Helper function to create bytecode from a vector of instructions
std::vector<uint8_t> create_bytecode(const std::vector<Instruction>& instructions)
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

// Helper function to create default global variables for testing
GlobalVariables create_default_globals()
{
    return GlobalVariables{
        .chainId = 1,
        .version = 1,
        .blockNumber = 1,
        .slotNumber = 1,
        .timestamp = 1000000,
        .coinbase = EthAddress{ 0 },
        .feeRecipient = AztecAddress{ 0 },
        .gasFees = GasFees{ .feePerDaGas = 1, .feePerL2Gas = 1 },
    };
}

class SimulateBytecodeTest : public ::testing::Test {
  protected:
    AvmSimulationHelper helper;
    AztecAddress contract_address{ 42 };
    AztecAddress sender_address{ 100 };
    FF transaction_fee = 0;
    GlobalVariables globals = create_default_globals();
    bool is_static_call = false;
    Gas gas_limit{ 1000000, 1000000 }; // Large gas limit for tests
};

TEST_F(SimulateBytecodeTest, AddSimple)
{
    const uint8_t a_value = 10;
    const uint8_t b_value = 20;

    const uint8_t a_offset = 0;
    const uint8_t b_offset = 1;
    const uint8_t result_offset = 2;
    const uint8_t return_size_offset = 3;

    std::vector<Instruction> instructions = {
        // Set value of a
        InstructionBuilder(WireOpCode::SET_8).operand(a_offset).operand(MemoryTag::FF).operand(a_value).build(),
        // Set value of b
        InstructionBuilder(WireOpCode::SET_8).operand(b_offset).operand(MemoryTag::FF).operand(b_value).build(),
        // Add a + b
        InstructionBuilder(WireOpCode::ADD_8).operand(a_offset).operand(b_offset).operand(result_offset).build(),
        // Set return size to 1 to return sum
        InstructionBuilder(WireOpCode::SET_8)
            .operand(return_size_offset)
            .operand(MemoryTag::U32)
            .operand(static_cast<uint8_t>(1))
            .build(),
        // Return successfully with one field element
        InstructionBuilder(WireOpCode::RETURN)
            .operand(static_cast<uint16_t>(return_size_offset))
            .operand(static_cast<uint16_t>(result_offset))
            .build(),
    };

    const auto bytecode = create_bytecode(instructions);
    const std::vector<FF> calldata = {}; // No calldata

    auto result = helper.simulate_bytecode(
        contract_address, sender_address, transaction_fee, globals, is_static_call, calldata, gas_limit, bytecode);

    EXPECT_TRUE(result.success);
    EXPECT_THAT(result.output, ::testing::Optional(ElementsAre(a_value + b_value)));
}

TEST_F(SimulateBytecodeTest, AddWithIndirectOffset)
{
    // Indirect addressing mode: first operand is indirect
    const uint16_t indirect = 0b001; // First operand (a) is indirect

    const uint8_t a_value = 15;
    const uint8_t b_value = 25;

    const uint8_t a_indirect_offset = 0; // pointer to a
    const uint8_t a_direct_offset = 1;   // actual location of a
    const uint8_t b_offset = 2;
    const uint8_t result_offset = 3;
    const uint8_t return_size_offset = 4;

    std::vector<Instruction> instructions = {
        // Create the pointer to a (aIndirectOffset -> aDirectOffset -> value)
        InstructionBuilder(WireOpCode::SET_8)
            .operand(a_indirect_offset)
            .operand(MemoryTag::U32)
            .operand(a_direct_offset)
            .build(),
        // Set value of a at direct offset
        InstructionBuilder(WireOpCode::SET_8).operand(a_direct_offset).operand(MemoryTag::FF).operand(a_value).build(),
        // Set value of b
        InstructionBuilder(WireOpCode::SET_8).operand(b_offset).operand(MemoryTag::FF).operand(b_value).build(),
        // Add a + b with indirect addressing for a
        Instruction{
            .opcode = WireOpCode::ADD_8,
            .indirect = indirect,
            .operands = { Operand::from<uint8_t>(a_indirect_offset),
                          Operand::from<uint8_t>(b_offset),
                          Operand::from<uint8_t>(result_offset) },
        },
        // Set return size to 1 to return sum
        InstructionBuilder(WireOpCode::SET_8)
            .operand(return_size_offset)
            .operand(MemoryTag::U32)
            .operand(static_cast<uint8_t>(1))
            .build(),
        // Return successfully (with one field element: the sum)
        InstructionBuilder(WireOpCode::RETURN)
            .operand(static_cast<uint16_t>(return_size_offset))
            .operand(static_cast<uint16_t>(result_offset))
            .build(),
    };

    const auto bytecode = create_bytecode(instructions);
    const std::vector<FF> calldata = {}; // No calldata

    auto result = helper.simulate_bytecode(
        contract_address, sender_address, transaction_fee, globals, is_static_call, calldata, gas_limit, bytecode);

    EXPECT_TRUE(result.success);
    EXPECT_THAT(result.output, ::testing::Optional(ElementsAre(a_value + b_value)));
}

TEST_F(SimulateBytecodeTest, AddFromCalldata)
{
    const FF a_value = 42;
    const FF b_value = 58;

    // Prepare calldata
    std::vector<FF> calldata{ a_value, b_value };

    const uint16_t const0_offset = 0; // const of 0
    const uint16_t const1_offset = 1; // const of 1
    const uint16_t const2_offset = 2; // const of 2
    const uint16_t a_memory_offset = 1000;
    const uint16_t b_memory_offset = 1001;
    const uint16_t result_offset = 1002;

    std::vector<Instruction> instructions = {
        // Store consts into memory (use 16-bit wire format for large offsets)
        InstructionBuilder(WireOpCode::SET_16)
            .operand(const0_offset)
            .operand(MemoryTag::U32)
            .operand(static_cast<uint16_t>(0))
            .build(),
        InstructionBuilder(WireOpCode::SET_16)
            .operand(const1_offset)
            .operand(MemoryTag::U32)
            .operand(static_cast<uint16_t>(1))
            .build(),
        InstructionBuilder(WireOpCode::SET_16)
            .operand(const2_offset)
            .operand(MemoryTag::U32)
            .operand(static_cast<uint16_t>(2))
            .build(),
        // Copy calldata[0] (aValue) into memory
        InstructionBuilder(WireOpCode::CALLDATACOPY)
            .operand(const1_offset) // copy 1 word
            .operand(const0_offset) // from calldata offset 0
            .operand(a_memory_offset)
            .build(),
        // Convert aValue to a field (in-place)
        InstructionBuilder(WireOpCode::CAST_16)
            .operand(a_memory_offset)
            .operand(a_memory_offset)
            .operand(MemoryTag::FF)
            .build(),
        // Copy calldata[1] (bValue) into memory
        InstructionBuilder(WireOpCode::CALLDATACOPY)
            .operand(const1_offset) // copy 1 word
            .operand(const1_offset) // from calldata offset 1
            .operand(b_memory_offset)
            .build(),
        // Convert bValue to a field (in-place)
        InstructionBuilder(WireOpCode::CAST_16)
            .operand(b_memory_offset)
            .operand(b_memory_offset)
            .operand(MemoryTag::FF)
            .build(),
        // Add a + b
        InstructionBuilder(WireOpCode::ADD_16)
            .operand(a_memory_offset)
            .operand(b_memory_offset)
            .operand(result_offset)
            .build(),
        // Return successfully (with one field element: the sum)
        InstructionBuilder(WireOpCode::RETURN)
            .operand(const1_offset)
            .operand(static_cast<uint16_t>(result_offset))
            .build(),
    };

    const auto bytecode = create_bytecode(instructions);

    auto result = helper.simulate_bytecode(
        contract_address, sender_address, transaction_fee, globals, is_static_call, calldata, gas_limit, bytecode);

    EXPECT_TRUE(result.success);
    EXPECT_THAT(result.output, ::testing::Optional(ElementsAre(a_value + b_value)));
}

TEST_F(SimulateBytecodeTest, AddShouldRevertWithMismatchedTags)
{
    const uint8_t a_value = 10;
    const uint8_t b_value = 20;

    const uint8_t a_offset = 0;
    const uint8_t b_offset = 1;
    const uint8_t result_offset = 2;
    const uint8_t return_size_offset = 3;

    std::vector<Instruction> instructions = {
        // Set value of a as FIELD
        InstructionBuilder(WireOpCode::SET_8).operand(a_offset).operand(MemoryTag::FF).operand(a_value).build(),
        // Set value of b as UINT32 (mismatched tag!)
        InstructionBuilder(WireOpCode::SET_8).operand(b_offset).operand(MemoryTag::U32).operand(b_value).build(),
        // Try to add a + b (should fail due to tag mismatch)
        InstructionBuilder(WireOpCode::ADD_8).operand(a_offset).operand(b_offset).operand(result_offset).build(),
        // Set return size to 1 to return sum
        // SHOULD NOT REACH HERE!
        InstructionBuilder(WireOpCode::SET_8)
            .operand(return_size_offset)
            .operand(MemoryTag::U32)
            .operand(static_cast<uint8_t>(1))
            .build(),
        // Return successfully (but empty)
        InstructionBuilder(WireOpCode::RETURN)
            .operand(static_cast<uint16_t>(return_size_offset))
            .operand(static_cast<uint16_t>(result_offset))
            .build(),
    };

    const auto bytecode = create_bytecode(instructions);
    const std::vector<FF> calldata = {}; // No calldata

    simulation::EnqueuedCallResult result = helper.simulate_bytecode(
        contract_address, sender_address, transaction_fee, globals, is_static_call, calldata, gas_limit, bytecode);

    // Execution should fail due to tag mismatch
    EXPECT_FALSE(result.success);
    EXPECT_THAT(result.output, ::testing::Optional(::testing::IsEmpty()));
}

} // namespace
} // namespace bb::avm2
