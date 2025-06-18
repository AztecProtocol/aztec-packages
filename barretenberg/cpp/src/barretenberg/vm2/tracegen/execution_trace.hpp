#pragma once

#include <memory>
#include <optional>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class ExecutionTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& ex_events,
                 TraceContainer& trace);

    // Public for testing.
    void process_instr_fetching(const simulation::Instruction& instruction, TraceContainer& trace, uint32_t row);
    void process_execution_spec(const simulation::ExecutionEvent& ex_event, TraceContainer& trace, uint32_t row);
    void process_gas_base(const simulation::GasEvent& gas_event, TraceContainer& trace, uint32_t row);
    void process_addressing(const simulation::AddressingEvent& addr_event,
                            const simulation::Instruction& instruction,
                            TraceContainer& trace,
                            uint32_t row);
    void process_registers(ExecutionOpCode exec_opcode,
                           const std::vector<TaggedValue>& inputs,
                           const TaggedValue& output,
                           std::span<TaggedValue> registers,
                           TraceContainer& trace,
                           uint32_t row);
    void process_dynamic_gas(const simulation::GasEvent& gas_event, TraceContainer& trace, uint32_t row);

    static const InteractionDefinition interactions;
};

} // namespace bb::avm2::tracegen
