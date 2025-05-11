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
#include "barretenberg/vm2/simulation/events/internal_call_stack_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

struct ExecutionEvent {
    // For sorting in tracegen.
    uint32_t order;
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
    ContextEvent context_event;

    // Internal Call Stack Info
    InternalCallStackEvent internal_call_event;
    InternalCallId internal_call_id = 0;
    InternalCallId internal_call_return_id = 0;
    InternalCallId next_internal_call_id = 0;

    // Not thread safe.
    static ExecutionEvent allocate()
    {
        static uint32_t last_order = 0;
        ExecutionEvent event;
        event.order = last_order++;
        return event;
    }

  private:
    ExecutionEvent() = default;
};

} // namespace bb::avm2::simulation
