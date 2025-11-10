#include <gtest/gtest.h>
#include <iostream>

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace arithmetic {

// set(addr 0, 5) set(addr 1, 2) OP(addr 0, addr 1, addr 2) return(addr 2)
FF get_result_of_instruction(FuzzInstruction instruction,
                             bb::avm2::MemoryTag return_value_tag = bb::avm2::MemoryTag::U8)
{
    auto set_instruction_1 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 0, .value = 5 };
    auto set_instruction_2 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 1, .value = 2 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction_1, set_instruction_2, instruction };

    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = return_value_tag, .return_value_offset_index = 2 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    return result.output.at(0);
}

TEST(fuzz, ADD8)
{
    auto add_instruction = ADD_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(add_instruction);
    EXPECT_EQ(result, 7);
}

TEST(fuzz, SUB8)
{
    auto sub_instruction = SUB_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(sub_instruction);
    EXPECT_EQ(result, 3);
}

TEST(fuzz, MUL8)
{
    auto mul_instruction = MUL_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(mul_instruction);
    EXPECT_EQ(result, 10);
}

TEST(fuzz, DIV8)
{
    auto div_instruction = DIV_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(div_instruction);
    EXPECT_EQ(result, 2);
}

TEST(fuzz, EQ8)
{
    auto eq_instruction = EQ_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(eq_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST(fuzz, LT8)
{
    auto lt_instruction = LT_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(lt_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST(fuzz, LTE8)
{
    auto lte_instruction = LTE_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(lte_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST(fuzz, AND8)
{
    auto and_instruction = AND_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(and_instruction);
    EXPECT_EQ(result, 0);
}

TEST(fuzz, OR8)
{
    auto or_instruction = OR_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(or_instruction);
    EXPECT_EQ(result, 7);
}

TEST(fuzz, XOR8)
{
    auto xor_instruction = XOR_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(xor_instruction);
    EXPECT_EQ(result, 7);
}

TEST(fuzz, SHL8)
{
    auto shl_instruction = SHL_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(shl_instruction);
    EXPECT_EQ(result, 20);
}

TEST(fuzz, SHR8)
{
    auto shr_instruction = SHR_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction(shr_instruction);
    EXPECT_EQ(result, 1);
}

// set(0, 4, FF) set(1, 2, FF) fdiv(FF, 0, 1, 2) return(2)
TEST(fuzz, FDIV8)
{
    auto fdiv_instruction = FDIV_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::FF, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto set_instruction_1 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF, .offset = 0, .value = 4 };
    auto set_instruction_2 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF, .offset = 1, .value = 2 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction_1, set_instruction_2, fdiv_instruction };

    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 2 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), 2);
}

// set(0, 0, U8) not(U8, 0, 1) return(1)
TEST(fuzz, NOT8)
{
    auto set_instruction = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 0, .value = 0 };
    auto not_instruction =
        NOT_8_Instruction{ .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .result_offset = 1 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, not_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), 255);
}

// Helper function for 16-bit instructions
// set(addr 0, 5) set(addr 1, 2) OP_16(addr 0, addr 1, addr 2) return(addr 2)
FF get_result_of_instruction_16(FuzzInstruction instruction,
                                bb::avm2::MemoryTag return_value_tag = bb::avm2::MemoryTag::U8)
{
    auto set_instruction_1 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 0, .value = 5 };
    auto set_instruction_2 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 1, .value = 2 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction_1, set_instruction_2, instruction };

    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = return_value_tag, .return_value_offset_index = 2 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    return result.output.at(0);
}

TEST(fuzz, ADD16)
{
    auto add_instruction = ADD_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(add_instruction);
    EXPECT_EQ(result, 7);
}

TEST(fuzz, SUB16)
{
    auto sub_instruction = SUB_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(sub_instruction);
    EXPECT_EQ(result, 3);
}

TEST(fuzz, MUL16)
{
    auto mul_instruction = MUL_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(mul_instruction);
    EXPECT_EQ(result, 10);
}

TEST(fuzz, DIV16)
{
    auto div_instruction = DIV_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(div_instruction);
    EXPECT_EQ(result, 2);
}

TEST(fuzz, EQ16)
{
    auto eq_instruction = EQ_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(eq_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST(fuzz, LT16)
{
    auto lt_instruction = LT_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(lt_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST(fuzz, LTE16)
{
    auto lte_instruction = LTE_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(lte_instruction, bb::avm2::MemoryTag::U1);
    EXPECT_EQ(result, 0);
}

TEST(fuzz, AND16)
{
    auto and_instruction = AND_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(and_instruction);
    EXPECT_EQ(result, 0);
}

TEST(fuzz, OR16)
{
    auto or_instruction = OR_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(or_instruction);
    EXPECT_EQ(result, 7);
}

TEST(fuzz, XOR16)
{
    auto xor_instruction = XOR_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(xor_instruction);
    EXPECT_EQ(result, 7);
}

TEST(fuzz, SHL16)
{
    auto shl_instruction = SHL_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(shl_instruction);
    EXPECT_EQ(result, 20);
}

TEST(fuzz, SHR16)
{
    auto shr_instruction = SHR_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto result = get_result_of_instruction_16(shr_instruction);
    EXPECT_EQ(result, 1);
}

// set(0, 4, FF) set(1, 2, FF) fdiv_16(FF, 0, 1, 2) return(2)
TEST(fuzz, FDIV16)
{
    auto fdiv_instruction = FDIV_16_Instruction{
        .argument_tag = bb::avm2::MemoryTag::FF, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    auto set_instruction_1 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF, .offset = 0, .value = 4 };
    auto set_instruction_2 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::FF, .offset = 1, .value = 2 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction_1, set_instruction_2, fdiv_instruction };

    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 2 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), 2);
}

// set(0, 0, U8) not_16(U8, 0, 1) return(1)
TEST(fuzz, NOT16)
{
    auto set_instruction = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 0, .value = 0 };
    auto not_instruction =
        NOT_16_Instruction{ .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .result_offset = 1 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, not_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), 255);
}
} // namespace arithmetic

namespace type_conversion {
// set(10, 1, U16) set(0, 2, U8) cast_8(U8, 0, 1, U16) return(1)
// if cast worked, should return 2 (the U8 value cast to U16)
// if cast failed, should return 1 (the original U16 value)
TEST(fuzz, CAST8)
{
    auto set_u16 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U16, .offset = 10, .value = 1 };
    auto set_u8 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 0, .value = 2 };
    auto cast_instruction = CAST_8_Instruction{ .src_tag = bb::avm2::MemoryTag::U8,
                                                .src_offset_index = 0,
                                                .dst_offset = 1,
                                                .target_tag = bb::avm2::MemoryTag::U16 };
    auto instructions = std::vector<FuzzInstruction>{ set_u16, set_u8, cast_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U16, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), 2);
}

// set(10, 1, U16) set(0, 2, U8) cast_16(U8, 0, 1, U16) return(1)
// if cast worked, should return 2 (the U8 value cast to U16)
// if cast failed, should return 1 (the original U16 value)
TEST(fuzz, CAST16)
{
    auto set_u16 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U16, .offset = 10, .value = 1 };
    auto set_u8 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 0, .value = 2 };
    auto cast_instruction = CAST_16_Instruction{ .src_tag = bb::avm2::MemoryTag::U8,
                                                 .src_offset_index = 0,
                                                 .dst_offset = 1,
                                                 .target_tag = bb::avm2::MemoryTag::U16 };
    auto instructions = std::vector<FuzzInstruction>{ set_u16, set_u8, cast_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U16, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), 2);
}
} // namespace type_conversion

namespace machine_memory {
// set(0, 0xabcd, U16) return(0)
TEST(fuzz, SET16)
{
    const uint16_t test_value = 0xABCD;
    auto set_instruction =
        SET_16_Instruction{ .value_tag = bb::avm2::MemoryTag::U16, .offset = 0, .value = test_value };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U16, .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}
// set(0, 0x12345678, U32) return(0)
TEST(fuzz, SET32)
{
    const uint32_t test_value = 0x12345678UL;
    auto set_instruction =
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .offset = 0, .value = test_value };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U32, .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, 0xabcdef0123456789, U64) return(0)
TEST(fuzz, SET64)
{
    const uint64_t test_value = 0xABCDEF0123456789ULL;
    auto set_instruction =
        SET_64_Instruction{ .value_tag = bb::avm2::MemoryTag::U64, .offset = 0, .value = test_value };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U64, .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, something, U128) return(0)
TEST(fuzz, SET128)
{
    const uint64_t test_value_low = 0xFEDCBA9876543210ULL;
    const uint64_t test_value_high = 0x123456789ABCDEF0ULL;
    const uint128_t test_value =
        (static_cast<uint128_t>(test_value_high) << 64) | static_cast<uint128_t>(test_value_low);
    auto set_instruction = SET_128_Instruction{
        .value_tag = bb::avm2::MemoryTag::U128, .offset = 0, .value_low = test_value_low, .value_high = test_value_high
    };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options = ReturnOptions{ .return_size = 1,
                                         .return_value_tag = bb::avm2::MemoryTag::U128,
                                         .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, 123456789, FF) return(0)
TEST(fuzz, SETFF)
{
    const bb::avm2::FF test_value = bb::avm2::FF(123456789);
    auto set_instruction = SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF, .offset = 0, .value = test_value };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::FF, .return_value_offset_index = 0 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, 0x42, U8) set(1, 0x43, U8) mov_8(U8, 0, 1) return(1)
TEST(fuzz, MOV8)
{
    const uint8_t test_value = 0x42;
    const uint8_t test_value2 = 0x43;
    auto set_instruction = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 0, .value = test_value };
    auto set_instruction2 =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 1, .value = test_value2 };
    auto mov_instruction =
        MOV_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .src_offset_index = 0, .dst_offset = 1 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, set_instruction2, mov_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

// set(0, 0xbabe, U16) set(1, 0xc0fe, U16) mov_16(U16, 0, 1) return(1)
TEST(fuzz, MOV16)
{
    const uint16_t test_value = 0xbabe;
    const uint16_t test_value2 = 0xc0fe;
    auto set_instruction =
        SET_16_Instruction{ .value_tag = bb::avm2::MemoryTag::U16, .offset = 0, .value = test_value };
    auto set_instruction2 =
        SET_16_Instruction{ .value_tag = bb::avm2::MemoryTag::U16, .offset = 1, .value = test_value2 };
    auto mov_instruction =
        MOV_16_Instruction{ .value_tag = bb::avm2::MemoryTag::U16, .src_offset_index = 0, .dst_offset = 1 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, set_instruction2, mov_instruction };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U16, .return_value_offset_index = 1 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instructions };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), test_value);
}

} // namespace machine_memory

namespace control_flow {

// block1 set return value 10
//   ↓
// block2 set return value 11 and return return value
TEST(fuzz, JumpToNewBlockSmoke)
{
    auto block1_instructions = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U8, .offset = 10, .value = 10 } };
    auto block2_instructions = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U8, .offset = 10, .value = 11 } };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ block1_instructions, block2_instructions };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(JumpToNewBlock{ .target_program_block_instruction_block_idx = 1 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), 11);
}

// block1 set return value 10
//   ↓
// block2 set return value 11
//   ↓
// block3 set return value 12 and return return value
TEST(fuzz, JumpToNewBlockSmoke2)
{
    auto block1_instructions = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U8, .offset = 10, .value = 10 } };
    auto block2_instructions = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U8, .offset = 10, .value = 11 } };
    auto block3_instructions = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U8, .offset = 10, .value = 12 } };
    auto instruction_blocks =
        std::vector<std::vector<FuzzInstruction>>{ block1_instructions, block2_instructions, block3_instructions };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(JumpToNewBlock{ .target_program_block_instruction_block_idx = 1 });
    control_flow.process_cfg_instruction(JumpToNewBlock{ .target_program_block_instruction_block_idx = 2 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), 12);
}

// block1 set u8 value 10
//   ↓
// block2 tries to return u8
// if blocks does not share defined variables, block2 will return 0
TEST(fuzz, JumpToNewBlockSharesVariables)
{
    auto block1_instructions = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U8, .offset = 10, .value = 10 } };

    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ block1_instructions };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(JumpToNewBlock{ .target_program_block_instruction_block_idx = 1 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    EXPECT_EQ(result.output.at(0), 10);
}

//     block1 set u1 condition value
//   ↙        ↘
// return 11    return 12
TEST(fuzz, JumpIfToNewBlockSmoke)
{
    auto set_true_block = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U1, .offset = 1, .value = 1 } };
    auto set_false_block = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U1, .offset = 1, .value = 0 } };
    auto block2_instructions = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U8, .offset = 10, .value = 11 } };
    auto block3_instructions = std::vector<FuzzInstruction>{ SET_8_Instruction{
        .value_tag = bb::avm2::MemoryTag::U8, .offset = 10, .value = 12 } };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{
        set_true_block, set_false_block, block2_instructions, block3_instructions
    };
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto control_flow = ControlFlow(instruction_blocks);
    // set true, go to block2
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 2,
                                                           .else_program_block_instruction_block_idx = 3,
                                                           .condition_offset_index = 1 });
    auto bytecode_1 = control_flow.build_bytecode(return_options);
    auto control_flow2 = ControlFlow(instruction_blocks);
    // set false, go to block3
    control_flow2.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 1 });
    control_flow2.process_cfg_instruction(JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 2,
                                                            .else_program_block_instruction_block_idx = 3,
                                                            .condition_offset_index = 1 });
    auto bytecode_2 = control_flow2.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result_1 = cpp_simulator.simulate(bytecode_1, {});
    auto cpp_simulator2 = CppSimulator();
    auto result_2 = cpp_simulator2.simulate(bytecode_2, {});
    EXPECT_EQ(result_1.output.at(0), 11);
    EXPECT_EQ(result_2.output.at(0), 12);
}

//     set u1 condition value b1
//      ↙        ↘
//    set u1 b2     return 4
//    ↙   ↘
// ret 2 ret 3
FF simulate_jump_if_depth_2_helper(uint8_t first_boolean_value, uint8_t second_boolean_value)
{
    auto set_instruction_block_1 =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U1, .offset = 1, .value = first_boolean_value };
    auto instruction_block_1 = std::vector<FuzzInstruction>{ set_instruction_block_1 };
    auto set_instruction_block_2 =
        SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U1, .offset = 2, .value = second_boolean_value };
    auto instruction_block_2 = std::vector<FuzzInstruction>{ set_instruction_block_2 };
    auto instruction_blocks = std::vector<std::vector<FuzzInstruction>>{ instruction_block_1, instruction_block_2 };
    for (uint8_t i = 2; i < 5; i++) {
        auto set_instruction = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = i, .value = i };
        instruction_blocks.push_back({ set_instruction });
    }
    auto return_options =
        ReturnOptions{ .return_size = 1, .return_value_tag = bb::avm2::MemoryTag::U8, .return_value_offset_index = 1 };
    auto control_flow = ControlFlow(instruction_blocks);
    control_flow.process_cfg_instruction(InsertSimpleInstructionBlock{ .instruction_block_idx = 0 });
    control_flow.process_cfg_instruction(
        JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 1, // set second boolean
                          .else_program_block_instruction_block_idx = 4, // set 4
                          .condition_offset_index = 0 });
    control_flow.process_cfg_instruction(JumpIfToNewBlock{ .then_program_block_instruction_block_idx = 2, // set 2
                                                           .else_program_block_instruction_block_idx = 3, // set 3
                                                           .condition_offset_index = 1 });
    auto bytecode = control_flow.build_bytecode(return_options);
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    return result.output.at(0);
}

TEST(fuzz, JumpIfDepth2Smoke)
{
    EXPECT_EQ(simulate_jump_if_depth_2_helper(1, 1), 2);
    EXPECT_EQ(simulate_jump_if_depth_2_helper(1, 0), 3);
    EXPECT_EQ(simulate_jump_if_depth_2_helper(0, 1), 4);
    EXPECT_EQ(simulate_jump_if_depth_2_helper(0, 0), 4);
}
} // namespace control_flow
