#include "barretenberg/vm2/common/memory_types.hpp"
#include <cstdint>
#include <variant>

#include "instruction.hpp"

std::vector<uint8_t> process_add_8_instruction(ADD_8_Instruction instruction) {}

std::vector<uint8_t> process_set_8_instruction(SET_8_Instruction instruction) {}

std::vector<uint8_t> InstructionBuilder::build_instruction(Instruction instruction)
{
    return std::visit(overloaded_instruction{
                          [](auto) { throw std::runtime_error("Invalid instruction"); },
                          [](ADD_8_Instruction instruction) { return process_add_8_instruction(instruction); },
                          [](SET_8_Instruction instruction) { return process_set_8_instruction(instruction); },
                      },
                      instruction);
}
