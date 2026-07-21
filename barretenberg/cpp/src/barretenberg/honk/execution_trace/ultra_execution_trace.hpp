// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_block.hpp"
#include "barretenberg/honk/execution_trace/generated/ultra_execution_trace_generated.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb {

/**
 * @brief Ultra execution trace wrapper. `UltraTraceBlockData` (codegen-emitted) lists the blocks
 * and their owned `GateKind`s; this class adds offset/size bookkeeping used by the prover.
 */
class UltraExecutionTraceBlocks : public UltraTraceBlockData {
  public:
    static constexpr size_t NUM_WIRES = UltraTraceBlock::NUM_WIRES;
    // The number of rows reserved at the top of the trace for row-disabling / ZK masking.
    static constexpr size_t TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK;
    using FF = fr;

    UltraExecutionTraceBlocks() = default;

    void compute_offsets(size_t trace_offset = TRACE_OFFSET)
    {
        uint32_t offset = static_cast<uint32_t>(trace_offset + NUM_ZERO_ROWS);
        for (auto& block : this->get()) {
            block.trace_offset_ = offset;
            offset += static_cast<uint32_t>(block.size());
        }
    }

    size_t get_total_content_size()
    {
        size_t total_size(0);
        for (const auto& block : this->get()) {
            total_size += block.size();
        }
        return total_size;
    }

    bool operator==(const UltraExecutionTraceBlocks& other) const = default;
};

} // namespace bb
