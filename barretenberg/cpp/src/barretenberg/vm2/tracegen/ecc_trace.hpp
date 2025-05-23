#pragma once

#include <memory>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class EccTraceBuilder final {
  public:
    void process_add(const simulation::EventEmitterInterface<simulation::EccAddEvent>::Container& events,
                     TraceContainer& trace);
    void process_scalar_mul(const simulation::EventEmitterInterface<simulation::ScalarMulEvent>::Container& events,
                            TraceContainer& trace);

    static std::vector<std::unique_ptr<class InteractionBuilderInterface>> lookup_jobs();
};

} // namespace bb::avm2::tracegen
