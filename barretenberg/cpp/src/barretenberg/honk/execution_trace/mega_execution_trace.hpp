// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/zip_view.hpp"
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
    virtual SelectorType& q_lookup_type() { return this->zero_selectors[1]; };
    virtual SelectorType& q_arith() { return this->zero_selectors[2]; };
    virtual SelectorType& q_delta_range() { return this->zero_selectors[3]; };
    virtual SelectorType& q_elliptic() { return this->zero_selectors[4]; };
    virtual SelectorType& q_memory() { return this->zero_selectors[5]; };
    virtual SelectorType& q_nnf() { return this->zero_selectors[6]; };
    virtual SelectorType& q_poseidon2_external() { return this->zero_selectors[7]; };
    virtual SelectorType& q_poseidon2_internal() { return this->zero_selectors[8]; };

    virtual const SelectorType& q_busread() const { return this->zero_selectors[0]; };
    virtual const SelectorType& q_lookup_type() const { return this->zero_selectors[1]; };
    virtual const SelectorType& q_arith() const { return this->zero_selectors[2]; };
    virtual const SelectorType& q_delta_range() const { return this->zero_selectors[3]; };
    virtual const SelectorType& q_elliptic() const { return this->zero_selectors[4]; };
    virtual const SelectorType& q_memory() const { return this->zero_selectors[5]; };
    virtual const SelectorType& q_nnf() const { return this->zero_selectors[6]; };
    virtual const SelectorType& q_poseidon2_external() const { return this->zero_selectors[7]; };
    virtual const SelectorType& q_poseidon2_internal() const { return this->zero_selectors[8]; };

    RefVector<SelectorType> get_gate_selectors()
    {
        return {
            q_busread(),     q_lookup_type(),        q_arith(),
            q_delta_range(), q_elliptic(),           q_memory(),
            q_nnf(),         q_poseidon2_external(), q_poseidon2_internal(),
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
            q_busread(),
            q_lookup_type(),
            q_arith(),
            q_delta_range(),
            q_elliptic(),
            q_memory(),
            q_nnf(),
            q_poseidon2_external(),
            q_poseidon2_internal(),
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
    std::array<ZeroSelector<fr>, 9> zero_selectors;
};

class MegaTracePublicInputBlock : public MegaTraceBlock {};

class MegaTraceBusReadBlock : public MegaTraceBlock {
  public:
    SelectorType& q_busread() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        gate_selector.emplace_back(value);
        q_lookup_type().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTraceLookupBlock : public MegaTraceBlock {
  public:
    SelectorType& q_lookup_type() override { return gate_selector; }

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
        q_poseidon2_internal().emplace_back(0);
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
        q_lookup_type().emplace_back(0);
        gate_selector.emplace_back(value);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
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
        q_lookup_type().emplace_back(0);
        q_arith().emplace_back(0);
        gate_selector.emplace_back(value);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
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
        q_lookup_type().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        gate_selector.emplace_back(value);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
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
        q_lookup_type().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        gate_selector.emplace_back(value);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
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
        q_lookup_type().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        gate_selector.emplace_back(value);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTracePoseidon2ExternalBlock : public MegaTraceBlock {
  public:
    SelectorType& q_poseidon2_external() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        q_lookup_type().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        gate_selector.emplace_back(value);
        q_poseidon2_internal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class MegaTracePoseidon2InternalBlock : public MegaTraceBlock {
  public:
    SelectorType& q_poseidon2_internal() override { return gate_selector; }

    void set_gate_selector(const fr& value) override
    {
        q_busread().emplace_back(0);
        q_lookup_type().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        gate_selector.emplace_back(value);
    }

  private:
    SlabVectorSelector<fr> gate_selector;
};

/**
 * @brief A container indexed by the types of the blocks in the execution trace.
 *
 * @details We instantiate this both to contain the actual gates of an execution trace, and also to describe different
 * trace structures (i.e., sets of capacities for each block type, which we use to optimize the folding prover).
 * Note: the ecc_op block has to be the first in the execution trace to not break the Goblin functionality.
 */
struct MegaTraceBlockData {
    MegaTraceBlock ecc_op;
    MegaTraceBusReadBlock busread;
    MegaTraceLookupBlock lookup;
    MegaTracePublicInputBlock pub_inputs;
    MegaTraceArithmeticBlock arithmetic;
    MegaTraceDeltaRangeBlock delta_range;
    MegaTraceEllipticBlock elliptic;
    MegaTraceMemoryBlock memory;
    MegaTraceNonNativeFieldBlock nnf;
    MegaTracePoseidon2ExternalBlock poseidon2_external;
    MegaTracePoseidon2InternalBlock poseidon2_internal;

    static constexpr size_t NUM_BLOCKS = 11;

    std::vector<std::string_view> get_labels() const
    {
        return { "ecc_op",   "busread", "lookup", "pub_inputs",         "arithmetic",        "delta_range",
                 "elliptic", "memory",  "nnf",    "poseidon2_external", "poseidon2_internal" };
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
                                                                 &poseidon2_internal });
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
                                                                       &poseidon2_internal });
    }

    auto get_gate_blocks() const
    {
        return RefArray(std::array<const MegaTraceBlock*, 9>{
            &busread,
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

    bool operator==(const MegaTraceBlockData& other) const = default;
};

class MegaExecutionTraceBlocks : public MegaTraceBlockData {
  public:
    /**
     * @brief Defines the circuit block types for the Mega arithmetization
     * @note Its useful to define this as a template since it is used to actually store gate data (T = MegaTraceBlock)
     * but also to store corresponding block sizes (T = uint32_t) for the structured trace or dynamic block size
     * tracking in ClientIvc.
     *
     * @tparam T
     */

    static constexpr size_t NUM_WIRES = MegaTraceBlock::NUM_WIRES;

    using FF = fr;

    MegaExecutionTraceBlocks() = default;

    void compute_offsets()
    {
        uint32_t offset = 1; // start at 1 because the 0th row is unused for selectors for Honk
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
        info("poseidon int  :\t", this->poseidon2_internal.size());
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
