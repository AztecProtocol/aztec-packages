#include <iomanip>
#include <iostream>
#include <vector>

#include "fuzz_lib/control_flow.hpp"
#include "fuzz_lib/fuzz.hpp"
#include "fuzz_lib/fuzzer_data.hpp"

using FuzzInstruction = ::FuzzInstruction;

int main()
{
    // set + return
    auto set_instruction = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 2, .value = 10 };
    auto return_instruction = RETURN_Instruction{ .return_size = 1,
                                                  .return_value_tag = bb::avm2::MemoryTag::U8,
                                                  .return_value_offset_index = 0x20 };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, return_instruction };
    auto fuzzer_data = FuzzerData{ .instructions = instructions, .calldata = {} };

    fuzz(fuzzer_data);

    // set + add + return
    auto add_instruction = ADD_8_Instruction{
        .argument_tag = bb::avm2::MemoryTag::U8, .a_offset_index = 0, .b_offset_index = 1, .result_offset = 2
    };
    instructions = std::vector<FuzzInstruction>{ set_instruction, add_instruction, return_instruction };
    fuzzer_data = FuzzerData{ .instructions = instructions, .calldata = {} };
    fuzz(fuzzer_data);

    return 0;
}
