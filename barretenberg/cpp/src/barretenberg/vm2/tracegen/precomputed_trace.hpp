#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// This fills the trace for the "general" precomputed columns.
// See precomputed.pil.
class PrecomputedTraceBuilder final {
  public:
    void process_misc(TraceContainer& trace, const uint32_t num_rows = CIRCUIT_SUBGROUP_SIZE);
    void process_bitwise(TraceContainer& trace);
    void process_sel_range_8(TraceContainer& trace);
    void process_sel_range_16(TraceContainer& trace);
    void process_power_of_2(TraceContainer& trace);
    void process_sha256_round_constants(TraceContainer& trace);
    void process_integral_tag_length(TraceContainer& trace);
    void process_wire_instruction_spec(TraceContainer& trace);
    void process_exec_instruction_spec(TraceContainer& trace);
    void process_to_radix_safe_limbs(TraceContainer& trace);
    void process_to_radix_p_decompositions(TraceContainer& trace);
    void process_memory_tag_range(TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
