#include <iomanip>
#include <iostream>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "fuzz_lib/control_flow.hpp"
#include "fuzz_lib/fuzz.hpp"
#include "fuzz_lib/fuzzer_data.hpp"

using FuzzInstruction = ::Instruction;

using bb::avm2::GlobalVariables;
using namespace bb::avm2;
using namespace bb::avm2::simulation;
using namespace bb::avm2::testing;

int main()
{
    // set + return
    auto set_instruction =
        SET_8_Instruction{ .argument = { .offset_index = 2, .argument_tag = bb::avm2::MemoryTag::U8 }, .value = 10 };
    auto return_instruction = RETURN_Instruction{
        .return_size = 1, .return_value_offset_index = { .offset_index = 0x20, .argument_tag = bb::avm2::MemoryTag::U8 }
    };
    auto instructions = std::vector<FuzzInstruction>{ set_instruction, return_instruction };
    auto fuzzer_data = FuzzerData{ .instructions = instructions, .calldata = {} };

    fuzz(fuzzer_data);

    // set + add + return
    auto add_instruction =
        ADD_8_Instruction{ .a = { .offset_index = 0, .argument_tag = bb::avm2::MemoryTag::U8 },
                           .b = { .offset_index = 1, .argument_tag = bb::avm2::MemoryTag::U8 },
                           .result = { .offset_index = 2, .argument_tag = bb::avm2::MemoryTag::U8 } };
    instructions = std::vector<FuzzInstruction>{ set_instruction, add_instruction, return_instruction };
    fuzzer_data = FuzzerData{ .instructions = instructions, .calldata = {} };
    fuzz(fuzzer_data);

    return 0;
}
