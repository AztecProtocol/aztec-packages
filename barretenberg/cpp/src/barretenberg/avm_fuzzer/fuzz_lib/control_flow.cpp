#include "control_flow.hpp"

void ControlFlow::add_instructions(std::vector<FuzzInstruction>& instructions)
{
    for (const auto& instruction : instructions) {
        current_block.process_instruction(instruction);
    }
}

// Helper function to create bytecode from a vector of instructions
std::vector<uint8_t> create_bytecode(const std::vector<bb::avm2::simulation::Instruction>& instructions)
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

std::vector<uint8_t> ControlFlow::build_bytecode()
{
    current_block.finalize_with_return(1, bb::avm2::MemoryTag::U8, 0);
    return create_bytecode(current_block.get_instructions());
}
