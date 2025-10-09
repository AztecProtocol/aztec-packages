
#include "fuzz.hpp"
#include "control_flow.hpp"
#include "fuzzer_data.hpp"
#include "simulator.hpp"

namespace arithmetic {

// set(addr 0, 5) set(addr 1, 2) OP(addr 0, addr 1, addr 2) return(addr 2)
FF get_result_of_instruction(FuzzInstruction instruction)
{
    auto set_instruction_1 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 0, .value = 5 };
    auto set_instruction_2 = SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U8, .offset = 1, .value = 2 };
    auto return_instruction = RETURN_Instruction{ .return_size = 1,
                                                  .return_value_tag = bb::avm2::MemoryTag::U8,
                                                  .return_value_offset_index = 2 };
    auto instructions =
        std::vector<FuzzInstruction>{ set_instruction_1, set_instruction_2, instruction, return_instruction };
    auto control_flow = ControlFlow();
    control_flow.add_instructions(instructions);
    auto bytecode = control_flow.build_bytecode();
    auto cpp_simulator = CppSimulator();
    auto result = cpp_simulator.simulate(bytecode, {});
    return result.output[0];
}

} // namespace arithmetic
