#pragma once
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"
#include "barretenberg/vm2/tracegen_helper.hpp"

namespace bb::avm2::fuzzer {

class AvmFuzzerTraceGenHelper : protected AvmTraceGenHelper {
  public:
    tracegen::TraceContainer generate_trace_without_precomputed_columns(tracegen::TraceContainer& trace,
                                                                        simulation::EventsContainer&& events,
                                                                        const PublicInputs& public_inputs);
};

} // namespace bb::avm2::fuzzer
