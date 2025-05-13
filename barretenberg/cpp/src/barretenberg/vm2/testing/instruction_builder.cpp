#include "barretenberg/vm2/testing/instruction_builder.hpp"

namespace bb::avm2::testing {

simulation::Instruction InstructionBuilder::build() const
{
    // First we compute the indirect and relative contributions of each operand.
    uint16_t indirect = 0;
    for (size_t i = 0; i < operands.size(); ++i) {
        if (operands[i].is_relative) {
            indirect |= static_cast<uint16_t>(1 << (i * 2 + 1));
        }
        if (operands[i].is_indirect) {
            indirect |= static_cast<uint16_t>(1 << (i * 2));
        }
    }

    // Then we build the instruction.
    std::vector<simulation::Operand> operands_vec;
    operands_vec.reserve(operands.size());
    for (const auto& operand : operands) {
        operands_vec.push_back(operand.operand);
    }
    return simulation::Instruction(opcode, indirect, std::move(operands_vec));
}

} // namespace bb::avm2::testing
