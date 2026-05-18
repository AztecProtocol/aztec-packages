// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_block.hpp"
#include "barretenberg/honk/execution_trace/generated/mega_execution_trace_generated.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include <cstdint>

namespace bb {

/**
 * @brief Mega execution trace wrapper. `MegaTraceBlockData` (codegen-emitted) lists the blocks
 * and their owned `GateKind`s; this class adds offset/size bookkeeping used by the prover.
 *
 * @note The `ecc_op` block must be first in the trace so the `ecc_op_wire` polynomials align with
 * the main wires via `ecc_op_wire[r] == w_shift[r]` (enforced by EccOpQueueRelation).
 */
class MegaExecutionTraceBlocks : public MegaTraceBlockData {
  public:
    static constexpr size_t NUM_WIRES = MegaTraceBlock::NUM_WIRES;
    using FF = fr;

    MegaExecutionTraceBlocks() = default;

    void compute_offsets(size_t trace_offset)
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

    size_t get_total_size() const
    {
        size_t total_size = 1; // start at 1 because the 0th row is unused for selectors for Honk
        for (const auto& block : this->get()) {
            total_size += block.size();
        }
        return total_size;
    }

    bool operator==(const MegaExecutionTraceBlocks& other) const = default;
};

} // namespace bb
