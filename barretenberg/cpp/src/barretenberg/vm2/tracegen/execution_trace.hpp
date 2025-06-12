#pragma once

#include <optional>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class ExecutionTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::ExecutionEvent>::Container& ex_events,
                 TraceContainer& trace);

    static std::vector<std::unique_ptr<class InteractionBuilderInterface>> lookup_jobs();

    // Public for testing.
    void process_addressing(const simulation::AddressingEvent& addr_event,
                            const simulation::Instruction& instruction,
                            TraceContainer& trace,
                            uint32_t row);
};

} // namespace bb::avm2::tracegen
