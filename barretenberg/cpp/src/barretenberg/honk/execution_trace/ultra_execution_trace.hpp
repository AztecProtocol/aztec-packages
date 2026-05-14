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
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb {

using UltraTraceBlock = ExecutionTraceBlock<fr, 4>;

/**
 * @brief Defines the circuit block types for the Ultra arithmetization
 */
struct UltraTraceBlockData {
    UltraTraceBlock pub_inputs{}; // Has to be the first block; no gate selector.
    UltraTraceBlock lookup{ GateKind::Lookup };
    UltraTraceBlock arithmetic{ GateKind::Arith };
    UltraTraceBlock delta_range{ GateKind::DeltaRange };
    UltraTraceBlock elliptic{ GateKind::Elliptic };
    UltraTraceBlock memory{ GateKind::Memory };
    UltraTraceBlock nnf{ GateKind::Nnf };
    UltraTraceBlock poseidon2_external{ GateKind::Poseidon2Ext };
    UltraTraceBlock poseidon2_internal{ GateKind::Poseidon2Int };

    static constexpr size_t NUM_BLOCKS = 9;

    auto get()
    {
        return RefArray(std::array<UltraTraceBlock*, NUM_BLOCKS>{ &pub_inputs,
                                                                  &lookup,
                                                                  &arithmetic,
                                                                  &delta_range,
                                                                  &elliptic,
                                                                  &memory,
                                                                  &nnf,
                                                                  &poseidon2_external,
                                                                  &poseidon2_internal });
    }

    auto get() const
    {
        return RefArray(std::array<const UltraTraceBlock*, NUM_BLOCKS>{ &pub_inputs,
                                                                        &lookup,
                                                                        &arithmetic,
                                                                        &delta_range,
                                                                        &elliptic,
                                                                        &memory,
                                                                        &nnf,
                                                                        &poseidon2_external,
                                                                        &poseidon2_internal });
    }

    auto get_gate_blocks() const
    {
        return RefArray(std::array<const UltraTraceBlock*, 8>{
            &lookup,
            &arithmetic,
            &delta_range,
            &elliptic,
            &memory,
            &nnf,
            &poseidon2_external,
            &poseidon2_internal,
        });
    }

    bool operator==(const UltraTraceBlockData& other) const = default;
};

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

    void summarize() const
    {
        info("Gate blocks summary:");
        info("pub inputs :\t", this->pub_inputs.size());
        info("lookups    :\t", this->lookup.size());
        info("arithmetic :\t", this->arithmetic.size());
        info("delta range:\t", this->delta_range.size());
        info("elliptic   :\t", this->elliptic.size());
        info("memory     :\t", this->memory.size());
        info("nnf        :\t", this->nnf.size());
        info("poseidon ext  :\t", this->poseidon2_external.size());
        info("poseidon int  :\t", this->poseidon2_internal.size());
    }

    // Get cumulative size of all blocks
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
