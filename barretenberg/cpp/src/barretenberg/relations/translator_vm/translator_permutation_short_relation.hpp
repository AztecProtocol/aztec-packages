// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/translator_vm/translator_short_monomial_relation_utils.hpp"

namespace bb {

template <typename FF_> class TranslatorPermutationShortRelationImpl {
  public:
    using FF = FF_;
    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 7;

    static constexpr std::array<size_t, 3> SUBRELATION_PARTIAL_LENGTHS{
        7, // grand product construction sub-relation
        3, // left-shiftable polynomial sub-relation
        3  // z_perm initialization sub-relation
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        // If z_perm == z_perm_shift, this implies that none of the wire values for the present input are involved in
        // non-trivial copy constraints.
        return (in.z_perm - in.z_perm_shift).is_zero();
    }

    inline static auto& get_grand_product_polynomial(auto& in) { return in.z_perm; }
    inline static auto& get_shifted_grand_product_polynomial(auto& in) { return in.z_perm_shift; }

    template <typename Accumulator, typename AllEntities, typename Parameters>
    inline static Accumulator compute_grand_product_numerator(const AllEntities& in, const Parameters& params)
    {
        using View = TranslatorShortMonomialView<Accumulator>;
        using ParameterView = Parameters::DataType;

        auto concatenated_range_constraints_0 = View(in.concatenated_range_constraints_0);
        auto concatenated_range_constraints_1 = View(in.concatenated_range_constraints_1);
        auto concatenated_range_constraints_2 = View(in.concatenated_range_constraints_2);
        auto concatenated_range_constraints_3 = View(in.concatenated_range_constraints_3);

        auto ordered_extra_range_constraints_numerator = View(in.ordered_extra_range_constraints_numerator);

        auto lagrange_masking = View(in.lagrange_masking);
        auto lagrange_ordered_masking = View(in.lagrange_ordered_masking);
        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);
        // First 4 factors use scattered masking (lagrange_masking), last factor uses contiguous masking.
        // Keep the first multiply in coefficient basis, then materialize once the degree exceeds the quadratic
        // coefficient-basis helper.
        auto chosen_set = lagrange_masking * beta;
        auto chosen_set2 = lagrange_ordered_masking * beta;
        auto product = Accumulator((concatenated_range_constraints_0 + chosen_set + gamma) *
                                   (concatenated_range_constraints_1 + chosen_set + gamma)) *
                       Accumulator((concatenated_range_constraints_2 + chosen_set + gamma) *
                                   (concatenated_range_constraints_3 + chosen_set + gamma));
        product *= Accumulator(ordered_extra_range_constraints_numerator + chosen_set2 + gamma);
        return product;
    }

    template <typename Accumulator, typename AllEntities, typename Parameters, typename Factor>
    inline static Accumulator compute_grand_product_numerator_with_factor(const AllEntities& in,
                                                                          const Parameters& params,
                                                                          const Factor& factor)
    {
        using View = TranslatorShortMonomialView<Accumulator>;
        using ParameterView = Parameters::DataType;

        auto concatenated_range_constraints_0 = View(in.concatenated_range_constraints_0);
        auto concatenated_range_constraints_1 = View(in.concatenated_range_constraints_1);
        auto concatenated_range_constraints_2 = View(in.concatenated_range_constraints_2);
        auto concatenated_range_constraints_3 = View(in.concatenated_range_constraints_3);

        auto ordered_extra_range_constraints_numerator = View(in.ordered_extra_range_constraints_numerator);

        auto lagrange_masking = View(in.lagrange_masking);
        auto lagrange_ordered_masking = View(in.lagrange_ordered_masking);
        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);
        // The sumcheck contribution multiplies this 5-factor grand product by an outer linear factor. Build the
        // resulting 6-factor product as three quadratic coefficient-basis products before materializing.
        auto chosen_set = lagrange_masking * beta;
        auto chosen_set2 = lagrange_ordered_masking * beta;
        auto product = Accumulator(factor * (concatenated_range_constraints_0 + chosen_set + gamma)) *
                       Accumulator((concatenated_range_constraints_1 + chosen_set + gamma) *
                                   (concatenated_range_constraints_2 + chosen_set + gamma));
        product *= Accumulator((concatenated_range_constraints_3 + chosen_set + gamma) *
                               (ordered_extra_range_constraints_numerator + chosen_set2 + gamma));
        return product;
    }

    template <typename Accumulator, typename AllEntities, typename Parameters>
    inline static Accumulator compute_grand_product_denominator(const AllEntities& in, const Parameters& params)
    {
        using View = TranslatorShortMonomialView<Accumulator>;
        using ParameterView = Parameters::DataType;

        auto ordered_range_constraints_0 = View(in.ordered_range_constraints_0);
        auto ordered_range_constraints_1 = View(in.ordered_range_constraints_1);
        auto ordered_range_constraints_2 = View(in.ordered_range_constraints_2);
        auto ordered_range_constraints_3 = View(in.ordered_range_constraints_3);
        auto ordered_range_constraints_4 = View(in.ordered_range_constraints_4);

        auto lagrange_ordered_masking = View(in.lagrange_ordered_masking);

        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);
        // All 5 factors use contiguous masking at the end (lagrange_ordered_masking).
        auto chosen_set = lagrange_ordered_masking * beta;
        auto product = Accumulator((ordered_range_constraints_0 + chosen_set + gamma) *
                                   (ordered_range_constraints_1 + chosen_set + gamma)) *
                       Accumulator((ordered_range_constraints_2 + chosen_set + gamma) *
                                   (ordered_range_constraints_3 + chosen_set + gamma));
        product *= Accumulator(ordered_range_constraints_4 + chosen_set + gamma);
        return product;
    }

    template <typename Accumulator, typename AllEntities, typename Parameters, typename Factor>
    inline static Accumulator compute_grand_product_denominator_with_factor(const AllEntities& in,
                                                                            const Parameters& params,
                                                                            const Factor& factor)
    {
        using View = TranslatorShortMonomialView<Accumulator>;
        using ParameterView = Parameters::DataType;

        auto ordered_range_constraints_0 = View(in.ordered_range_constraints_0);
        auto ordered_range_constraints_1 = View(in.ordered_range_constraints_1);
        auto ordered_range_constraints_2 = View(in.ordered_range_constraints_2);
        auto ordered_range_constraints_3 = View(in.ordered_range_constraints_3);
        auto ordered_range_constraints_4 = View(in.ordered_range_constraints_4);

        auto lagrange_ordered_masking = View(in.lagrange_ordered_masking);

        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);
        // The sumcheck contribution multiplies this 5-factor grand product by an outer linear factor. Build the
        // resulting 6-factor product as three quadratic coefficient-basis products before materializing.
        auto chosen_set = lagrange_ordered_masking * beta;
        auto product = Accumulator(factor * (ordered_range_constraints_0 + chosen_set + gamma)) *
                       Accumulator((ordered_range_constraints_1 + chosen_set + gamma) *
                                   (ordered_range_constraints_2 + chosen_set + gamma));
        product *= Accumulator((ordered_range_constraints_3 + chosen_set + gamma) *
                               (ordered_range_constraints_4 + chosen_set + gamma));
        return product;
    }
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
     * The lagrange_*_masking * β terms ensure that masking positions contribute unique values to the grand product,
     * preventing information leakage about the underlying witness values at those positions.
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulators,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using TranslatorPermutationShortRelation = Relation<TranslatorPermutationShortRelationImpl<FF>>;

} // namespace bb
