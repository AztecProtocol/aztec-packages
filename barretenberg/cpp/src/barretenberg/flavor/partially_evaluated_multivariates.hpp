// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <algorithm>
#include <utility>
#include <vector>

namespace bb {

using RowSkipRange = std::pair<size_t, size_t>;

inline size_t row_skip_round_up_to_even(const size_t value)
{
    return value + (value & 1U);
}

inline void append_row_skip_range(std::vector<RowSkipRange>& ranges, size_t start, size_t end)
{
    start &= ~static_cast<size_t>(1);
    end = row_skip_round_up_to_even(end);
    if (end <= start) {
        return;
    }

    if (!ranges.empty()) {
        auto& previous = ranges.back();
        if (start <= previous.second) {
            previous.second = std::max(previous.second, end);
            return;
        }
    }
    ranges.emplace_back(start, end);
}

inline std::vector<RowSkipRange> fold_row_skip_ranges(const std::vector<RowSkipRange>& ranges)
{
    std::vector<RowSkipRange> result;
    for (const auto& [start, end] : ranges) {
        append_row_skip_range(result, start / 2, (end / 2) + (end & 1U));
    }
    return result;
}

/**
 * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
 * @details This base class provides the common implementation for all flavors. Each flavor
 * should define a type alias like:
 *   using PartiallyEvaluatedMultivariates = PartiallyEvaluatedMultivariatesBase<AllEntities<Polynomial>,
 * ProverPolynomials, Polynomial>;
 *
 * @tparam AllEntitiesBase The AllEntities<Polynomial> type from the flavor
 * @tparam ProverPolynomialsType The ProverPolynomials type from the flavor
 * @tparam Polynomial The Polynomial type from the flavor
 */
template <typename AllEntitiesBase, typename ProverPolynomialsType, typename Polynomial>
class PartiallyEvaluatedMultivariatesBase : public AllEntitiesBase {
  public:
    size_t row_skip_active_prefix_end = 0;
    std::vector<RowSkipRange> row_skip_ranges;

    /**
     * @brief Construct from full polynomials, allocating based on their actual sizes.
     * @details After the initial sumcheck round, the new size is CEIL(size/2).
     */
    PartiallyEvaluatedMultivariatesBase(const ProverPolynomialsType& full_polynomials, size_t circuit_size)
    {
        for (auto [poly, full_poly] : zip_view(this->get_all(), full_polynomials.get_all())) {
            // After the initial sumcheck round, the new size is CEIL(size/2).
            size_t desired_size = (full_poly.end_index() / 2) + (full_poly.end_index() % 2);
            // partially_evaluate writes to [0, desired_size) before any read; backing memory can be left uninitialized.
            poly = Polynomial(desired_size, circuit_size / 2, 0, Polynomial::DontZeroMemory::FLAG);
        }
        if constexpr (requires { full_polynomials.row_skip_active_prefix_end; }) {
            row_skip_active_prefix_end =
                (full_polynomials.row_skip_active_prefix_end / 2) + (full_polynomials.row_skip_active_prefix_end % 2);
        }
        if constexpr (requires { full_polynomials.row_skip_ranges; }) {
            row_skip_ranges = fold_row_skip_ranges(full_polynomials.row_skip_ranges);
        }
    }
};

} // namespace bb
