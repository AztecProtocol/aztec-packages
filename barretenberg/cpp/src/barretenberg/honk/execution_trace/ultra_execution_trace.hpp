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

class UltraTraceBlock
    : public ExecutionTraceBlock<fr, /*NUM_WIRES_ */ 4, /*NUM_NON_ZERO_SELECTORS_*/ 7, /*NUM_ZERO_SELECTORS_*/ 8> {
  public:
    void populate_wires(const uint32_t& idx_1, const uint32_t& idx_2, const uint32_t& idx_3, const uint32_t& idx_4)
    {
#ifdef CHECK_CIRCUIT_STACKTRACES
        this->stack_traces.populate();
#endif
        this->tracy_gate();
        this->wires[0].emplace_back(idx_1);
        this->wires[1].emplace_back(idx_2);
        this->wires[2].emplace_back(idx_3);
        this->wires[3].emplace_back(idx_4);
    }

    auto& w_l() { return std::get<0>(this->wires); };
    auto& w_r() { return std::get<1>(this->wires); };
    auto& w_o() { return std::get<2>(this->wires); };
    auto& w_4() { return std::get<3>(this->wires); };

    SlabVectorSelector<fr>& q_m() { return non_zero_selectors[0]; };
    SlabVectorSelector<fr>& q_c() { return non_zero_selectors[1]; };
    SlabVectorSelector<fr>& q_1() { return non_zero_selectors[2]; };
    SlabVectorSelector<fr>& q_2() { return non_zero_selectors[3]; };
    SlabVectorSelector<fr>& q_3() { return non_zero_selectors[4]; };
    SlabVectorSelector<fr>& q_4() { return non_zero_selectors[5]; };

    enum class Type {
        LOOKUP_TYPE,
        ARITHMETIC,
        DELTA_RANGE,
        ELLIPTIC,
        MEMORY,
        NON_NATIVE_FIELD,
        POSEIDON2_EXTERNAL,
        POSEIDON2_INTERNAL,
    } type;

    Selector<fr>& q_lookup_type()
    {
        if (type == Type::LOOKUP_TYPE) {
            return non_zero_selectors[6];
        }
        return zero_selectors[0];
    };
    Selector<fr>& q_arith()
    {
        if (type == Type::ARITHMETIC) {
            return non_zero_selectors[6];
        }
        return zero_selectors[1];
    }
    Selector<fr>& q_delta_range()
    {
        if (type == Type::DELTA_RANGE) {
            return non_zero_selectors[6];
        }
        return zero_selectors[2];
    }
    Selector<fr>& q_elliptic()
    {
        if (type == Type::ELLIPTIC) {
            return non_zero_selectors[6];
        }
        return zero_selectors[3];
    }
    Selector<fr>& q_memory()
    {
        if (type == Type::MEMORY) {
            return non_zero_selectors[6];
        }
        return zero_selectors[4];
    }
    Selector<fr>& q_nnf()
    {
        if (type == Type::NON_NATIVE_FIELD) {
            return non_zero_selectors[6];
        }
        return zero_selectors[5];
    }
    Selector<fr>& q_poseidon2_external()
    {
        if (type == Type::POSEIDON2_EXTERNAL) {
            return non_zero_selectors[6];
        }
        return zero_selectors[6];
    }
    Selector<fr>& q_poseidon2_internal()
    {
        if (type == Type::POSEIDON2_INTERNAL) {
            return non_zero_selectors[6];
        }
        return zero_selectors[7];
    }
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
    static constexpr size_t NUM_NON_ZERO_SELECTORS = UltraTraceBlock::NUM_NON_ZERO_SELECTORS;
    static constexpr size_t NUM_ZERO_SELECTORS = UltraTraceBlock::NUM_ZERO_SELECTORS;
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
        for (auto block : this->get()) {
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
