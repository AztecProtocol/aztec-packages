#pragma once
#include "barretenberg/polynomials/univariate.hpp"
#include <array>
#include <memory>

namespace bb {

/**
 * @brief LazilyExtendedEdges - Container for lazily extended univariates in sumcheck
 *
 * @details This class provides lazy per-polynomial extension following the AVM pattern (commit 96894dd).
 *          Instead of extending all polynomials when set_current_edge() is called, it defers extension
 *          until each polynomial is actually accessed by relations.
 *
 *          The key optimization is that relations often check a selector (e.g., q_poseidon2_internal)
 *          and exit early if it's zero. With eager extension, we pay the cost of extending ALL
 *          polynomials even when most won't be used. With lazy extension, we only extend what's needed.
 *
 * @tparam SourceEntities The flavor's ProverPolynomials or PartiallyEvaluatedMultivariates
 * @tparam FF The field type
 * @tparam MAX_LENGTH Maximum univariate length (MAX_PARTIAL_RELATION_LENGTH)
 * @tparam NUM_ENTITIES Number of polynomials (NUM_ALL_ENTITIES)
 * @tparam USE_SHORT If true, use length 2 univariates; if false, extend to MAX_LENGTH
 */
template <typename SourceEntities, typename FF, size_t MAX_LENGTH, size_t NUM_ENTITIES, bool USE_SHORT = false>
class LazilyExtendedEdges {
  public:
    using UnivariateType = std::conditional_t<USE_SHORT, bb::Univariate<FF, 2>, bb::Univariate<FF, MAX_LENGTH>>;

    LazilyExtendedEdges() = default;

    // Initialize with source polynomials
    void initialize(const SourceEntities& source, size_t edge_idx) {
        source_entities_ = &source;
        current_edge_ = edge_idx;
        // Clear cache when initializing
        for (auto& entry : cache_entries_) {
            entry.univariate.reset();
            entry.edge_idx = std::numeric_limits<size_t>::max();
        }
    }

    // Update current edge
    void set_current_edge(size_t edge_idx) {
        current_edge_ = edge_idx;
    }

    // Get extended univariate by index (lazy evaluation)
    // Uses per-entry edge tracking instead of global cache clearing
    __attribute__((always_inline)) const UnivariateType& get_by_index(size_t idx) const {
        auto& cache_entry = cache_entries_[idx];

        // Check if cached value is for current edge
        if (cache_entry.edge_idx != current_edge_ || cache_entry.univariate.get() == nullptr) {
            cache_entry.univariate = extend_polynomial_at_index(idx);
            cache_entry.edge_idx = current_edge_;
        }

        return *cache_entry.univariate;
    }

    // Operator[] for array-like access
    const UnivariateType& operator[](size_t idx) const {
        return get_by_index(idx);
    }

    // Named accessors for compatibility with relation code that uses in.member syntax
    // These provide the same interface as AllEntities but with lazy evaluation
    #define LAZY_ACCESSOR(idx, name) \
        __attribute__((always_inline)) const UnivariateType& name() const { return get_by_index(idx); }

    // PrecomputedEntities (indices 0-27) - must match DEFINE_FLAVOR_MEMBERS order
    LAZY_ACCESSOR(0, q_m)
    LAZY_ACCESSOR(1, q_c)
    LAZY_ACCESSOR(2, q_l)
    LAZY_ACCESSOR(3, q_r)
    LAZY_ACCESSOR(4, q_o)
    LAZY_ACCESSOR(5, q_4)
    LAZY_ACCESSOR(6, q_lookup)
    LAZY_ACCESSOR(7, q_arith)
    LAZY_ACCESSOR(8, q_delta_range)
    LAZY_ACCESSOR(9, q_elliptic)
    LAZY_ACCESSOR(10, q_memory)
    LAZY_ACCESSOR(11, q_nnf)
    LAZY_ACCESSOR(12, q_poseidon2_external)
    LAZY_ACCESSOR(13, q_poseidon2_internal)
    LAZY_ACCESSOR(14, sigma_1)
    LAZY_ACCESSOR(15, sigma_2)
    LAZY_ACCESSOR(16, sigma_3)
    LAZY_ACCESSOR(17, sigma_4)
    LAZY_ACCESSOR(18, id_1)
    LAZY_ACCESSOR(19, id_2)
    LAZY_ACCESSOR(20, id_3)
    LAZY_ACCESSOR(21, id_4)
    LAZY_ACCESSOR(22, table_1)
    LAZY_ACCESSOR(23, table_2)
    LAZY_ACCESSOR(24, table_3)
    LAZY_ACCESSOR(25, table_4)
    LAZY_ACCESSOR(26, lagrange_first)
    LAZY_ACCESSOR(27, lagrange_last)

    // WitnessEntities (indices 28-35)
    LAZY_ACCESSOR(28, w_l)
    LAZY_ACCESSOR(29, w_r)
    LAZY_ACCESSOR(30, w_o)
    LAZY_ACCESSOR(31, w_4)
    LAZY_ACCESSOR(32, z_perm)
    LAZY_ACCESSOR(33, lookup_inverses)
    LAZY_ACCESSOR(34, lookup_read_counts)
    LAZY_ACCESSOR(35, lookup_read_tags)

    // ShiftedEntities (indices 36-40)
    LAZY_ACCESSOR(36, w_l_shift)
    LAZY_ACCESSOR(37, w_r_shift)
    LAZY_ACCESSOR(38, w_o_shift)
    LAZY_ACCESSOR(39, w_4_shift)
    LAZY_ACCESSOR(40, z_perm_shift)

    #undef LAZY_ACCESSOR

  private:
    struct CacheEntry {
        std::unique_ptr<UnivariateType> univariate;
        size_t edge_idx = std::numeric_limits<size_t>::max(); // Invalid edge initially
    };

    // Compile-time indexed access for specific polynomial
    template<size_t idx>
    std::unique_ptr<UnivariateType> extend_polynomial_at_index_ct() const {
        if (!source_entities_) {
            return std::make_unique<UnivariateType>(UnivariateType::zero());
        }

        // Use new get_by_index method that avoids concatenation
        const auto& multivariate = source_entities_->template get_by_index<idx>();

        // Handle empty or out-of-bounds polynomials
        if (multivariate.is_empty() || multivariate.end_index() < current_edge_) {
            return std::make_unique<UnivariateType>(UnivariateType::zero());
        }

        // Create univariate from 2 points
        auto base_univariate = bb::Univariate<FF, 2>({ multivariate[current_edge_], multivariate[current_edge_ + 1] });

        // Extend to MAX_LENGTH if needed
        if constexpr (USE_SHORT) {
            return std::make_unique<UnivariateType>(base_univariate);
        } else {
            return std::make_unique<UnivariateType>(base_univariate.template extend_to<MAX_LENGTH>());
        }
    }

    // Runtime dispatch to compile-time version
    std::unique_ptr<UnivariateType> extend_polynomial_at_index(size_t idx) const {
        switch(idx) {
            case 0: return extend_polynomial_at_index_ct<0>();
            case 1: return extend_polynomial_at_index_ct<1>();
            case 2: return extend_polynomial_at_index_ct<2>();
            case 3: return extend_polynomial_at_index_ct<3>();
            case 4: return extend_polynomial_at_index_ct<4>();
            case 5: return extend_polynomial_at_index_ct<5>();
            case 6: return extend_polynomial_at_index_ct<6>();
            case 7: return extend_polynomial_at_index_ct<7>();
            case 8: return extend_polynomial_at_index_ct<8>();
            case 9: return extend_polynomial_at_index_ct<9>();
            case 10: return extend_polynomial_at_index_ct<10>();
            case 11: return extend_polynomial_at_index_ct<11>();
            case 12: return extend_polynomial_at_index_ct<12>();
            case 13: return extend_polynomial_at_index_ct<13>();
            case 14: return extend_polynomial_at_index_ct<14>();
            case 15: return extend_polynomial_at_index_ct<15>();
            case 16: return extend_polynomial_at_index_ct<16>();
            case 17: return extend_polynomial_at_index_ct<17>();
            case 18: return extend_polynomial_at_index_ct<18>();
            case 19: return extend_polynomial_at_index_ct<19>();
            case 20: return extend_polynomial_at_index_ct<20>();
            case 21: return extend_polynomial_at_index_ct<21>();
            case 22: return extend_polynomial_at_index_ct<22>();
            case 23: return extend_polynomial_at_index_ct<23>();
            case 24: return extend_polynomial_at_index_ct<24>();
            case 25: return extend_polynomial_at_index_ct<25>();
            case 26: return extend_polynomial_at_index_ct<26>();
            case 27: return extend_polynomial_at_index_ct<27>();
            case 28: return extend_polynomial_at_index_ct<28>();
            case 29: return extend_polynomial_at_index_ct<29>();
            case 30: return extend_polynomial_at_index_ct<30>();
            case 31: return extend_polynomial_at_index_ct<31>();
            case 32: return extend_polynomial_at_index_ct<32>();
            case 33: return extend_polynomial_at_index_ct<33>();
            case 34: return extend_polynomial_at_index_ct<34>();
            case 35: return extend_polynomial_at_index_ct<35>();
            case 36: return extend_polynomial_at_index_ct<36>();
            case 37: return extend_polynomial_at_index_ct<37>();
            case 38: return extend_polynomial_at_index_ct<38>();
            case 39: return extend_polynomial_at_index_ct<39>();
            case 40: return extend_polynomial_at_index_ct<40>();
            default:
                return std::make_unique<UnivariateType>(UnivariateType::zero());
        }
    }

    const SourceEntities* source_entities_ = nullptr;
    size_t current_edge_ = 0;
    mutable std::array<CacheEntry, NUM_ENTITIES> cache_entries_;
};

} // namespace bb