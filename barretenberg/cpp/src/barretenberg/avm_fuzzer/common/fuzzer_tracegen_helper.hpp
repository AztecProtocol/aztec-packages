#pragma once
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"
#include "barretenberg/vm2/tracegen_helper.hpp"

namespace bb::avm2::fuzzer {

class AvmFuzzerTraceGenHelper : protected AvmTraceGenHelper {
  public:
    void generate_trace_from_precomputed(tracegen::TraceContainer& trace,
                                         simulation::EventsContainer&& events,
                                         const PublicInputs& public_inputs);
    tracegen::TraceContainer generate_trace_with_precomputed_columns() { return generate_precomputed_columns(); }
    void fill_trace_interactions(tracegen::TraceContainer& trace);
};

} // namespace bb::avm2::fuzzer
