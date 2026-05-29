// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

namespace bb {

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
    }
};

} // namespace bb
