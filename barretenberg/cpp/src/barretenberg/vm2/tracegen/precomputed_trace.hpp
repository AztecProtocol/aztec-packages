#pragma once

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// Currently due to the bitwise tables.
constexpr uint32_t PRECOMPUTED_TRACE_SIZE = (3 << 16);

// precomputed trace size must be greater than the public inputs trace size
// because we use precomputed_idx to lookup into the public inputs trace.
static_assert(PRECOMPUTED_TRACE_SIZE >= AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

// This fills the trace for the "general" precomputed columns.
// See precomputed.pil.
class PrecomputedTraceBuilder final {
  public:
    void process_misc(TraceContainer& trace, const uint32_t num_rows = PRECOMPUTED_TRACE_SIZE);
    void process_bitwise(TraceContainer& trace);
    void process_sel_range_8(TraceContainer& trace);
    void process_sel_range_16(TraceContainer& trace);
    void process_power_of_2(TraceContainer& trace);
    void process_sha256_round_constants(TraceContainer& trace);
    void process_tag_parameters(TraceContainer& trace);
    void process_wire_instruction_spec(TraceContainer& trace);
    void process_exec_instruction_spec(TraceContainer& trace);
    void process_to_radix_safe_limbs(TraceContainer& trace);
    void process_to_radix_p_decompositions(TraceContainer& trace);
    void process_memory_tag_range(TraceContainer& trace);
    void process_addressing_gas(TraceContainer& trace);
    void process_phase_table(TraceContainer& trace);
    void process_keccak_round_constants(TraceContainer& trace);
    void process_get_env_var_table(TraceContainer& trace);
    void process_get_contract_instance_table(TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
