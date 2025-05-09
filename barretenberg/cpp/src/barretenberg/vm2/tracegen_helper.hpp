#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2 {

class AvmTraceGenHelper {
  public:
    AvmTraceGenHelper() = default;

    tracegen::TraceContainer generate_trace(simulation::EventsContainer&& events, const PublicInputs& public_inputs);
    tracegen::TraceContainer generate_precomputed_columns();
    tracegen::TraceContainer generate_public_inputs_columns(const PublicInputs& public_inputs);
};

} // namespace bb::avm2
