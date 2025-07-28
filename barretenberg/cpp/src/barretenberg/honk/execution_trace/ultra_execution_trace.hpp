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
    Selector<fr>& q_lookup_type() { return zero_selectors[0]; };
    Selector<fr>& q_arith() { return zero_selectors[1]; }
    Selector<fr>& q_delta_range() { return zero_selectors[2]; }
    Selector<fr>& q_elliptic() { return zero_selectors[3]; }
    Selector<fr>& q_memory() { return zero_selectors[4]; }
    Selector<fr>& q_nnf() { return zero_selectors[5]; }
    Selector<fr>& q_poseidon2_external() { return zero_selectors[6]; }
    Selector<fr>& q_poseidon2_internal() { return zero_selectors[7]; }

    const Selector<fr>& q_lookup_type() const { return zero_selectors[0]; };
    const Selector<fr>& q_arith() const { return zero_selectors[1]; }
    const Selector<fr>& q_delta_range() const { return zero_selectors[2]; }
    const Selector<fr>& q_elliptic() const { return zero_selectors[3]; }
    const Selector<fr>& q_memory() const { return zero_selectors[4]; }
    const Selector<fr>& q_nnf() const { return zero_selectors[5]; }
    const Selector<fr>& q_poseidon2_external() const { return zero_selectors[6]; }
    const Selector<fr>& q_poseidon2_internal() const { return zero_selectors[7]; }

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
    RefVector<const Selector<fr>> get_selectors() const override
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

  protected:
    std::array<ZeroSelector<fr>, 8> zero_selectors;
};

/**
 * @brief Defines the circuit block types for the Ultra arithmetization
 */
struct UltraTraceBlockData {
    UltraTraceBlock pub_inputs; // Has to be the first block
    UltraTraceBlock lookup;
    UltraTraceBlock arithmetic;
    UltraTraceBlock delta_range;
    UltraTraceBlock elliptic;
    UltraTraceBlock memory;
    UltraTraceBlock nnf;
    UltraTraceBlock poseidon2_external;
    UltraTraceBlock poseidon2_internal;
    UltraTraceBlock overflow;

    auto get()
    {
        return RefArray{ pub_inputs, lookup, arithmetic,         delta_range,        elliptic,
                         memory,     nnf,    poseidon2_external, poseidon2_internal, overflow };
    }

    auto get() const
    {
        return RefArray{ pub_inputs, lookup, arithmetic,         delta_range,        elliptic,
                         memory,     nnf,    poseidon2_external, poseidon2_internal, overflow };
    }

    auto get_gate_blocks() const
    {
        return RefArray{
            lookup, arithmetic, delta_range, elliptic, memory, nnf, poseidon2_external, poseidon2_internal
        };
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
