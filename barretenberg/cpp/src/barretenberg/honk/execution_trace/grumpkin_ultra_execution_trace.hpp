#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_block.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb {

// Grumpkin-native Ultra trace blocks: identical structure to Ultra but over fq (= grumpkin::fr)
class GrumpkinUltraTraceBlock : public ExecutionTraceBlock<fq, 4> {
  public:
    virtual Selector<fq>& q_lookup() { return zero_selectors[0]; };
    virtual Selector<fq>& q_arith() { return zero_selectors[1]; }
    virtual Selector<fq>& q_delta_range() { return zero_selectors[2]; }
    virtual Selector<fq>& q_elliptic() { return zero_selectors[3]; }
    virtual Selector<fq>& q_memory() { return zero_selectors[4]; }
    virtual Selector<fq>& q_nnf() { return zero_selectors[5]; }
    virtual Selector<fq>& q_poseidon2_external() { return zero_selectors[6]; }
    virtual Selector<fq>& q_poseidon2_internal() { return zero_selectors[7]; }

    RefVector<Selector<fq>> get_selectors() override
    {
        return RefVector{ q_m(),
                          q_c(),
                          q_1(),
                          q_2(),
                          q_3(),
                          q_4(),
                          q_lookup(),
                          q_arith(),
                          q_delta_range(),
                          q_elliptic(),
                          q_memory(),
                          q_nnf(),
                          q_poseidon2_external(),
                          q_poseidon2_internal() };
    }

    virtual void set_gate_selector([[maybe_unused]] const fq& value) {}

  private:
    std::array<ZeroSelector<fq>, 8> zero_selectors;
};

class GrumpkinUltraTracePublicInputBlock : public GrumpkinUltraTraceBlock {};

class GrumpkinUltraTraceLookupBlock : public GrumpkinUltraTraceBlock {
  public:
    SelectorType& q_lookup() override { return gate_selector; }

    void set_gate_selector(const fq& value) override
    {
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
    SlabVectorSelector<fq> gate_selector;
};

class GrumpkinUltraTraceArithmeticBlock : public GrumpkinUltraTraceBlock {
  public:
    SelectorType& q_arith() override { return gate_selector; }

    void set_gate_selector(const fq& value) override
    {
        q_lookup().emplace_back(0);
        gate_selector.emplace_back(value);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fq> gate_selector;
};

class GrumpkinUltraTraceDeltaRangeBlock : public GrumpkinUltraTraceBlock {
  public:
    SelectorType& q_delta_range() override { return gate_selector; }

    void set_gate_selector(const fq& value) override
    {
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        gate_selector.emplace_back(value);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fq> gate_selector;
};

class GrumpkinUltraTraceEllipticBlock : public GrumpkinUltraTraceBlock {
  public:
    SelectorType& q_elliptic() override { return gate_selector; }

    void set_gate_selector(const fq& value) override
    {
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        gate_selector.emplace_back(value);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fq> gate_selector;
};

class GrumpkinUltraTraceMemoryBlock : public GrumpkinUltraTraceBlock {
  public:
    SelectorType& q_memory() override { return gate_selector; }

    void set_gate_selector(const fq& value) override
    {
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        gate_selector.emplace_back(value);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fq> gate_selector;
};

class GrumpkinUltraTraceNonNativeFieldBlock : public GrumpkinUltraTraceBlock {
  public:
    SelectorType& q_nnf() override { return gate_selector; }

    void set_gate_selector(const fq& value) override
    {
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        gate_selector.emplace_back(value);
        q_poseidon2_external().emplace_back(0);
        q_poseidon2_internal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fq> gate_selector;
};

class GrumpkinUltraTracePoseidon2ExternalBlock : public GrumpkinUltraTraceBlock {
  public:
    SelectorType& q_poseidon2_external() override { return gate_selector; }

    void set_gate_selector(const fq& value) override
    {
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        gate_selector.emplace_back(value);
        q_poseidon2_internal().emplace_back(0);
    }

  private:
    SlabVectorSelector<fq> gate_selector;
};

class GrumpkinUltraTracePoseidon2InternalBlock : public GrumpkinUltraTraceBlock {
  public:
    SelectorType& q_poseidon2_internal() override { return gate_selector; }

    void set_gate_selector(const fq& value) override
    {
        q_lookup().emplace_back(0);
        q_arith().emplace_back(0);
        q_delta_range().emplace_back(0);
        q_elliptic().emplace_back(0);
        q_memory().emplace_back(0);
        q_nnf().emplace_back(0);
        q_poseidon2_external().emplace_back(0);
        gate_selector.emplace_back(value);
    }

  private:
    SlabVectorSelector<fq> gate_selector;
};

struct GrumpkinUltraTraceBlockData {
    GrumpkinUltraTracePublicInputBlock pub_inputs;
    GrumpkinUltraTraceLookupBlock lookup;
    GrumpkinUltraTraceArithmeticBlock arithmetic;
    GrumpkinUltraTraceDeltaRangeBlock delta_range;
    GrumpkinUltraTraceEllipticBlock elliptic;
    GrumpkinUltraTraceMemoryBlock memory;
    GrumpkinUltraTraceNonNativeFieldBlock nnf;
    GrumpkinUltraTracePoseidon2ExternalBlock poseidon2_external;
    GrumpkinUltraTracePoseidon2InternalBlock poseidon2_internal;

    static constexpr size_t NUM_BLOCKS = 9;

    auto get()
    {
        return RefArray(std::array<GrumpkinUltraTraceBlock*, NUM_BLOCKS>{ &pub_inputs,
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
        return RefArray(std::array<const GrumpkinUltraTraceBlock*, NUM_BLOCKS>{ &pub_inputs,
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
        return RefArray(std::array<const GrumpkinUltraTraceBlock*, 8>{
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

    bool operator==(const GrumpkinUltraTraceBlockData& other) const = default;
};

class GrumpkinUltraExecutionTraceBlocks : public GrumpkinUltraTraceBlockData {

  public:
    static constexpr size_t NUM_WIRES = GrumpkinUltraTraceBlock::NUM_WIRES;
    using FF = fq;

    GrumpkinUltraExecutionTraceBlocks() = default;

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
        info("Gate blocks summary (Grumpkin):");
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

    size_t get_total_content_size()
    {
        size_t total_size(0);
        for (const auto& block : this->get()) {
            total_size += block.size();
        }
        return total_size;
    }

    bool operator==(const GrumpkinUltraExecutionTraceBlocks& other) const = default;
};

} // namespace bb
