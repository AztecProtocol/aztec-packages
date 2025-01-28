#pragma once

#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// This fills the trace for the "general" precomputed columns.
// See precomputed.pil.
class PrecomputedTraceBuilder final {
  public:
    void process_misc(TraceContainer& trace);
    void process_bitwise(TraceContainer& trace);
    void process_sel_range_8(TraceContainer& trace);
    void process_sel_range_16(TraceContainer& trace);
    void process_power_of_2(TraceContainer& trace);
    void process_sha256_round_constants(TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
