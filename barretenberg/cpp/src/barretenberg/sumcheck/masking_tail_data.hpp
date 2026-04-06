#pragma once

#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include <array>

namespace bb {

/**
 * @brief Manages ZK masking by writing random values directly into witness polynomials at the disabled head rows.
 *
 * @details With top-of-trace masking, the first NUM_DISABLED_ROWS_IN_SUMCHECK rows are disabled by the row-disabling
 * polynomial. Random masking values are written at positions {1, 2, 3} of witness polynomials (position 0 is the zero
 * row for shifts). Since masking values live in the polynomials themselves, partial evaluation naturally folds them
 * together with the trace data. No separate folding state or claimed evaluation corrections are needed.
 *
 * The compute_disabled_contribution in sumcheck just reads from the partially evaluated polynomials at the disabled
 * edge positions — no overrides needed.
 */
template <typename Flavor> struct MaskingTailData {
    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;
    template <typename DataType> using AllEntities = typename Flavor::template AllEntities<DataType>;

    size_t dyadic_size = 0;
    bool active = false;

    bool is_active() const { return active; }

    /**
     * @brief Write random masking values directly into witness polynomials at the disabled head positions.
     * @details Writes random values at positions {1, 2, 3} (NUM_MASKED_ROWS = 3) of each masked witness polynomial.
     * Position 0 stays zero (shift mechanism). The row-disabling polynomial zeroes these positions in the relation,
     * so the masking values don't affect correctness but provide zero-knowledge.
     *
     * @param prover_polynomials The prover polynomials to write masking values into.
     */
    /**
     * @brief Write random masking values into the given polynomials at disabled head positions.
     * @details Call this for each group of witness polynomials BEFORE committing them and AFTER any
     * computation that writes into them. This ensures masking values are present in commitments
     * and are not overwritten by derived witness computations.
     */
    static void mask_polys(auto polys_range)
    {
        constexpr size_t start = NUM_ZERO_ROWS; // = 1
        for (auto& poly : polys_range) {
            for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                poly.at(start + j) = FF::random_element();
            }
        }
    }

    void set_active() { active = true; }
};

} // namespace bb
