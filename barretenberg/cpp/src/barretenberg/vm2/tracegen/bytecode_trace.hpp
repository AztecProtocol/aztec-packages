#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class BytecodeTraceBuilder final {
  public:
    void process_hashing(const simulation::EventEmitterInterface<simulation::BytecodeHashingEvent>::Container& events,
                         TraceContainer& trace);

    void process_retrieval(
        const simulation::EventEmitterInterface<simulation::BytecodeRetrievalEvent>::Container& events,
        TraceContainer& trace);

    void process_decomposition(
        const simulation::EventEmitterInterface<simulation::BytecodeDecompositionEvent>::Container& events,
        TraceContainer& trace);

    void process_instruction_fetching(
        const simulation::EventEmitterInterface<simulation::InstructionFetchingEvent>::Container& events,
        TraceContainer& trace);
};

} // namespace bb::avm2::tracegen