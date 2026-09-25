// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/translator_vm/translator_shiftable_first_coeff_zero_relation.hpp"

namespace bb {

/**
 * @brief Anchors the ordered-range and non-range main-wire first values to zero.
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorShiftableFirstCoeffZeroRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                                   const AllEntities& in,
                                                                   const Parameters& /*unused*/,
                                                                   const FF& scaling_factor)
{
    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;
    const auto lagrange_first = View(in.lagrange_first);

    // Contributions 0-4 pin the first value of each sorted ordered_range_constraints wire to 0.
    std::get<0>(accumulators) += lagrange_first * View(in.ordered_range_constraints_0) * scaling_factor;
    std::get<1>(accumulators) += lagrange_first * View(in.ordered_range_constraints_1) * scaling_factor;
    std::get<2>(accumulators) += lagrange_first * View(in.ordered_range_constraints_2) * scaling_factor;
    std::get<3>(accumulators) += lagrange_first * View(in.ordered_range_constraints_3) * scaling_factor;
    std::get<4>(accumulators) += lagrange_first * View(in.ordered_range_constraints_4) * scaling_factor;
    std::get<5>(accumulators) += lagrange_first * View(in.p_x_low_limbs) * scaling_factor;
    std::get<6>(accumulators) += lagrange_first * View(in.p_x_high_limbs) * scaling_factor;
    std::get<7>(accumulators) += lagrange_first * View(in.p_y_low_limbs) * scaling_factor;
    std::get<8>(accumulators) += lagrange_first * View(in.p_y_high_limbs) * scaling_factor;
    std::get<9>(accumulators) += lagrange_first * View(in.z_low_limbs) * scaling_factor;
    std::get<10>(accumulators) += lagrange_first * View(in.z_high_limbs) * scaling_factor;
    std::get<11>(accumulators) += lagrange_first * View(in.accumulators_binary_limbs_0) * scaling_factor;
    std::get<12>(accumulators) += lagrange_first * View(in.accumulators_binary_limbs_1) * scaling_factor;
    std::get<13>(accumulators) += lagrange_first * View(in.accumulators_binary_limbs_2) * scaling_factor;
    std::get<14>(accumulators) += lagrange_first * View(in.accumulators_binary_limbs_3) * scaling_factor;
    std::get<15>(accumulators) += lagrange_first * View(in.quotient_low_binary_limbs) * scaling_factor;
    std::get<16>(accumulators) += lagrange_first * View(in.quotient_high_binary_limbs) * scaling_factor;
    std::get<17>(accumulators) += lagrange_first * View(in.relation_wide_limbs) * scaling_factor;
}
} // namespace bb
