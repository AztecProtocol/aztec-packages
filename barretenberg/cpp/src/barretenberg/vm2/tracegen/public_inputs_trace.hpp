#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// This fills the trace for the public inputs columns & aux columns.
// See public_inputs.pil.
class PublicInputsTraceBuilder final {
  public:
    void process_public_inputs(TraceContainer& trace, const PublicInputs& public_inputs);
    void process_public_inputs_aux_precomputed(TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
