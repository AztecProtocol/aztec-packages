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

namespace bb {

/**
 * @brief A container indexed by the types of the blocks in the execution trace.
 *
 * @details We instantiate this both to contain the actual gates of an execution trace, and also to describe different
 * trace structures (i.e., sets of capacities for each block type, which we use to optimize the folding prover).
 * Note: the ecc_op block has to be the first in the execution trace to not break the Goblin functionality.
 */
template <typename T> struct MegaTraceBlockData {
    T ecc_op;
    T busread;
    T lookup;
    T pub_inputs;
    T arithmetic;
    T delta_range;
    T elliptic;
    T memory;
    T nnf;
    T poseidon2_external;
    T poseidon2_internal;
    T overflow; // block gates of arbitrary type that overflow their designated block

    std::vector<std::string_view> get_labels() const
    {
        return { "ecc_op",   "busread", "lookup", "pub_inputs",         "arithmetic",         "delta_range",
                 "elliptic", "memory",  "nnf",    "poseidon2_external", "poseidon2_internal", "overflow" };
    }

    auto get()
    {
        return RefArray{ ecc_op,   busread, lookup, pub_inputs,         arithmetic,         delta_range,
                         elliptic, memory,  nnf,    poseidon2_external, poseidon2_internal, overflow };
    }

    auto get() const
    {
        return RefArray{ ecc_op,   busread, lookup, pub_inputs,         arithmetic,         delta_range,
                         elliptic, memory,  nnf,    poseidon2_external, poseidon2_internal, overflow };
    }

    auto get_gate_blocks() const
    {
        return RefArray{
            busread, lookup, arithmetic, delta_range, elliptic, memory, nnf, poseidon2_external, poseidon2_internal,
        };
    }

    size_t size() const
        requires std::same_as<T, uint32_t>
    {
        size_t result{ 0 };
        for (const auto& block_size : get()) {
            result += block_size;
        }
        return static_cast<size_t>(result);
    }

    bool operator==(const MegaTraceBlockData& other) const = default;
};

using TraceStructure = MegaTraceBlockData<uint32_t>;

struct TraceSettings {
    std::optional<TraceStructure> structure;
    // The size of the overflow block. Specified separately because it is allowed to be determined at runtime in the
    // context of VK computation
    uint32_t overflow_capacity = 0;

    // This size is used as a hint to the BN254 Commitment Key needed in the CIVC.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1319): This can be removed once the prover knows all
    // the circuit sizes in advance.
    size_t size() const { return (structure ? structure->size() : 0) + static_cast<size_t>(overflow_capacity); }

    size_t dyadic_size() const { return numeric::round_up_power_2(size()); }
};

class MegaTraceBlock : public ExecutionTraceBlock<fr, /*NUM_WIRES_ */ 4, /*NUM_SELECTORS_*/ 15> {
    using SelectorType = ExecutionTraceBlock<fr, 4, 15>::SelectorType;

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

    auto& q_m() { return this->selectors[0]; };
    auto& q_c() { return this->selectors[1]; };
    auto& q_1() { return this->selectors[2]; };
    auto& q_2() { return this->selectors[3]; };
    auto& q_3() { return this->selectors[4]; };
    auto& q_4() { return this->selectors[5]; };
    auto& q_busread() { return this->selectors[6]; };
    auto& q_lookup_type() { return this->selectors[7]; };
    auto& q_arith() { return this->selectors[8]; };
    auto& q_delta_range() { return this->selectors[9]; };
    auto& q_elliptic() { return this->selectors[10]; };
    auto& q_memory() { return this->selectors[11]; };
    auto& q_nnf() { return this->selectors[12]; };
    auto& q_poseidon2_external() { return this->selectors[13]; };
    auto& q_poseidon2_internal() { return this->selectors[14]; };

    RefVector<SelectorType> get_gate_selectors()
    {
        return {
            q_busread(),     q_lookup_type(),        q_arith(),
            q_delta_range(), q_elliptic(),           q_memory(),
            q_nnf(),         q_poseidon2_external(), q_poseidon2_internal(),
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
};

class MegaExecutionTraceBlocks : public MegaTraceBlockData<MegaTraceBlock> {
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
    static constexpr size_t NUM_SELECTORS = MegaTraceBlock::NUM_SELECTORS;

    using FF = fr;

    bool has_overflow = false; // indicates whether the overflow block has non-zero fixed or actual size

    MegaExecutionTraceBlocks() = default;

    void set_fixed_block_sizes(const TraceSettings& settings)
    {
        if (settings.structure) {
            for (auto [block, size] : zip_view(this->get(), settings.structure.value().get())) {
                block.fixed_size = size;
            }
        }

        this->overflow.fixed_size = settings.overflow_capacity;
    }

    void compute_offsets(bool is_structured)
    {
        uint32_t offset = 1; // start at 1 because the 0th row is unused for selectors for Honk
        for (auto& block : this->get()) {
            block.trace_offset_ = offset;
            offset += block.get_fixed_size(is_structured);
        }
    }

    void summarize() const
    {
        info("Gate blocks summary: (actual gates / fixed capacity)");
        info("goblin ecc op :\t", this->ecc_op.size(), "/", this->ecc_op.get_fixed_size());
        info("busread       :\t", this->busread.size(), "/", this->busread.get_fixed_size());
        info("lookups       :\t", this->lookup.size(), "/", this->lookup.get_fixed_size());
        info("pub inputs    :\t",
             this->pub_inputs.size(),
             "/",
             this->pub_inputs.get_fixed_size(),
             " (populated in decider pk constructor)");
        info("arithmetic    :\t", this->arithmetic.size(), "/", this->arithmetic.get_fixed_size());
        info("delta range   :\t", this->delta_range.size(), "/", this->delta_range.get_fixed_size());
        info("elliptic      :\t", this->elliptic.size(), "/", this->elliptic.get_fixed_size());
        info("memory        :\t", this->memory.size(), "/", this->memory.get_fixed_size());
        info("nnf           :\t", this->nnf.size(), "/", this->nnf.get_fixed_size());
        info("poseidon ext  :\t", this->poseidon2_external.size(), "/", this->poseidon2_external.get_fixed_size());
        info("poseidon int  :\t", this->poseidon2_internal.size(), "/", this->poseidon2_internal.get_fixed_size());
        info("overflow      :\t", this->overflow.size(), "/", this->overflow.get_fixed_size());
        info("");
        info("Total structured size: ", get_structured_size());
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

    size_t get_structured_size() const
    {
        size_t total_size = 1; // start at 1 because the 0th row is unused for selectors for Honk
        for (const auto& block : this->get()) {
            total_size += block.get_fixed_size();
        }
        return total_size;
    }

    size_t get_structured_dyadic_size() const
    {
        size_t total_size = get_structured_size();

        auto log2_n = static_cast<size_t>(numeric::get_msb(total_size));
        if ((1UL << log2_n) != (total_size)) {
            ++log2_n;
        }
        return 1UL << log2_n;
    }

    bool operator==(const MegaExecutionTraceBlocks& other) const = default;
};

/**
 * @brief A tiny structuring (for testing without recursive verifications only)
 */
static constexpr TraceStructure TINY_TEST_STRUCTURE{ .ecc_op = 18,
                                                     .busread = 3,
                                                     .lookup = 2,
                                                     .pub_inputs = 20,
                                                     .arithmetic = 1 << 14,
                                                     .delta_range = 5,
                                                     .elliptic = 2,
                                                     .memory = 10,
                                                     .nnf = 2,
                                                     .poseidon2_external = 2,
                                                     .poseidon2_internal = 2,
                                                     .overflow = 0 };

/**
 * @brief An arbitrary but small-ish structuring that can be used for generic unit testing with non-trivial circuits
 */

static constexpr TraceStructure SMALL_TEST_STRUCTURE{ .ecc_op = 1 << 14,
                                                      .busread = 1 << 14,
                                                      .lookup = 1 << 14,
                                                      .pub_inputs = 1 << 14,
                                                      .arithmetic = 1 << 15,
                                                      .delta_range = 1 << 14,
                                                      .elliptic = 1 << 14,
                                                      .memory = 1 << 14,
                                                      .nnf = 1 << 7,
                                                      .poseidon2_external = 1 << 14,
                                                      .poseidon2_internal = 1 << 15,
                                                      .overflow = 0 };

/**
 * @brief An example structuring of size 2^18.
 */
static constexpr TraceStructure EXAMPLE_18{ .ecc_op = 1 << 10,
                                            .busread = 1 << 6,
                                            .lookup = 36000,
                                            .pub_inputs = 1 << 6,
                                            .arithmetic = 84000,
                                            .delta_range = 45000,
                                            .elliptic = 9000,
                                            .memory = 67000,
                                            .nnf = 1000,
                                            .poseidon2_external = 2500,
                                            .poseidon2_internal = 14000,
                                            .overflow = 0 };

/**
 * @brief An example structuring of size 2^20.
 */
static constexpr TraceStructure EXAMPLE_20{ .ecc_op = 1 << 11,
                                            .busread = 1 << 8,
                                            .lookup = 144000,
                                            .pub_inputs = 1 << 8,
                                            .arithmetic = 396000,
                                            .delta_range = 180000,
                                            .elliptic = 18000,
                                            .memory = 268000,
                                            .nnf = 4000,
                                            .poseidon2_external = 5000,
                                            .poseidon2_internal = 28000,
                                            .overflow = 0 };

/**
 * @brief Structuring tailored to the full e2e TS test (Currently optimized for five key testnet transactions)
 */
static constexpr TraceStructure AZTEC_TRACE_STRUCTURE{ .ecc_op = 1000,
                                                       .busread = 3000,
                                                       .lookup = 13000,
                                                       .pub_inputs = 2000,
                                                       .arithmetic = 59000,
                                                       .delta_range = 18000,
                                                       .elliptic = 6500,
                                                       .memory = 25000,
                                                       .nnf = 19000,
                                                       .poseidon2_external = 17000,
                                                       .poseidon2_internal = 96500,
                                                       .overflow = 0 };

template <typename T>
concept HasAdditionalSelectors = IsAnyOf<T, MegaExecutionTraceBlocks>;
} // namespace bb
