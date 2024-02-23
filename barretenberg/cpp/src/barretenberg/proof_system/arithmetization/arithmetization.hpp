#pragma once
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/proof_system/types/circuit_type.hpp"
#include <array>
#include <barretenberg/common/slab_allocator.hpp>
#include <cstddef>
#include <vector>

namespace bb {

/**
 * @brief Specify the structure of a CircuitBuilder
 *
 * @details This is typically passed as a template argument specifying the structure of a circuit constructor. It
 * should only ever contain circuit constructor data--it should not contain data that is particular to any
 * proving system.
 *
 * @remark It may make sense to say this is only partial arithmetization data, with the full data being
 * contained in the circuit constructor. We could change the name of this class if it conflicts with common usage.
 *
 * @note For even greater modularity, in each instantiation we could specify a list of components here, where a
 * component is a meaningful collection of functions for creating gates, as in:
 *
 * struct Component {
 *     using Arithmetic = component::Arithmetic3Wires;
 *     using RangeConstraints = component::Base4Accumulators or component::GenPerm or...
 *     using LookupTables = component::Plookup4Wire or component::CQ8Wire or...
 *     ...
 * };
 *
 * We should only do this if it becomes necessary or convenient.
 */

// These are not magic numbers and they should not be written with global constants. These parameters are not
// accessible through clearly named static class members.
template <typename FF_> class StandardArith {
  public:
    static constexpr size_t NUM_WIRES = 3;
    static constexpr size_t NUM_SELECTORS = 5;
    using FF = FF_;
    using SelectorType = std::vector<FF, bb::ContainerSlabAllocator<FF>>;
    using WireType = std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>;
    using Selectors = std::array<SelectorType, NUM_SELECTORS>;
    using Wires = std::array<WireType, NUM_WIRES>;

    struct ExecutionTraceBlock {
        Wires wires;
        Selectors selectors;
        bool is_public_input = false;

        // WORKTODO: would be nice to do this instead of getters but we lose convenience of block.wires
        // WireType w_l;
        // WireType w_r;
        // WireType w_o;

        void update_wires(const uint32_t& idx_1, const uint32_t& idx_2, const uint32_t& idx_3)
        {
            wires[0].emplace_back(idx_1);
            wires[1].emplace_back(idx_2);
            wires[2].emplace_back(idx_3);
        }

        WireType& w_l() { return std::get<0>(wires); };
        WireType& w_r() { return std::get<1>(wires); };
        WireType& w_o() { return std::get<2>(wires); };

        SelectorType& q_m() { return selectors[0]; };
        SelectorType& q_1() { return selectors[1]; };
        SelectorType& q_2() { return selectors[2]; };
        SelectorType& q_3() { return selectors[3]; };
        SelectorType& q_c() { return selectors[4]; };

        void reserve(size_t size_hint)
        {
            for (auto& w : wires) {
                w.reserve(size_hint);
            }
            for (auto& p : selectors) {
                p.reserve(size_hint);
            }
        }
    };

    struct TraceBlocks {
        ExecutionTraceBlock pub_inputs;
        ExecutionTraceBlock arithmetic;

        auto get() { return RefArray{ pub_inputs, arithmetic }; }
    };

    // Note: These are needed for Plonk only (for poly storage in a std::map). Must be in same order as above struct.
    inline static const std::vector<std::string> selector_names = { "q_m", "q_1", "q_2", "q_3", "q_c" };
};

template <typename FF_> class UltraArith {
  public:
    static constexpr size_t NUM_WIRES = 4;
    static constexpr size_t NUM_SELECTORS = 11;
    using FF = FF_;
    using SelectorType = std::vector<FF, bb::ContainerSlabAllocator<FF>>;
    using WireType = std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>;
    using Selectors = std::array<SelectorType, NUM_SELECTORS>;
    using Wires = std::array<WireType, NUM_WIRES>;

    struct ExecutionTraceBlock {
        Wires wires;
        Selectors selectors;
        bool is_public_input = false;

        WireType& w_l() { return std::get<0>(wires); };
        WireType& w_r() { return std::get<1>(wires); };
        WireType& w_o() { return std::get<2>(wires); };
        WireType& w_4() { return std::get<3>(wires); };

        const WireType& w_l() const { return std::get<0>(wires); };
        const WireType& w_r() const { return std::get<1>(wires); };
        const WireType& w_o() const { return std::get<2>(wires); };
        const WireType& w_4() const { return std::get<3>(wires); };

        SelectorType& q_m() { return selectors[0]; };
        SelectorType& q_c() { return selectors[1]; };
        SelectorType& q_1() { return selectors[2]; };
        SelectorType& q_2() { return selectors[3]; };
        SelectorType& q_3() { return selectors[4]; };
        SelectorType& q_4() { return selectors[5]; };
        SelectorType& q_arith() { return selectors[6]; };
        SelectorType& q_sort() { return selectors[7]; };
        SelectorType& q_elliptic() { return selectors[8]; };
        SelectorType& q_aux() { return selectors[9]; };
        SelectorType& q_lookup_type() { return selectors[10]; };

        const SelectorType& q_m() const { return selectors[0]; };
        const SelectorType& q_c() const { return selectors[1]; };
        const SelectorType& q_1() const { return selectors[2]; };
        const SelectorType& q_2() const { return selectors[3]; };
        const SelectorType& q_3() const { return selectors[4]; };
        const SelectorType& q_4() const { return selectors[5]; };
        const SelectorType& q_arith() const { return selectors[6]; };
        const SelectorType& q_sort() const { return selectors[7]; };
        const SelectorType& q_elliptic() const { return selectors[8]; };
        const SelectorType& q_aux() const { return selectors[9]; };
        const SelectorType& q_lookup_type() const { return selectors[10]; };

        void reserve(size_t size_hint)
        {
            for (auto& w : wires) {
                w.reserve(size_hint);
            }
            for (auto& p : selectors) {
                p.reserve(size_hint);
            }
        }
    };

    struct TraceBlocks {
        ExecutionTraceBlock pub_inputs;
        ExecutionTraceBlock main;

        auto get() { return RefArray{ pub_inputs, main }; }
    };

    // Note: These are needed for Plonk only (for poly storage in a std::map). Must be in same order as above struct.
    inline static const std::vector<std::string> selector_names = { "q_m",        "q_c",   "q_1",       "q_2",
                                                                    "q_3",        "q_4",   "q_arith",   "q_sort",
                                                                    "q_elliptic", "q_aux", "table_type" };
};

/**
 * @brief Ultra Honk arithmetization
 * @details Extends the conventional Ultra arithmetization with a new selector related to databus lookups
 *
 * @tparam FF_
 */
template <typename FF_> class UltraHonkArith {
  public:
    static constexpr size_t NUM_WIRES = 4;
    static constexpr size_t NUM_SELECTORS = 14;
    using FF = FF_;
    using SelectorType = std::vector<FF, bb::ContainerSlabAllocator<FF>>;
    using WireType = std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>;
    using Selectors = std::array<SelectorType, NUM_SELECTORS>;
    using Wires = std::array<WireType, NUM_WIRES>;

    struct ExecutionTraceBlock {
        Wires wires;
        Selectors selectors;
        bool is_public_input = false;

        WireType& w_l() { return std::get<0>(wires); };
        WireType& w_r() { return std::get<1>(wires); };
        WireType& w_o() { return std::get<2>(wires); };
        WireType& w_4() { return std::get<3>(wires); };

        const WireType& w_l() const { return std::get<0>(wires); };
        const WireType& w_r() const { return std::get<1>(wires); };
        const WireType& w_o() const { return std::get<2>(wires); };
        const WireType& w_4() const { return std::get<3>(wires); };

        SelectorType& q_m() { return selectors[0]; };
        SelectorType& q_c() { return selectors[1]; };
        SelectorType& q_1() { return selectors[2]; };
        SelectorType& q_2() { return selectors[3]; };
        SelectorType& q_3() { return selectors[4]; };
        SelectorType& q_4() { return selectors[5]; };
        SelectorType& q_arith() { return selectors[6]; };
        SelectorType& q_sort() { return selectors[7]; };
        SelectorType& q_elliptic() { return selectors[8]; };
        SelectorType& q_aux() { return selectors[9]; };
        SelectorType& q_lookup_type() { return selectors[10]; };
        SelectorType& q_busread() { return selectors[11]; };
        SelectorType& q_poseidon2_external() { return this->selectors[12]; };
        SelectorType& q_poseidon2_internal() { return this->selectors[13]; };

        const SelectorType& q_m() const { return selectors[0]; };
        const SelectorType& q_c() const { return selectors[1]; };
        const SelectorType& q_1() const { return selectors[2]; };
        const SelectorType& q_2() const { return selectors[3]; };
        const SelectorType& q_3() const { return selectors[4]; };
        const SelectorType& q_4() const { return selectors[5]; };
        const SelectorType& q_arith() const { return selectors[6]; };
        const SelectorType& q_sort() const { return selectors[7]; };
        const SelectorType& q_elliptic() const { return selectors[8]; };
        const SelectorType& q_aux() const { return selectors[9]; };
        const SelectorType& q_lookup_type() const { return selectors[10]; };
        const SelectorType& q_busread() const { return selectors[11]; };
        const SelectorType& q_poseidon2_external() const { return this->selectors[12]; };
        const SelectorType& q_poseidon2_internal() const { return this->selectors[13]; };

        void reserve(size_t size_hint)
        {
            for (auto& w : wires) {
                w.reserve(size_hint);
            }
            for (auto& p : selectors) {
                p.reserve(size_hint);
            }
        }

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

    struct TraceBlocks {
        ExecutionTraceBlock ecc_op;
        ExecutionTraceBlock pub_inputs;
        ExecutionTraceBlock main;

        auto get() { return RefArray{ ecc_op, pub_inputs, main }; }
    };

    // Note: Unused. Needed only for consistency with Ultra arith (which is used by Plonk)
    inline static const std::vector<std::string> selector_names = {};
};

class GoblinTranslatorArith {
  public:
    static constexpr size_t NUM_WIRES = 81;
    static constexpr size_t NUM_SELECTORS = 0;
};

template <typename T>
concept HasAdditionalSelectors = IsAnyOf<T, UltraHonkArith<bb::fr>>;
} // namespace bb