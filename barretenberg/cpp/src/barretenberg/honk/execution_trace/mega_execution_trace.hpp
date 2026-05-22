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
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include <cstdint>

namespace bb {

using MegaTraceBlock = ExecutionTraceBlock<fr, /*NUM_WIRES_ */ 4>;

/**
 * @brief A container indexed by the types of the blocks in the execution trace.
 *
 * @details We instantiate this both to contain the actual gates of an execution trace, and also to describe different
 * trace structures (i.e., sets of capacities for each block type, which we use to optimize the folding prover).
 *
 * @note The ecc_op block must be first in the execution trace so that the `ecc_op_wire` polynomials
 * (populated by TraceToPolynomials::add_ecc_op_wires_to_prover_instance) align with the main wires via
 * the `ecc_op_wire[r] == w_shift[r]` equality enforced by EccOpQueueRelation.
 *
 * @note The ecc_op block does NOT have a gate selector stored in the builder. Instead, the `lagrange_ecc_op`
 * selector polynomial is constructed during TraceToPolynomials::add_ecc_op_wires_to_prover_instance() as a
 * binary indicator (1 inside the ecc_op block, 0 elsewhere).
 */
struct MegaTraceBlockData {
    MegaTraceBlock ecc_op{}; // Must remain first; no gate selector.
    MegaTraceBlock busread{ GateKind::BusRead };
    MegaTraceBlock lookup{ GateKind::Lookup };
    MegaTraceBlock pub_inputs{}; // No gate selector.
    MegaTraceBlock arithmetic{ GateKind::Arith };
    MegaTraceBlock delta_range{ GateKind::DeltaRange };
    MegaTraceBlock elliptic{ GateKind::Elliptic };
    MegaTraceBlock memory{ GateKind::Memory };
    MegaTraceBlock nnf{ GateKind::Nnf };
    MegaTraceBlock poseidon2_external{ GateKind::Poseidon2Ext, GateKind::Poseidon2ExtInitial };
    MegaTraceBlock poseidon2_quad_internal{ GateKind::Poseidon2QuadInt,
                                            GateKind::Poseidon2QuadIntTerminal,
                                            GateKind::Poseidon2TransitionEntry };

    static constexpr size_t NUM_BLOCKS = 11;

    std::vector<std::string_view> get_labels() const
    {
        return { "ecc_op",
                 "busread",
                 "lookup",
                 "pub_inputs",
                 "arithmetic",
                 "delta_range",
                 "elliptic",
                 "memory",
                 "nnf",
                 "poseidon2_external",
                 "poseidon2_quad_internal" };
    }

    auto get()
    {
        return RefArray(std::array<MegaTraceBlock*, NUM_BLOCKS>{ &ecc_op,
                                                                 &busread,
                                                                 &lookup,
                                                                 &pub_inputs,
                                                                 &arithmetic,
                                                                 &delta_range,
                                                                 &elliptic,
                                                                 &memory,
                                                                 &nnf,
                                                                 &poseidon2_external,
                                                                 &poseidon2_quad_internal });
    }

    auto get() const
    {
        return RefArray(std::array<const MegaTraceBlock*, NUM_BLOCKS>{ &ecc_op,
                                                                       &busread,
                                                                       &lookup,
                                                                       &pub_inputs,
                                                                       &arithmetic,
                                                                       &delta_range,
                                                                       &elliptic,
                                                                       &memory,
                                                                       &nnf,
                                                                       &poseidon2_external,
                                                                       &poseidon2_quad_internal });
    }

    auto get_gate_blocks() const
    {
        // Order must match get_gate_selectors() in MegaFlavor: poseidon2_external appears twice
        // (regular + initial) and poseidon2_quad_internal appears three times (interior /
        // terminal / entry).
        return RefArray(std::array<const MegaTraceBlock*, 12>{
            &busread,
            &lookup,
            &arithmetic,
            &delta_range,
            &elliptic,
            &memory,
            &nnf,
            &poseidon2_external,      // q_poseidon2_external
            &poseidon2_external,      // q_poseidon2_external_initial
            &poseidon2_quad_internal, // q_poseidon2_quad_internal
            &poseidon2_quad_internal, // q_poseidon2_quad_internal_terminal
            &poseidon2_quad_internal, // q_poseidon2_transition_entry
        });
    }

    bool operator==(const MegaTraceBlockData& other) const = default;
};

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

    void summarize() const
    {
        info("Gate blocks summary:");
        info("goblin ecc op :\t", this->ecc_op.size());
        info("busread       :\t", this->busread.size());
        info("lookups       :\t", this->lookup.size());
        info("pub inputs    :\t", this->pub_inputs.size(), " (populated in decider pk constructor)");
        info("arithmetic    :\t", this->arithmetic.size());
        info("delta range   :\t", this->delta_range.size());
        info("elliptic      :\t", this->elliptic.size());
        info("memory        :\t", this->memory.size());
        info("nnf           :\t", this->nnf.size());
        info("poseidon ext  :\t", this->poseidon2_external.size());
        info("poseidon quad :\t", this->poseidon2_quad_internal.size());
        info("");
        info("Total size: ", get_total_size());
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
