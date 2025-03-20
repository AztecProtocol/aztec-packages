#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {

class InstructionInfoDBInterface {
  public:
    virtual ~InstructionInfoDBInterface() = default;

    virtual const ExecInstructionSpec& get(ExecutionOpCode opcode) const = 0;
    virtual const WireInstructionSpec& get(WireOpCode opcode) const = 0;
};

class InstructionInfoDB : public InstructionInfoDBInterface {
  public:
    const ExecInstructionSpec& get(ExecutionOpCode opcode) const override
    {
        auto it = EXEC_INSTRUCTION_SPEC.find(opcode);
        if (it == EXEC_INSTRUCTION_SPEC.end()) {
            throw std::runtime_error("Cannot find instruction spec for opcode: " +
                                     std::to_string(static_cast<int>(opcode)));
        }
        return it->second;
    }
    const WireInstructionSpec& get(WireOpCode opcode) const override
    {
        auto it = WIRE_INSTRUCTION_SPEC.find(opcode);
        if (it == WIRE_INSTRUCTION_SPEC.end()) {
            throw std::runtime_error("Cannot find wire instruction spec for opcode: " +
                                     std::to_string(static_cast<int>(opcode)));
        }
        return it->second;
    }
};

} // namespace bb::avm2::simulation
