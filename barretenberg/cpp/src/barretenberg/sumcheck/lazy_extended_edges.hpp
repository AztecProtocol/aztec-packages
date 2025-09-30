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
        for (auto& cached : cached_univariates_) {
            cached.reset();
        }
    }

    // Update current edge and invalidate cache
    void set_current_edge(size_t edge_idx) {
        if (current_edge_ != edge_idx) {
            current_edge_ = edge_idx;
            // Clear all cached univariates
            for (auto& cached : cached_univariates_) {
                cached.reset();
            }
        }
    }

    // Get extended univariate by index (lazy evaluation)
    const UnivariateType& get_by_index(size_t idx) const {
        auto& cached = cached_univariates_[idx];
        if (!cached) {
            cached = extend_polynomial_at_index(idx);
        }
        return *cached;
    }

    // Operator[] for array-like access
    const UnivariateType& operator[](size_t idx) const {
        return get_by_index(idx);
    }

  private:
    std::unique_ptr<UnivariateType> extend_polynomial_at_index(size_t idx) const {
        if (!source_entities_) {
            // Not initialized yet
            return std::make_unique<UnivariateType>(UnivariateType::zero());
        }

        auto all_source = source_entities_->get_all();
        const auto& multivariate = all_source[idx];

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

    const SourceEntities* source_entities_ = nullptr;
    size_t current_edge_ = 0;
    mutable std::array<std::unique_ptr<UnivariateType>, NUM_ENTITIES> cached_univariates_;
};

} // namespace bb