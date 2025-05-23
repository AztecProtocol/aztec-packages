#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

struct ExecutionEvent {
    bool error = false;
    BytecodeId bytecode_id;
    Instruction wire_instruction;
    ExecutionOpCode opcode;
    std::vector<Operand> resolved_operands;

    // Inputs and Outputs for a gadget/subtrace used when allocating registers in the execution trace.
    std::vector<TaggedValue> inputs;
    TaggedValue output;

    // Context Id for the next context.
    uint32_t next_context_id;

    // Sub-events.
    AddressingEvent addressing_event;
    ContextEvent before_context_event; // FIXME: currently unused (also might be overkill).
    ContextEvent after_context_event;
};

} // namespace bb::avm2::simulation
