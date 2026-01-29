#pragma once

#include "barretenberg/avm_fuzzer/common/copyable_trace_container.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"

namespace bb::avm2::fuzzer {

class AvmFuzzerTraceGenHelper {
  public:
    AvmFuzzerTraceGenHelper() = default;

    CopyableTraceContainer generate_trace(simulation::EventsContainer&& events, const PublicInputs& public_inputs);
    // These are useful for debugging.
    void fill_trace_columns(CopyableTraceContainer& trace,
                            simulation::EventsContainer&& events,
                            const PublicInputs& public_inputs);
    void fill_trace_interactions(CopyableTraceContainer& trace);

    CopyableTraceContainer generate_precomputed_columns();
    CopyableTraceContainer generate_public_inputs_columns(const PublicInputs& public_inputs);
};

} // namespace bb::avm2::fuzzer
