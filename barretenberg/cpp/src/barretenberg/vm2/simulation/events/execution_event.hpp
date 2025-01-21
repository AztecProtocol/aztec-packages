#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

struct ExecutionEvent {
    uint32_t pc;
    BytecodeId bytecode_id;
    Instruction wire_instruction;
    const InstructionSpec& instruction_spec;
    ExecutionOpCode opcode;
    std::vector<Operand> resolved_operands;
};

} // namespace bb::avm2::simulation