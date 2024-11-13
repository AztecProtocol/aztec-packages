#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/plonk_honk_shared/arithmetization/arithmetization.hpp"
#include "barretenberg/plonk_honk_shared/types/circuit_type.hpp"

namespace bb {

/**
 * @brief Mega arithmetization
 *
 * @tparam FF_
 */
template <typename FF_> class MegaArith {

  public:
    /**
     * @brief Defines the circuit block types for the Mega arithmetization
     * @note Its useful to define this as a template since it is used to actually store gate data (T = MegaTraceBlock)
     * but also to store corresponding block sizes (T = uint32_t) for the structured trace or dynamic block size
     * tracking in ClientIvc.
     *
     * @tparam T
     */
    template <typename T> struct MegaTraceBlocks {
        T ecc_op;
        T pub_inputs;
        T busread;
        T arithmetic;
        T delta_range;
        T elliptic;
        T aux;
        T poseidon2_external;
        T poseidon2_internal;
        T lookup;
        T overflow; // block gates of arbitrary type that overflow their designated block

        auto get()
        {
            return RefArray{ ecc_op,
                             pub_inputs,
                             busread,
                             arithmetic,
                             delta_range,
                             elliptic,
                             aux,
                             poseidon2_external,
                             poseidon2_internal,
                             lookup,
                             overflow };
        }
        auto get() const
        {
            return RefArray{ ecc_op,
                             pub_inputs,
                             busread,
                             arithmetic,
                             delta_range,
                             elliptic,
                             aux,
                             poseidon2_external,
                             poseidon2_internal,
                             lookup,
                             overflow };
        }

        auto get_gate_blocks()
        {
            return RefArray{ busread, arithmetic,         delta_range,        elliptic,
                             aux,     poseidon2_external, poseidon2_internal, lookup };
        }

        bool operator==(const MegaTraceBlocks& other) const = default;
    };

    // A tiny structuring (for testing without recursive verifications only)
    struct TinyTestStructuredBlockSizes : public MegaTraceBlocks<uint32_t> {
        TinyTestStructuredBlockSizes()
        {
            this->ecc_op = 18;
            this->pub_inputs = 1;
            this->busread = 3;
            this->arithmetic = 1 << 14;
            this->delta_range = 5;
            this->elliptic = 2;
            this->aux = 10;
            this->poseidon2_external = 2;
            this->poseidon2_internal = 2;
            this->lookup = 2;
            this->overflow = 0;
        }
    };
    // An arbitrary but small-ish structuring that can be used for generic unit testing with non-trivial circuits
    struct SmallTestStructuredBlockSizes : public MegaTraceBlocks<uint32_t> {
        SmallTestStructuredBlockSizes()
        {
            const uint32_t FIXED_SIZE = 1 << 14;
            this->ecc_op = FIXED_SIZE;
            this->pub_inputs = FIXED_SIZE;
            this->busread = FIXED_SIZE;
            this->arithmetic = 1 << 15;
            this->delta_range = FIXED_SIZE;
            this->elliptic = FIXED_SIZE;
            this->aux = FIXED_SIZE;
            this->poseidon2_external = FIXED_SIZE;
            this->poseidon2_internal = 1 << 15;
            this->lookup = FIXED_SIZE;
            this->overflow = 0;
        }
    };

    // A minimal structuring specifically tailored to the medium complexity transaction for the ClientIVC benchmark
    struct ClientIvcBenchStructuredBlockSizes : public MegaTraceBlocks<uint32_t> {
        ClientIvcBenchStructuredBlockSizes()
        {
            // 2^19
            this->ecc_op = 1 << 10;
            this->pub_inputs = 1 << 7;
            this->busread = 1 << 7;
            this->arithmetic = 198000;
            this->delta_range = 90000;
            this->elliptic = 9000;
            this->aux = 136000;
            this->poseidon2_external = 2500;
            this->poseidon2_internal = 14000;
            this->lookup = 72000;
            this->overflow = 0;

            // Additional structurings for testing
            // // 2^18 (Only viable if no 2^19 circuit is used!)
            // this->ecc_op = 1 << 10;
            // this->pub_inputs = 1 << 6;
            // this->busread = 1 << 6;
            // this->arithmetic = 84000;
            // this->delta_range = 45000;
            // this->elliptic = 9000;
            // this->aux = 68000;
            // this->poseidon2_external = 2500;
            // this->poseidon2_internal = 14000;
            // this->lookup = 36000;
            // this->overflow = 0;

            // // 2^20
            // this->ecc_op = 1 << 11;
            // this->pub_inputs = 1 << 8;
            // this->busread = 1 << 8;
            // this->arithmetic = 396000;
            // this->delta_range = 180000;
            // this->elliptic = 18000;
            // this->aux = 272000;
            // this->poseidon2_external = 5000;
            // this->poseidon2_internal = 28000;
            // this->lookup = 144000;
            // this->overflow = 0;
        }
    };

    // Structuring tailored to the full e2e TS test (TO BE UPDATED ACCORDINGLY)
    struct E2eStructuredBlockSizes : public MegaTraceBlocks<uint32_t> {
        E2eStructuredBlockSizes()
        {
            this->ecc_op = 1 << 10;
            this->pub_inputs = 4000;
            this->busread = 6000;
            this->arithmetic = 200000;
            this->delta_range = 25000;
            this->elliptic = 80000;
            this->aux = 100000;
            this->poseidon2_external = 30128;
            this->poseidon2_internal = 172000;
            this->lookup = 200000;
            this->overflow = 0;
        }
    };

    static constexpr size_t NUM_WIRES = 4;
    static constexpr size_t NUM_SELECTORS = 14;

    using FF = FF_;

    class MegaTraceBlock : public ExecutionTraceBlock<FF, NUM_WIRES, NUM_SELECTORS> {
        using SelectorType = ExecutionTraceBlock<FF, NUM_WIRES, NUM_SELECTORS>::SelectorType;

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
        auto& q_arith() { return this->selectors[7]; };
        auto& q_delta_range() { return this->selectors[8]; };
        auto& q_elliptic() { return this->selectors[9]; };
        auto& q_aux() { return this->selectors[10]; };
        auto& q_poseidon2_external() { return this->selectors[11]; };
        auto& q_poseidon2_internal() { return this->selectors[12]; };
        auto& q_lookup_type() { return this->selectors[13]; };

        RefVector<SelectorType> get_gate_selectors()
        {
            return { q_busread(),
                     q_arith(),
                     q_delta_range(),
                     q_elliptic(),
                     q_aux(),
                     q_poseidon2_external(),
                     q_poseidon2_internal(),
                     q_lookup_type() };
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

    struct TraceBlocks : public MegaTraceBlocks<MegaTraceBlock> {

        bool has_overflow = false; // indicates whether the overflow block has non-zero fixed or actual size

        TraceBlocks()
        {
            this->aux.has_ram_rom = true;
            this->pub_inputs.is_pub_inputs = true;
        }

        // Set fixed block sizes for use in structured trace
        void set_fixed_block_sizes(TraceSettings settings)
        {
            MegaTraceBlocks<uint32_t> fixed_block_sizes{}; // zero initialized

            switch (settings.structure) {
            case TraceStructure::NONE:
                break;
            case TraceStructure::TINY_TEST:
                fixed_block_sizes = TinyTestStructuredBlockSizes();
                break;
            case TraceStructure::SMALL_TEST:
                fixed_block_sizes = SmallTestStructuredBlockSizes();
                break;
            case TraceStructure::CLIENT_IVC_BENCH:
                fixed_block_sizes = ClientIvcBenchStructuredBlockSizes();
                break;
            case TraceStructure::E2E_FULL_TEST:
                fixed_block_sizes = E2eStructuredBlockSizes();
                break;
            }
            for (auto [block, size] : zip_view(this->get(), fixed_block_sizes.get())) {
                block.set_fixed_size(size);
            }
            // Set the size of overflow block containing the overflow from all other blocks
            this->overflow.set_fixed_size(settings.overflow_capacity);
        }

        void compute_offsets(bool is_structured)
        {
            uint32_t offset = 1; // start at 1 because the 0th row is unused for selectors for Honk
            for (auto& block : this->get()) {
                block.trace_offset = offset;
                offset += block.get_fixed_size(is_structured);
            }
        }

        void summarize() const
        {
            info("Gate blocks summary: (actual gates / fixed capacity)");
            info("goblin ecc op :\t", this->ecc_op.size(), "/", this->ecc_op.get_fixed_size());
            info("pub inputs    :\t", this->pub_inputs.size(), "/", this->pub_inputs.get_fixed_size());
            info("busread       :\t", this->busread.size(), "/", this->busread.get_fixed_size());
            info("arithmetic    :\t", this->arithmetic.size(), "/", this->arithmetic.get_fixed_size());
            info("delta range   :\t", this->delta_range.size(), "/", this->delta_range.get_fixed_size());
            info("elliptic      :\t", this->elliptic.size(), "/", this->elliptic.get_fixed_size());
            info("auxiliary     :\t", this->aux.size(), "/", this->aux.get_fixed_size());
            info("poseidon ext  :\t", this->poseidon2_external.size(), "/", this->poseidon2_external.get_fixed_size());
            info("poseidon int  :\t", this->poseidon2_internal.size(), "/", this->poseidon2_internal.get_fixed_size());
            info("lookups       :\t", this->lookup.size(), "/", this->lookup.get_fixed_size());
            info("overflow      :\t", this->overflow.size(), "/", this->overflow.get_fixed_size());
            info("");
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

        bool operator==(const TraceBlocks& other) const = default;
    };

    // Note: Unused. Needed only for consistency with Ultra arith (which is used by Plonk)
    inline static const std::vector<std::string> selector_names = {};
};

using MegaArithmetization = MegaArith<bb::fr>;

template <typename T>
concept HasAdditionalSelectors = IsAnyOf<T, MegaArith<bb::fr>>;
} // namespace bb
