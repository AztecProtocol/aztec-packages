// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/translator_vm/translator_permutation_relation.hpp"

namespace bb {

/**
 * @brief Compute contribution of the goblin translator permutation relation for a given edge (internal function)
 *
 * @details There are 3 sub-relations associated with enforcing the set permutation relation.
 * Sub-relation 0 confirms faithful calculation of the grand product polynomial Z_perm.
 * Sub-relation 1 enforces Z_perm_shift = 0 at lagrange_last (grand product closure).
 * Sub-relation 2 enforces Z_perm = 0 at lagrange_first (grand product initialization).
 *
 *  C(in(X)...) =
 *      ( z_perm(X) + lagrange_first(X) )*P(X)
 *         - ( z_perm_shift(X) + lagrange_last(X))*Q(X),
 * where P(X) = Prod_{i=0:3} (concatenated_range_constraint_i(X) + lagrange_masking * β + γ)
 *            * (extra_numerator(X) + lagrange_ordered_masking * β + γ)
 *       Q(X) = Prod_{i=0:4} (ordered_range_constraint_i(X) + lagrange_ordered_masking * β + γ)
 * the first 4 numerator polynomials are concatenated range constraint polynomials and the last one is the
 * extra numerator
 *
 * If operating in zero-knowledge, we use two different masking selectors:
 * - lagrange_masking marks scattered masking positions (last NUM_MASKED_ROWS_END rows of each of 16 blocks)
 *   in concatenated polynomials
 * - lagrange_ordered_masking marks contiguous masking positions (last NUM_MASKED_ROWS_END positions at circuit end)
 *   in ordered polynomials
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */

template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorPermutationRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                       const AllEntities& in,
                                                       const Parameters& params,
                                                       const FF& scaling_factor)
{
    [&]() {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        const auto z_perm = View(in.z_perm);
        const auto z_perm_shift = View(in.z_perm_shift);
        const auto lagrange_first = View(in.lagrange_first);
        const auto lagrange_last = View(in.lagrange_last);

        // Contribution (1)
        std::get<0>(accumulators) +=
            (((z_perm + lagrange_first) * compute_grand_product_numerator<Accumulator>(in, params)) -
             ((z_perm_shift + lagrange_last) * compute_grand_product_denominator<Accumulator>(in, params))) *
            scaling_factor;
    }();

    [&]() {
        using Accumulator = std::tuple_element_t<1, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        const auto z_perm_shift = View(in.z_perm_shift);
        const auto lagrange_last = View(in.lagrange_last);

        // Contribution (2)
        std::get<1>(accumulators) += (lagrange_last * z_perm_shift) * scaling_factor;
    }();

    [&]() {
        using Accumulator = std::tuple_element_t<2, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        const auto z_perm = View(in.z_perm);
        const auto lagrange_first = View(in.lagrange_first);

        // Contribution (3): Enforce z_perm starts at 0. The grand product initialization relies on
        // z_perm[0] = 0 so that (z_perm + lagrange_first) evaluates to 1 at the first row.
        std::get<2>(accumulators) += (lagrange_first * z_perm) * scaling_factor;
    }();
};
} // namespace bb
