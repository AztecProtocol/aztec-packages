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

class MegaTraceBlock : public ExecutionTraceBlock<fr, /*NUM_WIRES_ */ 4> {
  public:
    using SelectorType = Selector<fr>;

    virtual SelectorType& q_busread() { return this->zero_selectors[0]; };
    virtual SelectorType& q_lookup() { return this->zero_selectors[1]; };
    virtual SelectorType& q_arith() { return this->zero_selectors[2]; };
    virtual SelectorType& q_delta_range() { return this->zero_selectors[3]; };
    virtual SelectorType& q_elliptic() { return this->zero_selectors[4]; };
    virtual SelectorType& q_memory() { return this->zero_selectors[5]; };
    virtual SelectorType& q_nnf() { return this->zero_selectors[6]; };
    virtual SelectorType& q_poseidon2_external() { return this->zero_selectors[7]; };
    virtual SelectorType& q_poseidon2_external_initial() { return this->zero_selectors[8]; };
    virtual SelectorType& q_poseidon2_quad_internal() { return this->zero_selectors[9]; };
    virtual SelectorType& q_poseidon2_quad_internal_terminal() { return this->zero_selectors[10]; };
    virtual SelectorType& q_poseidon2_transition_entry() { return this->zero_selectors[11]; };

    virtual const SelectorType& q_busread() const { return this->zero_selectors[0]; };
    virtual const SelectorType& q_lookup() const { return this->zero_selectors[1]; };
    virtual const SelectorType& q_arith() const { return this->zero_selectors[2]; };
    virtual const SelectorType& q_delta_range() const { return this->zero_selectors[3]; };
    virtual const SelectorType& q_elliptic() const { return this->zero_selectors[4]; };
    virtual const SelectorType& q_memory() const { return this->zero_selectors[5]; };
    virtual const SelectorType& q_nnf() const { return this->zero_selectors[6]; };
    virtual const SelectorType& q_poseidon2_external() const { return this->zero_selectors[7]; };
    virtual const SelectorType& q_poseidon2_external_initial() const { return this->zero_selectors[8]; };
    virtual const SelectorType& q_poseidon2_quad_internal() const { return this->zero_selectors[9]; };
    virtual const SelectorType& q_poseidon2_quad_internal_terminal() const { return this->zero_selectors[10]; };
    virtual const SelectorType& q_poseidon2_transition_entry() const { return this->zero_selectors[11]; };

    RefVector<SelectorType> get_gate_selectors()
    {
        return {
            q_busread(),
            q_lookup(),
            q_arith(),
            q_delta_range(),
            q_elliptic(),
            q_memory(),
            q_nnf(),
            q_poseidon2_external(),
            q_poseidon2_external_initial(),
            q_poseidon2_quad_internal(),
            q_poseidon2_quad_internal_terminal(),
            q_poseidon2_transition_entry(),
        };
    }

    RefVector<Selector<fr>> get_selectors() override
    {
        return RefVector{
            q_m(),
            q_c(),
            q_1(),
            q_2(),
            q_3(),
            q_4(),
            q_5(),
            q_busread(),
            q_lookup(),
            q_arith(),
            q_delta_range(),
            q_elliptic(),
            q_memory(),
            q_nnf(),
            q_poseidon2_external(),
            q_poseidon2_external_initial(),
            q_poseidon2_quad_internal(),
            q_poseidon2_quad_internal_terminal(),
            q_poseidon2_transition_entry(),
        };
    }

    /**
     * @brief Add zeros to all selectors which are not part of the conventional Ultra arithmetization
     * @details Facilitates reuse of Ultra gate construction functions in arithmetizations which extend the
     * conventional Ultra arithmetization
     *
     */
    void pad_additional() { q_busread().emplace_back(0); };

    /**
     * @brief Resizes all selectors which are not part of the conventional Ultra arithmetization
     * @details Facilitates reuse of Ultra gate construction functions in arithmetizations which extend the
     * conventional Ultra arithmetization
     * @param new_size
     */
    void resize_additional(size_t new_size) { q_busread().resize(new_size); };

    /**
     * @brief Default implementation does nothing
     */
    virtual void set_gate_selector([[maybe_unused]] const fr& value) {}

  private:
    std::array<ZeroSelector<fr>, 12> zero_selectors;
};

class MegaTracePublicInputBlock : public MegaTraceBlock {};

class MegaTraceBusReadBlock : public MegaTraceBlock {
  public:
    SelectorType& q_busread() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        gate_selector.emplace_back(value);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_quad_internal().emplace_back(0);
        q_poseidon2_quad_internal_terminal().emplace_back(0);
        q_poseidon2_transition_entry().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTraceLookupBlock : public MegaTraceBlock {
  public:
    SelectorType& q_lookup() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        gate_selector.emplace_back(value);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_quad_internal().emplace_back(0);
        q_poseidon2_quad_internal_terminal().emplace_back(0);
        q_poseidon2_transition_entry().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTraceArithmeticBlock : public MegaTraceBlock {
  public:
    SelectorType& q_arith() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        gate_selector.emplace_back(value);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_quad_internal().emplace_back(0);
        q_poseidon2_quad_internal_terminal().emplace_back(0);
        q_poseidon2_transition_entry().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTraceDeltaRangeBlock : public MegaTraceBlock {
  public:
    SelectorType& q_delta_range() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        gate_selector.emplace_back(value);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_quad_internal().emplace_back(0);
        q_poseidon2_quad_internal_terminal().emplace_back(0);
        q_poseidon2_transition_entry().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTraceEllipticBlock : public MegaTraceBlock {
  public:
    SelectorType& q_elliptic() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        gate_selector.emplace_back(value);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_quad_internal().emplace_back(0);
        q_poseidon2_quad_internal_terminal().emplace_back(0);
        q_poseidon2_transition_entry().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTraceMemoryBlock : public MegaTraceBlock {
  public:
    SelectorType& q_memory() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        gate_selector.emplace_back(value);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_quad_internal().emplace_back(0);
        q_poseidon2_quad_internal_terminal().emplace_back(0);
        q_poseidon2_transition_entry().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTraceNonNativeFieldBlock : public MegaTraceBlock {
  public:
    SelectorType& q_nnf() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        gate_selector.emplace_back(value);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_quad_internal().emplace_back(0);
        q_poseidon2_quad_internal_terminal().emplace_back(0);
        q_poseidon2_transition_entry().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTracePoseidon2ExternalBlock : public MegaTraceBlock {
  public:
    SelectorType& q_poseidon2_external() override { return gate_selector; }
    SelectorType& q_poseidon2_external_initial() override { return initial_selector; }
    const SelectorType& q_poseidon2_external() const override { return gate_selector; }
    const SelectorType& q_poseidon2_external_initial() const override { return initial_selector; }

    // Activates q_poseidon2_external on the row; used for ordinary external-round rows.
    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        gate_selector.emplace_back(value);
        initial_selector.emplace_back(0);
        q_poseidon2_quad_internal().emplace_back(0);
        q_poseidon2_quad_internal_terminal().emplace_back(0);
        q_poseidon2_transition_entry().emplace_back(0);
    }

    // Activates q_poseidon2_external_initial on the row; used for the initial-linear-layer row
    // sitting immediately before the first external-round row of each Poseidon2 hash.
    void set_initial_gate_selector(const fr& value)
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        gate_selector.emplace_back(0);
        initial_selector.emplace_back(value);
        q_poseidon2_quad_internal().emplace_back(0);
        q_poseidon2_quad_internal_terminal().emplace_back(0);
        q_poseidon2_transition_entry().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
    SlabVectorSelector<fr> initial_selector;
};

class MegaTracePoseidon2QuadInternalBlock : public MegaTraceBlock {
  public:
    SelectorType& q_poseidon2_quad_internal() override { return interior_selector; }
    SelectorType& q_poseidon2_quad_internal_terminal() override { return terminal_selector; }
    SelectorType& q_poseidon2_transition_entry() override { return entry_selector; }
    const SelectorType& q_poseidon2_quad_internal() const override { return interior_selector; }
    const SelectorType& q_poseidon2_quad_internal_terminal() const override { return terminal_selector; }
    const SelectorType& q_poseidon2_transition_entry() const override { return entry_selector; }

    // Activates q_poseidon2_quad_internal on the row; used for interior compressed rows.
    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        interior_selector.emplace_back(value);
        terminal_selector.emplace_back(0);
        entry_selector.emplace_back(0);
    }

    // Activates q_poseidon2_quad_internal_terminal on the row; used for the terminal compressed row.
    void set_terminal_gate_selector(const fr& value)
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        interior_selector.emplace_back(0);
        terminal_selector.emplace_back(value);
        entry_selector.emplace_back(0);
    }

    // Activates q_poseidon2_transition_entry on the row; used for the standard->compressed entry row.
    void set_entry_gate_selector(const fr& value)
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        interior_selector.emplace_back(0);
        terminal_selector.emplace_back(0);
        entry_selector.emplace_back(value);
    }

  private:
    SlabVectorSelector<fr> interior_selector;
    SlabVectorSelector<fr> terminal_selector;
    SlabVectorSelector<fr> entry_selector;
};

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
    MegaTraceBlock ecc_op; // Must remain first
    MegaTraceBusReadBlock busread;
    MegaTraceLookupBlock lookup;
    MegaTracePublicInputBlock pub_inputs;
    MegaTraceArithmeticBlock arithmetic;
    MegaTraceDeltaRangeBlock delta_range;
    MegaTraceEllipticBlock elliptic;
    MegaTraceMemoryBlock memory;
    MegaTraceNonNativeFieldBlock nnf;
    MegaTracePoseidon2ExternalBlock poseidon2_external;
    MegaTracePoseidon2QuadInternalBlock poseidon2_quad_internal;

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
