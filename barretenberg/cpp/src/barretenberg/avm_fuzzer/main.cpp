#include <iomanip>
#include <iostream>
#include <random>
#include <vector>

#include "fuzz_lib/control_flow.hpp"
#include "fuzz_lib/fuzz.hpp"
#include "fuzz_lib/fuzzer_data.hpp"
#include "mutations/fuzzer_data.hpp"

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
    std::mt19937_64 rng(std::random_device{}());

    for (int i = 0; i < 10; i++) {
        mutate_fuzzer_data(fuzzer_data, rng);
        fuzzer_data.instructions.push_back(return_instruction);
        std::cout << "Fuzzer data: " << fuzzer_data << std::endl;
        fuzz(fuzzer_data);
    }

    return 0;
}
