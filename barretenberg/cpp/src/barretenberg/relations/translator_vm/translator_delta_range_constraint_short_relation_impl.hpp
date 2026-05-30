// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_short_relation.hpp"

namespace bb {

/**
 * @brief Expression for the generalized permutation sort relation
 *
 * @details The relation enforces 2 constraints on each of the ordered_range_constraints wires:
 * 1) 2 sequential values are non-descending and have a difference of at most 3. This check is skipped
 *    at the real_last index (lagrange_real_last = 1) and in the ordered masking region
 *    (lagrange_ordered_masking = 1).
 * 2) The value at the real_last index is 2¹⁴ - 1.
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorDeltaRangeConstraintShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                                     const AllEntities& in,
                                                                     const Parameters& /*unused*/,
                                                                     const FF& scaling_factor)
{
    static const FF minus_one = FF(-1);
    static const FF minus_two = FF(-2);
    static const FF minus_three = FF(-3);
    static const size_t micro_limb_bits = 14;
    static const auto maximum_sort_value = -FF((1 << micro_limb_bits) - 1);

    [&]() {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using View = TranslatorShortMonomialView<Accumulator>;
        auto ordered_range_constraints_0 = View(in.ordered_range_constraints_0);
        auto ordered_range_constraints_1 = View(in.ordered_range_constraints_1);
        auto ordered_range_constraints_2 = View(in.ordered_range_constraints_2);
        auto ordered_range_constraints_3 = View(in.ordered_range_constraints_3);
        auto ordered_range_constraints_4 = View(in.ordered_range_constraints_4);
        auto ordered_range_constraints_0_shift = View(in.ordered_range_constraints_0_shift);
        auto ordered_range_constraints_1_shift = View(in.ordered_range_constraints_1_shift);
        auto ordered_range_constraints_2_shift = View(in.ordered_range_constraints_2_shift);
        auto ordered_range_constraints_3_shift = View(in.ordered_range_constraints_3_shift);
        auto ordered_range_constraints_4_shift = View(in.ordered_range_constraints_4_shift);

        const auto lagrange_real_last = View(in.lagrange_real_last);
        const auto lagrange_ordered_masking = View(in.lagrange_ordered_masking);

        // 0 at real_last and ordered masking rows (where delta checks are skipped), nonzero elsewhere.
        // lagrange_real_last and lagrange_ordered_masking have disjoint support, so the sum is 0/1.
        const auto not_last_or_masking_scaled =
            Accumulator((lagrange_real_last + lagrange_ordered_masking + minus_one) * scaling_factor);

        // Compute wire differences
        auto delta_1 = ordered_range_constraints_0_shift - ordered_range_constraints_0;
        auto delta_2 = ordered_range_constraints_1_shift - ordered_range_constraints_1;
        auto delta_3 = ordered_range_constraints_2_shift - ordered_range_constraints_2;
        auto delta_4 = ordered_range_constraints_3_shift - ordered_range_constraints_3;
        auto delta_5 = ordered_range_constraints_4_shift - ordered_range_constraints_4;

        auto accumulate_delta_check = [&](auto& accumulator, const auto& delta) {
            auto tmp =
                Accumulator(delta * (delta + minus_one)) * Accumulator((delta + minus_two) * (delta + minus_three));
            tmp *= not_last_or_masking_scaled;
            accumulator += tmp;
        };

        // The ordered_range_constraints wires are sorted ascending, so each is constant over long runs. On an edge where
        // ordered_i is locally constant, delta_i is the zero edge polynomial and P(delta_i) = delta(delta-1)(delta-2)
        // (delta-3) vanishes identically, so this subrelation adds nothing. Skipping the degree-4 product there checks
        // the actual delta value (not a selector), so it is sound in every sumcheck round. Test zero-ness on the raw
        // length-2 edge entities, since the coefficient-basis view has no is_zero().
        // Contributions (1-5) ensure that sequential values have a difference of {0,1,2,3}.
        if (!(in.ordered_range_constraints_0_shift - in.ordered_range_constraints_0).is_zero()) {
            accumulate_delta_check(std::get<0>(accumulators), delta_1);
        }
        if (!(in.ordered_range_constraints_1_shift - in.ordered_range_constraints_1).is_zero()) {
            accumulate_delta_check(std::get<1>(accumulators), delta_2);
        }
        if (!(in.ordered_range_constraints_2_shift - in.ordered_range_constraints_2).is_zero()) {
            accumulate_delta_check(std::get<2>(accumulators), delta_3);
        }
        if (!(in.ordered_range_constraints_3_shift - in.ordered_range_constraints_3).is_zero()) {
            accumulate_delta_check(std::get<3>(accumulators), delta_4);
        }
        if (!(in.ordered_range_constraints_4_shift - in.ordered_range_constraints_4).is_zero()) {
            accumulate_delta_check(std::get<4>(accumulators), delta_5);
        }
    }();

    [&]() {
        using Accumulator = std::tuple_element_t<5, ContainerOverSubrelations>;
        using View = TranslatorShortMonomialView<Accumulator>;
        auto ordered_range_constraints_0 = View(in.ordered_range_constraints_0);
        auto ordered_range_constraints_1 = View(in.ordered_range_constraints_1);
        auto ordered_range_constraints_2 = View(in.ordered_range_constraints_2);
        auto ordered_range_constraints_3 = View(in.ordered_range_constraints_3);
        auto ordered_range_constraints_4 = View(in.ordered_range_constraints_4);
        // Every max-value subrelation carries a lagrange_real_last factor, so on any edge where lagrange_real_last is
        // identically zero all five contributions are the zero polynomial. lagrange_real_last is nonzero at a single
        // index, so this skips the degree-2 products on essentially every edge.
        if (!in.lagrange_real_last.is_zero()) {
            const auto lagrange_real_last = View(in.lagrange_real_last);
            const auto lagrange_real_last_scaled = lagrange_real_last * scaling_factor;

            // Contribution (6) (Contributions 6-10 ensure that the last value is the designated maximum value. We don't
            // need to constrain the first value to be 0, because the shift mechanic does this for us)
            std::get<5>(accumulators) +=
                Accumulator(lagrange_real_last_scaled * (ordered_range_constraints_0 + maximum_sort_value));
            // Contribution (7)
            std::get<6>(accumulators) +=
                Accumulator(lagrange_real_last_scaled * (ordered_range_constraints_1 + maximum_sort_value));
            // Contribution (8)
            std::get<7>(accumulators) +=
                Accumulator(lagrange_real_last_scaled * (ordered_range_constraints_2 + maximum_sort_value));
            // Contribution (9)
            std::get<8>(accumulators) +=
                Accumulator(lagrange_real_last_scaled * (ordered_range_constraints_3 + maximum_sort_value));
            // Contribution (10)
            std::get<9>(accumulators) +=
                Accumulator(lagrange_real_last_scaled * (ordered_range_constraints_4 + maximum_sort_value));
        }
    }();
};
} // namespace bb
