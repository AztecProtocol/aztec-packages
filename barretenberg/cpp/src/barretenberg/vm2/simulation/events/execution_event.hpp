#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

struct ExecutionEvent {
    // For sorting in tracegen.
    uint32_t order;

    uint32_t pc;
    BytecodeId bytecode_id;
    Instruction wire_instruction;
    ExecutionOpCode opcode;
    std::vector<Operand> resolved_operands;

    // Sub-events.
    AddressingEvent addressing_event;
    ContextEvent context_event;

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
