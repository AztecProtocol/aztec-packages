#pragma once

#include <memory>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/sha256_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class Sha256TraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::Sha256CompressionEvent>::Container& events,
                 TraceContainer& trace);

    static const InteractionDefinition interactions;

  private:
    uint32_t row = 1; // Start from 1 to avoid the precomputed row.

    void into_limbs_with_witness(const uint64_t, const uint8_t b, Column c_lhs, Column c_rhs, TraceContainer& trace);
    uint32_t ror_with_witness(
        const uint32_t val, const uint8_t shift, Column c_result, Column c_lhs, Column c_rhs, TraceContainer& trace);
    uint32_t shr_with_witness(
        const uint32_t val, const uint8_t shift, Column c_result, Column c_lhs, Column c_rhs, TraceContainer& trace);
    uint32_t compute_w_with_witness(const std::array<uint32_t, 16>& prev_w_helpers, TraceContainer& trace);
    std::array<uint32_t, 8> compute_compression_with_witness(const std::array<uint32_t, 8>& state,
                                                             uint32_t round_w,
                                                             uint32_t round_constant,
                                                             uint32_t row,
                                                             TraceContainer& trace);
    void set_helper_cols(const std::array<uint32_t, 16>& prev_w_helpers, TraceContainer& trace);
    void set_init_state_cols(const std::array<uint32_t, 8>& init_state, TraceContainer& trace);
    void set_state_cols(const std::array<uint32_t, 8>& state, TraceContainer& trace);
    void compute_sha256_output(const std::array<uint32_t, 8>& out_state,
                               const std::array<uint32_t, 8>& init_state,
                               TraceContainer& trace);
};

} // namespace bb::avm2::tracegen
