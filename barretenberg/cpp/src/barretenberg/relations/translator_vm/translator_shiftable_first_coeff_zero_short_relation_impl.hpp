// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/translator_vm/translator_shiftable_first_coeff_zero_short_relation.hpp"

namespace bb {

/**
 * @brief Anchors ordered_range_constraints_i[0] = 0 for each of the 5 sorted range-check wires (short-monomial form).
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorShiftableFirstCoeffZeroShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                                        const AllEntities& in,
                                                                        const Parameters& /*unused*/,
                                                                        const FF& scaling_factor)
{
    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = TranslatorShortMonomialView<Accumulator>;

    // Every contribution carries a lagrange_first factor, so on any edge where lagrange_first is identically zero all
    // five contributions are the zero polynomial. lagrange_first is nonzero at a single index, so this skips the
    // degree-2 products on essentially every edge.
    if (!in.lagrange_first.is_zero()) {
        auto ordered_range_constraints_0 = View(in.ordered_range_constraints_0);
        auto ordered_range_constraints_1 = View(in.ordered_range_constraints_1);
        auto ordered_range_constraints_2 = View(in.ordered_range_constraints_2);
        auto ordered_range_constraints_3 = View(in.ordered_range_constraints_3);
        auto ordered_range_constraints_4 = View(in.ordered_range_constraints_4);
        const auto lagrange_first = View(in.lagrange_first);
        const auto lagrange_first_scaled = lagrange_first * scaling_factor;

        // Contributions 0-4 pin the first value of each sorted ordered_range_constraints wire to 0.
        std::get<0>(accumulators) += Accumulator(lagrange_first_scaled * ordered_range_constraints_0);
        std::get<1>(accumulators) += Accumulator(lagrange_first_scaled * ordered_range_constraints_1);
        std::get<2>(accumulators) += Accumulator(lagrange_first_scaled * ordered_range_constraints_2);
        std::get<3>(accumulators) += Accumulator(lagrange_first_scaled * ordered_range_constraints_3);
        std::get<4>(accumulators) += Accumulator(lagrange_first_scaled * ordered_range_constraints_4);
    }
}
} // namespace bb
