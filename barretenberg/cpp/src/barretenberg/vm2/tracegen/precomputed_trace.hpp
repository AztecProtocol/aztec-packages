#pragma once

#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// This fills the trace for the "general" precomputed columns.
// See precomputed.pil.
class PrecomputedTraceBuilder final {
  public:
    void process_misc(TraceContainer& trace);
    void process_bitwise(TraceContainer& trace);
};

} // namespace bb::avm2::tracegen