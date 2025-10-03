// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_block.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb {

class UltraTraceBlock : public ExecutionTraceBlock<fr, 4> {
  public:
    virtual Selector<fr>& q_lookup_type() { return zero_selectors[0]; };
    virtual Selector<fr>& q_arith() { return zero_selectors[1]; }
    virtual Selector<fr>& q_delta_range() { return zero_selectors[2]; }
    virtual Selector<fr>& q_elliptic() { return zero_selectors[3]; }
    virtual Selector<fr>& q_memory() { return zero_selectors[4]; }
    virtual Selector<fr>& q_nnf() { return zero_selectors[5]; }
    virtual Selector<fr>& q_poseidon2_external() { return zero_selectors[6]; }
    virtual Selector<fr>& q_poseidon2_internal() { return zero_selectors[7]; }

    RefVector<Selector<fr>> get_selectors() override
    {
        return RefVector{ q_m(),
                          q_c(),
                          q_1(),
                          q_2(),
                          q_3(),
                          q_4(),
                          q_lookup_type(),
                          q_arith(),
                          q_delta_range(),
                          q_elliptic(),
                          q_memory(),
                          q_nnf(),
                          q_poseidon2_external(),
                          q_poseidon2_internal() };
    }

  private:
    std::array<ZeroSelector<fr>, 8> zero_selectors;
};

class UltraTracePublicInputBlock : public UltraTraceBlock {};

class UltraTraceLookupBlock : public UltraTraceBlock {
  public:
    SelectorType& q_lookup_type() override { return gate_selector; }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class UltraTraceArithmeticBlock : public UltraTraceBlock {
  public:
    SelectorType& q_arith() override { return gate_selector; }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class UltraTraceDeltaRangeBlock : public UltraTraceBlock {
  public:
    SelectorType& q_delta_range() override { return gate_selector; }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class UltraTraceEllipticBlock : public UltraTraceBlock {
  public:
    SelectorType& q_elliptic() override { return gate_selector; }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class UltraTraceMemoryBlock : public UltraTraceBlock {
  public:
    SelectorType& q_memory() override { return gate_selector; }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class UltraTraceNonNativeFieldBlock : public UltraTraceBlock {
  public:
    SelectorType& q_nnf() override { return gate_selector; }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class UltraTracePoseidon2ExternalBlock : public UltraTraceBlock {
  public:
    SelectorType& q_poseidon2_external() override { return gate_selector; }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class UltraTracePoseidon2InternalBlock : public UltraTraceBlock {
  public:
    SelectorType& q_poseidon2_internal() override { return gate_selector; }

  private:
    SlabVectorSelector<fr> gate_selector;
};

class UltraTraceOverflowBlock : public UltraTraceBlock {
  public:
    SelectorType& q_lookup_type() override { return gate_selectors[0]; };
    SelectorType& q_arith() override { return gate_selectors[1]; }
    SelectorType& q_delta_range() override { return gate_selectors[2]; }
    SelectorType& q_elliptic() override { return gate_selectors[3]; }
    SelectorType& q_memory() override { return gate_selectors[4]; }
    SelectorType& q_nnf() override { return gate_selectors[5]; }
    SelectorType& q_poseidon2_external() override { return gate_selectors[6]; }
    SelectorType& q_poseidon2_internal() override { return gate_selectors[7]; }

  private:
    std::array<SlabVectorSelector<fr>, 8> gate_selectors;
};

/**
 * @brief Defines the circuit block types for the Ultra arithmetization
 */
struct UltraTraceBlockData {
    UltraTracePublicInputBlock pub_inputs; // Has to be the first block
    UltraTraceLookupBlock lookup;
    UltraTraceArithmeticBlock arithmetic;
    UltraTraceDeltaRangeBlock delta_range;
    UltraTraceEllipticBlock elliptic;
    UltraTraceMemoryBlock memory;
    UltraTraceNonNativeFieldBlock nnf;
    UltraTracePoseidon2ExternalBlock poseidon2_external;
    UltraTracePoseidon2InternalBlock poseidon2_internal;
    UltraTraceOverflowBlock overflow;

    auto get()
    {
        return RefArray(std::array<UltraTraceBlock*, 10>{ &pub_inputs,
                                                          &lookup,
                                                          &arithmetic,
                                                          &delta_range,
                                                          &elliptic,
                                                          &memory,
                                                          &nnf,
                                                          &poseidon2_external,
                                                          &poseidon2_internal,
                                                          &overflow });
    }

    auto get() const
    {
        return RefArray(std::array<const UltraTraceBlock*, 10>{ &pub_inputs,
                                                                &lookup,
                                                                &arithmetic,
                                                                &delta_range,
                                                                &elliptic,
                                                                &memory,
                                                                &nnf,
                                                                &poseidon2_external,
                                                                &poseidon2_internal,
                                                                &overflow });
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
    using FF = fr;

    bool has_overflow = false;

    UltraExecutionTraceBlocks() = default;

    void compute_offsets(bool is_structured)
    {
        if (is_structured) {
            throw_or_abort("Trace is structuring not implemented for UltraHonk");
        }
        uint32_t offset = 1; // start at 1 because the 0th row is unused for selectors for Honk
        for (auto& block : this->get()) {
            block.trace_offset_ = offset;
            offset += block.get_fixed_size(is_structured);
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
        info("overflow :\t", this->overflow.size());
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

    size_t get_structured_dyadic_size()
    {
        size_t total_size = 1; // start at 1 because the 0th row is unused for selectors for Honk
        for (auto& block : this->get()) {
            total_size += block.get_fixed_size();
        }

        auto log2_n = static_cast<size_t>(numeric::get_msb(total_size));
        if ((1UL << log2_n) != (total_size)) {
            ++log2_n;
        }
        return 1UL << log2_n;
    }

    bool operator==(const UltraExecutionTraceBlocks& other) const = default;
};

} // namespace bb
