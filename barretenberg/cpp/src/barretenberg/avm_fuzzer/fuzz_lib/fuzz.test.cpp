#include <gtest/gtest.h>

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
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

} // namespace arithmetic
