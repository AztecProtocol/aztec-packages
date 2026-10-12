// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/fold_stride2.hpp"
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
    // One-past the last relation-active row at this round; the sumcheck prover skips rows beyond it. Halved each round
    // to track the trace folding (here and in SumcheckProver::partially_evaluate). Populated only by flavors with a
    // static row-skip manifest; 0 means scan every row.
    size_t row_skip_active_prefix_end = 0;

    /**
     * @brief Construct from full polynomials, allocating based on their actual backed ranges.
     * @details After `num_folds` (1 or 2) sumcheck rounds, a polynomial backed on [start, end) is backed on
     * [FLOOR(start/2^num_folds), CEIL(end/2^num_folds)).
     */
    PartiallyEvaluatedMultivariatesBase(const ProverPolynomialsType& full_polynomials,
                                        size_t circuit_size,
                                        size_t num_folds = 1)
    {
        BB_ASSERT(num_folds == 1 || num_folds == 2);
        for (auto [poly, full_poly] : zip_view(this->get_all(), full_polynomials.get_all())) {
            const auto [start, end] =
                num_folds == 1 ? folded_backed_range(full_poly) : twice_folded_backed_range(full_poly);
            // partially_evaluate writes to [start, end) before any read; backing memory can be left uninitialized.
            poly = Polynomial(end - start, circuit_size / 2, start, Polynomial::DontZeroMemory::FLAG);
        }
        if constexpr (requires { full_polynomials.row_skip_active_prefix_end; }) {
            row_skip_active_prefix_end = full_polynomials.row_skip_active_prefix_end;
            for (size_t fold = 0; fold < num_folds; fold++) {
                row_skip_active_prefix_end = (row_skip_active_prefix_end / 2) + (row_skip_active_prefix_end % 2);
            }
        }
    }
};

/**
 * @brief The prover polynomials folded at the first sumcheck challenge, as `FoldedPolynomialView`s computed on access.
 * @details Lets the second sumcheck round read the first round's partial evaluations without materializing them; the
 * tables are then built directly after two folds (see SumcheckProver::partially_evaluate_first_two_rounds).
 *
 * @tparam AllViewsBase The AllEntities<FoldedPolynomialView<FF>> type from the flavor
 */
template <typename AllViewsBase, typename ProverPolynomialsType, typename FF>
class FoldedMultivariatesBase : public AllViewsBase {
  public:
    FoldedMultivariatesBase(const ProverPolynomialsType& full_polynomials, const FF& challenge)
    {
        for (auto [view, full_poly] : zip_view(this->get_all(), full_polynomials.get_all())) {
            view = FoldedPolynomialView<FF>(full_poly, challenge);
        }
    }
};

} // namespace bb
