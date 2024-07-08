#pragma once

#include "barretenberg/plonk_honk_shared/arithmetization/arithmetization.hpp"

namespace bb {

/**
 * @brief Mega arithmetization
 *
 * @tparam FF_
 */
template <typename FF_> class MegaArith {
  public:
    static constexpr size_t NUM_WIRES = 4;
    static constexpr size_t NUM_SELECTORS = 14;

    using FF = FF_;

    class MegaTraceBlock : public ExecutionTraceBlock<FF, NUM_WIRES, NUM_SELECTORS> {
      public:
        void populate_wires(const uint32_t& idx_1, const uint32_t& idx_2, const uint32_t& idx_3, const uint32_t& idx_4)
        {
#ifdef CHECK_CIRCUIT_STACKTRACES
            this->stack_traces.populate();
#endif
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
        auto& q_arith() { return this->selectors[6]; };
        auto& q_delta_range() { return this->selectors[7]; };
        auto& q_elliptic() { return this->selectors[8]; };
        auto& q_aux() { return this->selectors[9]; };
        auto& q_lookup_type() { return this->selectors[10]; };
        auto& q_busread() { return this->selectors[11]; };
        auto& q_poseidon2_external() { return this->selectors[12]; };
        auto& q_poseidon2_internal() { return this->selectors[13]; };

        /**
         * @brief Add zeros to all selectors which are not part of the conventional Ultra arithmetization
         * @details Facilitates reuse of Ultra gate construction functions in arithmetizations which extend the
         * conventional Ultra arithmetization
         *
         */
        void pad_additional()
        {
            q_busread().emplace_back(0);
            q_poseidon2_external().emplace_back(0);
            q_poseidon2_internal().emplace_back(0);
        };

        /**
         * @brief Resizes all selectors which are not part of the conventional Ultra arithmetization
         * @details Facilitates reuse of Ultra gate construction functions in arithmetizations which extend the
         * conventional Ultra arithmetization
         * @param new_size
         */
        void resize_additional(size_t new_size)
        {
            q_busread().resize(new_size);
            q_poseidon2_external().resize(new_size);
            q_poseidon2_internal().resize(new_size);
        };
    };

    // template <typename T> struct CircuitTraceBlocks {
    //     T ecc_op;
    //     T pub_inputs;
    //     T arithmetic;
    //     T delta_range;
    //     T elliptic;
    //     T aux;
    //     T lookup;
    //     T busread;
    //     T poseidon_external;
    //     T poseidon_internal;
    // };

    // template <typename T> struct TraceBlocks : public CircuitTraceBlocks<T> {};

    struct TraceBlocks {
        MegaTraceBlock ecc_op;
        MegaTraceBlock pub_inputs;
        MegaTraceBlock arithmetic;
        MegaTraceBlock delta_range;
        MegaTraceBlock elliptic;
        MegaTraceBlock aux;
        MegaTraceBlock lookup;
        MegaTraceBlock busread;
        MegaTraceBlock poseidon_external;
        MegaTraceBlock poseidon_internal;

        // This is a set of fixed block sizes that accomodates the circuits currently processed in the ClientIvc bench.
        // Note 1: The individual block sizes do NOT need to be powers of 2, this is just for conciseness.
        // Note 2: Current sizes result in a full trace size of 2^18. It's not possible to define a fixed structure
        // that accomdates both the kernel and the function circuit while remaining under 2^17. This is because the
        // circuits differ in structure but are also both designed to be "full" within the 2^17 size.
        std::array<uint32_t, 10> fixed_block_sizes{
            1 << 10, // ecc_op;
            1 << 7,  // pub_inputs;
            1 << 16, // arithmetic;
            1 << 15, // delta_range;
            1 << 14, // elliptic;
            1 << 16, // aux;
            1 << 15, // lookup;
            1 << 7,  // busread;
            1 << 11, // poseidon_external;
            1 << 14  // poseidon_internal;
        };

        TraceBlocks()
        {
            aux.has_ram_rom = true;
            pub_inputs.is_pub_inputs = true;
            // Set fixed block sizes for use in structured trace
            for (auto [block, size] : zip_view(this->get(), fixed_block_sizes)) {
                block.set_fixed_size(size);
            }
        }

        auto get()
        {
            return RefArray{ ecc_op, pub_inputs, arithmetic, delta_range,       elliptic,
                             aux,    lookup,     busread,    poseidon_external, poseidon_internal };
        }

        void summarize() const
        {
            info("Gate blocks summary: (actual gates / fixed capacity)");
            info("goblin ecc op :\t", ecc_op.size(), "/", ecc_op.get_fixed_size());
            info("pub inputs    :\t", pub_inputs.size(), "/", pub_inputs.get_fixed_size());
            info("arithmetic    :\t", arithmetic.size(), "/", arithmetic.get_fixed_size());
            info("delta range   :\t", delta_range.size(), "/", delta_range.get_fixed_size());
            info("elliptic      :\t", elliptic.size(), "/", elliptic.get_fixed_size());
            info("auxiliary     :\t", aux.size(), "/", aux.get_fixed_size());
            info("lookups       :\t", lookup.size(), "/", lookup.get_fixed_size());
            info("busread       :\t", busread.size(), "/", busread.get_fixed_size());
            info("poseidon ext  :\t", poseidon_external.size(), "/", poseidon_external.get_fixed_size());
            info("poseidon int  :\t", poseidon_internal.size(), "/", poseidon_internal.get_fixed_size());
            info("");
        }

        size_t get_total_structured_size()
        {
            size_t total_size = 0;
            for (auto block : this->get()) {
                total_size += block.get_fixed_size();
            }
            return total_size;
        }

        void check_within_fixed_sizes()
        {
            for (auto block : this->get()) {
                if (block.size() > block.get_fixed_size()) {
                    info("WARNING: Num gates in circuit block exceeds the specified fixed size - execution trace will "
                         "not be constructed correctly!");
                    ASSERT(false);
                }
            }
        }

        bool operator==(const TraceBlocks& other) const = default;
    };

    // Note: Unused. Needed only for consistency with Ultra arith (which is used by Plonk)
    inline static const std::vector<std::string> selector_names = {};
};

template <typename T>
concept HasAdditionalSelectors = IsAnyOf<T, MegaArith<bb::fr>>;
} // namespace bb