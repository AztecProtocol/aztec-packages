#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_block.hpp"

namespace bb {

/**
 * @brief Offset and size bookkeeping shared by both arithmetization families' trace wrappers.
 *
 * @tparam BlockData A generated `<Flavor>TraceBlockData` listing the blocks of one arithmetization and the
 * `GateKind`s each owns.
 */
template <typename BlockData> class ExecutionTraceBlocksBase : public BlockData {
  public:
    static constexpr size_t NUM_WIRES = BlockData::BlockBase::NUM_WIRES;
    using FF = fr;

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

    bool operator==(const ExecutionTraceBlocksBase& other) const = default;
};

/**
 * @brief Ultra execution trace wrapper: adds the Ultra-specific constants to the shared bookkeeping.
 *
 * @tparam BlockData A generated `<Flavor>TraceBlockData` listing the blocks of one Ultra arithmetization
 * and the `GateKind`s each owns. See `MegaExecutionTraceBlocks_`.
 */
template <typename BlockData> class UltraExecutionTraceBlocks_ : public ExecutionTraceBlocksBase<BlockData> {
  public:
    static constexpr bool IS_MEGA_ARITHMETIZATION = false;
    // The number of rows reserved at the top of the trace for row-disabling / ZK masking.
    static constexpr size_t TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK;

    UltraExecutionTraceBlocks_() = default;

    using ExecutionTraceBlocksBase<BlockData>::compute_offsets;
    void compute_offsets() { ExecutionTraceBlocksBase<BlockData>::compute_offsets(TRACE_OFFSET); }

    bool operator==(const UltraExecutionTraceBlocks_& other) const = default;
};

} // namespace bb
