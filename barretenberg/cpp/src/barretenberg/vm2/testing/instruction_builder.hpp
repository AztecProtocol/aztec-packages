#pragma once

#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::testing {

struct OperandBuilder {
    OperandBuilder(simulation::Operand operand)
        : operand(operand)
    {}

    template <typename T> static OperandBuilder from(T value)
    {
        return OperandBuilder(simulation::Operand::from<T>(value));
    }

    OperandBuilder& indirect()
    {
        is_indirect = true;
        return *this;
    }
    OperandBuilder& relative()
    {
        is_relative = true;
        return *this;
    }

    simulation::Operand operand;
    bool is_relative = false;
    bool is_indirect = false;
};

class InstructionBuilder {
  private:
    WireOpCode opcode;
    std::vector<OperandBuilder> operands;

  public:
    InstructionBuilder(WireOpCode opcode)
        : opcode(opcode)
    {}

    InstructionBuilder& operand(OperandBuilder operand)
    {
        operands.push_back(operand);
        return *this;
    }
    template <typename T> InstructionBuilder& operand(T value) { return operand(OperandBuilder::from<T>(value)); }
    InstructionBuilder& operand(MemoryTag tag)
    {
        return operand(OperandBuilder::from<uint8_t>(static_cast<uint8_t>(tag)));
    }

    // We forward these to the last operand built, for convenience.
    InstructionBuilder& indirect()
    {
        operands.back().indirect();
        return *this;
    }
    InstructionBuilder& relative()
    {
        operands.back().relative();
        return *this;
    }

    simulation::Instruction build() const;
};

} // namespace bb::avm2::testing
