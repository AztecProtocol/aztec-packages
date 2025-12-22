#include <gtest/gtest.h>

#include "barretenberg/avm_fuzzer/fuzz_lib/bytecode_decompiler.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

using namespace bb::avm_fuzzer;
using namespace bb::avm2;
namespace avm2_testing = bb::avm2::testing;

namespace {

// Helper to build bytecode from raw simulation::Instruction
std::vector<uint8_t> build_bytecode(const std::vector<simulation::Instruction>& instructions)
{
    std::vector<uint8_t> bytecode;
    for (const auto& instr : instructions) {
        auto serialized = instr.serialize();
        bytecode.insert(bytecode.end(), serialized.begin(), serialized.end());
    }
    return bytecode;
}

// Rebuild bytecode from FuzzerData to test round-trip
std::vector<uint8_t> rebuild_bytecode(const FuzzerData& data)
{
    // Make a mutable copy since ControlFlow modifies the blocks
    auto instruction_blocks = data.instruction_blocks;
    ControlFlow control_flow(instruction_blocks);
    for (const auto& cfg_instr : data.cfg_instructions) {
        control_flow.process_cfg_instruction(cfg_instr);
    }
    return control_flow.build_bytecode(data.return_options);
}

} // namespace

// Test that decompiling and recompiling produces identical bytecode
TEST(BytecodeDecompiler, RoundTripSimpleSetReturn)
{
    // Build: SET_16 (value 42 at address 0) + RETURN
    auto set_instr = avm2_testing::InstructionBuilder(WireOpCode::SET_16)
                         .operand(uint16_t{ 0 })
                         .operand(MemoryTag::U32)
                         .operand(uint16_t{ 42 })
                         .build();
    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 0 }).build();

    auto original_bytecode = build_bytecode({ set_instr, return_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode.size(), rebuilt_bytecode.size());
    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, RoundTripAdd16)
{
    // Build: SET_16 (value 5 at address 0) + SET_16 (value 3 at address 1) + ADD_16 + RETURN
    auto set1 = avm2_testing::InstructionBuilder(WireOpCode::SET_16)
                    .operand(uint16_t{ 0 })
                    .operand(MemoryTag::U32)
                    .operand(uint16_t{ 5 })
                    .build();
    auto set2 = avm2_testing::InstructionBuilder(WireOpCode::SET_16)
                    .operand(uint16_t{ 1 })
                    .operand(MemoryTag::U32)
                    .operand(uint16_t{ 3 })
                    .build();
    auto add_instr = avm2_testing::InstructionBuilder(WireOpCode::ADD_16)
                         .operand(uint16_t{ 0 })
                         .operand(uint16_t{ 1 })
                         .operand(uint16_t{ 2 })
                         .build();
    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 2 }).build();

    auto original_bytecode = build_bytecode({ set1, set2, add_instr, return_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, RoundTripJump)
{
    // Build: JUMP to offset 0 + RETURN
    auto jump_instr = avm2_testing::InstructionBuilder(WireOpCode::JUMP_32).operand(uint32_t{ 0 }).build();
    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 0 }).build();

    auto original_bytecode = build_bytecode({ jump_instr, return_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, RoundTripJumpI)
{
    // Build: SET_8 (condition at address 0) + JUMPI_32 + RETURN
    auto set_cond = avm2_testing::InstructionBuilder(WireOpCode::SET_8)
                        .operand(uint8_t{ 0 })
                        .operand(MemoryTag::U1)
                        .operand(uint8_t{ 1 })
                        .build();
    auto jumpi_instr =
        avm2_testing::InstructionBuilder(WireOpCode::JUMPI_32).operand(uint16_t{ 0 }).operand(uint32_t{ 5 }).build();
    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 0 }).build();

    auto original_bytecode = build_bytecode({ set_cond, jumpi_instr, return_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, RoundTripRevert)
{
    // Build: SET_16 + REVERT_16
    auto set_instr = avm2_testing::InstructionBuilder(WireOpCode::SET_16)
                         .operand(uint16_t{ 0 })
                         .operand(MemoryTag::U32)
                         .operand(uint16_t{ 0 })
                         .build();
    auto revert_instr =
        avm2_testing::InstructionBuilder(WireOpCode::REVERT_16).operand(uint16_t{ 0 }).operand(uint16_t{ 0 }).build();

    auto original_bytecode = build_bytecode({ set_instr, revert_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, RoundTripInternalCallReturn)
{
    // Build: INTERNALCALL + INTERNALRETURN + RETURN
    auto internal_call = avm2_testing::InstructionBuilder(WireOpCode::INTERNALCALL).operand(uint32_t{ 5 }).build();
    auto internal_return = avm2_testing::InstructionBuilder(WireOpCode::INTERNALRETURN).build();
    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 0 }).build();

    auto original_bytecode = build_bytecode({ internal_call, internal_return, return_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, RoundTripCast)
{
    // Build: SET_16 + CAST_16 + RETURN
    auto set_instr = avm2_testing::InstructionBuilder(WireOpCode::SET_16)
                         .operand(uint16_t{ 0 })
                         .operand(MemoryTag::U32)
                         .operand(uint16_t{ 255 })
                         .build();
    auto cast_instr = avm2_testing::InstructionBuilder(WireOpCode::CAST_16)
                          .operand(uint16_t{ 0 })
                          .operand(uint16_t{ 1 })
                          .operand(MemoryTag::U64)
                          .build();
    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 1 }).build();

    auto original_bytecode = build_bytecode({ set_instr, cast_instr, return_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, RoundTripMov)
{
    // Build: SET_16 + MOV_16 + RETURN
    auto set_instr = avm2_testing::InstructionBuilder(WireOpCode::SET_16)
                         .operand(uint16_t{ 0 })
                         .operand(MemoryTag::U32)
                         .operand(uint16_t{ 42 })
                         .build();
    auto mov_instr =
        avm2_testing::InstructionBuilder(WireOpCode::MOV_16).operand(uint16_t{ 0 }).operand(uint16_t{ 1 }).build();
    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 1 }).build();

    auto original_bytecode = build_bytecode({ set_instr, mov_instr, return_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, RoundTripNot)
{
    // Build: SET_16 + NOT_16 + RETURN
    auto set_instr = avm2_testing::InstructionBuilder(WireOpCode::SET_16)
                         .operand(uint16_t{ 0 })
                         .operand(MemoryTag::U8)
                         .operand(uint16_t{ 0x0F })
                         .build();
    auto not_instr =
        avm2_testing::InstructionBuilder(WireOpCode::NOT_16).operand(uint16_t{ 0 }).operand(uint16_t{ 1 }).build();
    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 1 }).build();

    auto original_bytecode = build_bytecode({ set_instr, not_instr, return_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, RoundTripSetFF)
{
    // Build: SET_FF + RETURN
    FF large_value = FF::random_element();
    auto set_instr = avm2_testing::InstructionBuilder(WireOpCode::SET_FF)
                         .operand(uint16_t{ 0 })
                         .operand(MemoryTag::FF)
                         .operand(large_value)
                         .build();
    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 0 }).build();

    auto original_bytecode = build_bytecode({ set_instr, return_instr });

    // Decompile
    auto fuzzer_data = decompile_bytecode(original_bytecode, {});

    // Rebuild
    auto rebuilt_bytecode = rebuild_bytecode(fuzzer_data);

    EXPECT_EQ(original_bytecode, rebuilt_bytecode);
}

TEST(BytecodeDecompiler, PreservesCalldata)
{
    std::vector<FF> calldata = { FF(1), FF(2), FF(42) };

    auto return_instr =
        avm2_testing::InstructionBuilder(WireOpCode::RETURN).operand(uint16_t{ 0 }).operand(uint16_t{ 0 }).build();
    auto bytecode = build_bytecode({ return_instr });

    auto fuzzer_data = decompile_bytecode(bytecode, calldata);

    EXPECT_EQ(fuzzer_data.calldata, calldata);
}

TEST(BytecodeDecompiler, EmptyBytecode)
{
    std::vector<uint8_t> empty_bytecode;
    std::vector<FF> calldata;

    auto fuzzer_data = decompile_bytecode(empty_bytecode, calldata);

    EXPECT_TRUE(fuzzer_data.instruction_blocks[0].empty());
}
