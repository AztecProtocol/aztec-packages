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
    virtual SelectorType& q_poseidon2_external_compressed() { return this->zero_selectors[7]; };
    virtual SelectorType& q_poseidon2_external_initial() { return this->zero_selectors[8]; };
    virtual SelectorType& q_poseidon2_transition_entry_k8() { return this->zero_selectors[9]; };
    virtual SelectorType& q_poseidon2_k8_internal() { return this->zero_selectors[10]; };
    virtual SelectorType& q_poseidon2_k8_internal_terminal() { return this->zero_selectors[11]; };

    virtual const SelectorType& q_busread() const { return this->zero_selectors[0]; };
    virtual const SelectorType& q_lookup() const { return this->zero_selectors[1]; };
    virtual const SelectorType& q_arith() const { return this->zero_selectors[2]; };
    virtual const SelectorType& q_delta_range() const { return this->zero_selectors[3]; };
    virtual const SelectorType& q_elliptic() const { return this->zero_selectors[4]; };
    virtual const SelectorType& q_memory() const { return this->zero_selectors[5]; };
    virtual const SelectorType& q_nnf() const { return this->zero_selectors[6]; };
    virtual const SelectorType& q_poseidon2_external_compressed() const { return this->zero_selectors[7]; };
    virtual const SelectorType& q_poseidon2_external_initial() const { return this->zero_selectors[8]; };
    virtual const SelectorType& q_poseidon2_transition_entry_k8() const { return this->zero_selectors[9]; };
    virtual const SelectorType& q_poseidon2_k8_internal() const { return this->zero_selectors[10]; };
    virtual const SelectorType& q_poseidon2_k8_internal_terminal() const { return this->zero_selectors[11]; };

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
            q_poseidon2_external_compressed(),
            q_poseidon2_external_initial(),
            q_poseidon2_transition_entry_k8(),
            q_poseidon2_k8_internal(),
            q_poseidon2_k8_internal_terminal(),
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
            q_6(),
            q_busread(),
            q_lookup(),
            q_arith(),
            q_delta_range(),
            q_elliptic(),
            q_memory(),
            q_nnf(),
            q_poseidon2_external_compressed(),
            q_poseidon2_external_initial(),
            q_poseidon2_transition_entry_k8(),
            q_poseidon2_k8_internal(),
            q_poseidon2_k8_internal_terminal(),
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
        q_poseidon2_external_compressed().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_transition_entry_k8().emplace_back(0);
        q_poseidon2_k8_internal().emplace_back(0);
        q_poseidon2_k8_internal_terminal().emplace_back(0);
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
        q_poseidon2_external_compressed().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_transition_entry_k8().emplace_back(0);
        q_poseidon2_k8_internal().emplace_back(0);
        q_poseidon2_k8_internal_terminal().emplace_back(0);
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
        q_poseidon2_external_compressed().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_transition_entry_k8().emplace_back(0);
        q_poseidon2_k8_internal().emplace_back(0);
        q_poseidon2_k8_internal_terminal().emplace_back(0);
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
        q_poseidon2_external_compressed().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_transition_entry_k8().emplace_back(0);
        q_poseidon2_k8_internal().emplace_back(0);
        q_poseidon2_k8_internal_terminal().emplace_back(0);
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
        q_poseidon2_external_compressed().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_transition_entry_k8().emplace_back(0);
        q_poseidon2_k8_internal().emplace_back(0);
        q_poseidon2_k8_internal_terminal().emplace_back(0);
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
        q_poseidon2_external_compressed().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_transition_entry_k8().emplace_back(0);
        q_poseidon2_k8_internal().emplace_back(0);
        q_poseidon2_k8_internal_terminal().emplace_back(0);
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
        q_poseidon2_external_compressed().emplace_back(0);
        q_poseidon2_external_initial().emplace_back(0);
        q_poseidon2_transition_entry_k8().emplace_back(0);
        q_poseidon2_k8_internal().emplace_back(0);
        q_poseidon2_k8_internal_terminal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

/**
 * @brief Consolidated block for all compressed-Poseidon2 row types.
 *
 * @details Holds 5 independent gate selectors — q_poseidon2_external_compressed,
 * q_poseidon2_external_initial, q_poseidon2_transition_entry_k8, q_poseidon2_k8_internal,
 * q_poseidon2_k8_internal_terminal — with each row activating exactly one of them. Auxiliary
 * witness columns p2_w_5..p2_w_8 are
 * stored as parallel `SlabVectorSelector<fr>` arrays per row; their semantic depends on which
 * gate selector is active:
 *   - external_compressed: p2_w_5..p2_w_8 = full state (s_0..s_3) at round 2k+1.
 *   - external_initial:    p2_w_5..p2_w_8 = 0 (initial-linear row uses standard 4-wide encoding only).
 *   - transition_entry_k8: p2_w_5..p2_w_8 = 0 (entry row uses standard 4-wide encoding only).
 *   - k8_internal:         p2_w_5..p2_w_8 = s_0 at internal rounds 4..7 of this row's K=8 sweep.
 *   - k8_internal_terminal: same as k8_internal.
 *
 * `TraceToPolynomials::add_poseidon2_state_wires_to_prover_instance` copies each row's aux fr
 * values into the witness polynomials `polynomials.p2_w_5..p2_w_8` over this block's trace
 * range. Outside this block, those polynomials remain zero.
 */
class MegaTracePoseidon2CompressedBlock : public MegaTraceBlock {
  public:
    SelectorType& q_poseidon2_external_compressed() override { return external_compressed_selector; }
    SelectorType& q_poseidon2_external_initial() override { return external_initial_selector; }
    SelectorType& q_poseidon2_transition_entry_k8() override { return transition_entry_k8_selector; }
    SelectorType& q_poseidon2_k8_internal() override { return k8_internal_selector; }
    SelectorType& q_poseidon2_k8_internal_terminal() override { return k8_internal_terminal_selector; }
    const SelectorType& q_poseidon2_external_compressed() const override { return external_compressed_selector; }
    const SelectorType& q_poseidon2_external_initial() const override { return external_initial_selector; }
    const SelectorType& q_poseidon2_transition_entry_k8() const override { return transition_entry_k8_selector; }
    const SelectorType& q_poseidon2_k8_internal() const override { return k8_internal_selector; }
    const SelectorType& q_poseidon2_k8_internal_terminal() const override { return k8_internal_terminal_selector; }

    // Auxiliary wire storage. Per-row fr values, copied to witness polynomials by
    // TraceToPolynomials::add_poseidon2_state_wires_to_prover_instance.
    SlabVectorSelector<fr>& p2_w_5_aux() { return p2_w_5_values; }
    SlabVectorSelector<fr>& p2_w_6_aux() { return p2_w_6_values; }
    SlabVectorSelector<fr>& p2_w_7_aux() { return p2_w_7_values; }
    SlabVectorSelector<fr>& p2_w_8_aux() { return p2_w_8_values; }
    const SlabVectorSelector<fr>& p2_w_5_aux() const { return p2_w_5_values; }
    const SlabVectorSelector<fr>& p2_w_6_aux() const { return p2_w_6_values; }
    const SlabVectorSelector<fr>& p2_w_7_aux() const { return p2_w_7_values; }
    const SlabVectorSelector<fr>& p2_w_8_aux() const { return p2_w_8_values; }

    // Default `set_gate_selector` produces an unconstrained row: all four gate selectors are
    // zero, all aux wires are zero. Used as the trailing successor row that compressed-relation
    // shifts read into.
    void set_gate_selector(const fr& /*value*/) override
    {
        push_zero_other_selectors();
        external_compressed_selector.emplace_back(0);
        external_initial_selector.emplace_back(0);
        transition_entry_k8_selector.emplace_back(0);
        k8_internal_selector.emplace_back(0);
        k8_internal_terminal_selector.emplace_back(0);
        push_aux_wires(fr(0), fr(0), fr(0), fr(0));
    }

    void set_external_compressed_gate_selector(
        const fr& value, const fr& p2_w_5_v, const fr& p2_w_6_v, const fr& p2_w_7_v, const fr& p2_w_8_v)
    {
        push_zero_other_selectors();
        external_compressed_selector.emplace_back(value);
        external_initial_selector.emplace_back(0);
        transition_entry_k8_selector.emplace_back(0);
        k8_internal_selector.emplace_back(0);
        k8_internal_terminal_selector.emplace_back(0);
        push_aux_wires(p2_w_5_v, p2_w_6_v, p2_w_7_v, p2_w_8_v);
    }

    // Activates q_poseidon2_external_initial on the row; used for the initial-linear-layer row
    // sitting immediately before the first external_compressed row of each Poseidon2 hash.
    // Wires hold the raw permutation input; the next row's wires hold M_E * input.
    void set_external_initial_gate_selector(const fr& value)
    {
        push_zero_other_selectors();
        external_compressed_selector.emplace_back(0);
        external_initial_selector.emplace_back(value);
        transition_entry_k8_selector.emplace_back(0);
        k8_internal_selector.emplace_back(0);
        k8_internal_terminal_selector.emplace_back(0);
        push_aux_wires(fr(0), fr(0), fr(0), fr(0));
    }

    void set_transition_entry_k8_gate_selector(const fr& value)
    {
        push_zero_other_selectors();
        external_compressed_selector.emplace_back(0);
        external_initial_selector.emplace_back(0);
        transition_entry_k8_selector.emplace_back(value);
        k8_internal_selector.emplace_back(0);
        k8_internal_terminal_selector.emplace_back(0);
        push_aux_wires(fr(0), fr(0), fr(0), fr(0));
    }

    void set_k8_internal_gate_selector(
        const fr& value, const fr& p2_w_5_v, const fr& p2_w_6_v, const fr& p2_w_7_v, const fr& p2_w_8_v)
    {
        push_zero_other_selectors();
        external_compressed_selector.emplace_back(0);
        external_initial_selector.emplace_back(0);
        transition_entry_k8_selector.emplace_back(0);
        k8_internal_selector.emplace_back(value);
        k8_internal_terminal_selector.emplace_back(0);
        push_aux_wires(p2_w_5_v, p2_w_6_v, p2_w_7_v, p2_w_8_v);
    }

    void set_k8_internal_terminal_gate_selector(
        const fr& value, const fr& p2_w_5_v, const fr& p2_w_6_v, const fr& p2_w_7_v, const fr& p2_w_8_v)
    {
        push_zero_other_selectors();
        external_compressed_selector.emplace_back(0);
        external_initial_selector.emplace_back(0);
        transition_entry_k8_selector.emplace_back(0);
        k8_internal_selector.emplace_back(0);
        k8_internal_terminal_selector.emplace_back(value);
        push_aux_wires(p2_w_5_v, p2_w_6_v, p2_w_7_v, p2_w_8_v);
    }

  private:
    void push_zero_other_selectors()
    {
        q_busread().emplace_back(0);
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
    }
    void push_aux_wires(const fr& p2_w_5_v, const fr& p2_w_6_v, const fr& p2_w_7_v, const fr& p2_w_8_v)
    {
        p2_w_5_values.emplace_back(p2_w_5_v);
        p2_w_6_values.emplace_back(p2_w_6_v);
        p2_w_7_values.emplace_back(p2_w_7_v);
        p2_w_8_values.emplace_back(p2_w_8_v);
    }

    SlabVectorSelector<fr> external_compressed_selector;
    SlabVectorSelector<fr> external_initial_selector;
    SlabVectorSelector<fr> transition_entry_k8_selector;
    SlabVectorSelector<fr> k8_internal_selector;
    SlabVectorSelector<fr> k8_internal_terminal_selector;
    SlabVectorSelector<fr> p2_w_5_values;
    SlabVectorSelector<fr> p2_w_6_values;
    SlabVectorSelector<fr> p2_w_7_values;
    SlabVectorSelector<fr> p2_w_8_values;
};

/**
 * @brief A container indexed by the types of the blocks in the execution trace.
 *
 * @details We instantiate this both to contain the actual gates of an execution trace, and also to describe different
 * trace structures (i.e., sets of capacities for each block type, which we use to optimize the folding prover).
 *
 * @note The ecc_op block must be first in the execution trace. The merge protocol shifts its
 * polynomials by TRACE_OFFSET + NUM_ZERO_ROWS leading zeros to match the circuit's ecc_op_wire
 * commitments. This only works if ecc_op is the first block (so its trace_offset equals
 * TRACE_OFFSET + NUM_ZERO_ROWS).
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
    MegaTracePoseidon2CompressedBlock poseidon2_compressed;

    static constexpr size_t NUM_BLOCKS = 10;

    std::vector<std::string_view> get_labels() const
    {
        return { "ecc_op",      "busread",  "lookup", "pub_inputs", "arithmetic",
                 "delta_range", "elliptic", "memory", "nnf",        "poseidon2_compressed" };
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
                                                                 &poseidon2_compressed });
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
                                                                       &poseidon2_compressed });
    }

    // Note: poseidon2_compressed appears 5 times because it owns 5 distinct gate selectors.
    // The allocation zip in prover_instance pairs each gate selector polynomial with a block, so
    // this block must show up once per active selector. Block sizes are identical (one row =
    // one gate of any type), so the zip is consistent.
    auto get_gate_blocks() const
    {
        return RefArray(std::array<const MegaTraceBlock*, 12>{
            &busread,
            &lookup,
            &arithmetic,
            &delta_range,
            &elliptic,
            &memory,
            &nnf,
            &poseidon2_compressed, // q_poseidon2_external_compressed
            &poseidon2_compressed, // q_poseidon2_external_initial
            &poseidon2_compressed, // q_poseidon2_transition_entry_k8
            &poseidon2_compressed, // q_poseidon2_k8_internal
            &poseidon2_compressed, // q_poseidon2_k8_internal_terminal
        });
    }

    bool operator==(const MegaTraceBlockData& other) const = default;
};

class MegaExecutionTraceBlocks : public MegaTraceBlockData {
  public:
    static constexpr size_t NUM_WIRES = MegaTraceBlock::NUM_WIRES;
    // The number of rows reserved at the top of the trace for row-disabling / ZK masking.
    static constexpr size_t TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK;

    using FF = fr;

    MegaExecutionTraceBlocks() = default;

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
        info("goblin ecc op :\t", this->ecc_op.size());
        info("busread       :\t", this->busread.size());
        info("lookups       :\t", this->lookup.size());
        info("pub inputs    :\t", this->pub_inputs.size(), " (populated in decider pk constructor)");
        info("arithmetic    :\t", this->arithmetic.size());
        info("delta range   :\t", this->delta_range.size());
        info("elliptic      :\t", this->elliptic.size());
        info("memory        :\t", this->memory.size());
        info("nnf           :\t", this->nnf.size());
        info("p2 compressed :\t", this->poseidon2_compressed.size());
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
