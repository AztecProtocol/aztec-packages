// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/translator_vm/translator_decomposition_relation.hpp"

namespace bb {

/**
 * @brief Expression for decomposition of various values into smaller limbs or microlimbs.
 * @details This relation enforces three types of subrelations:
 * 1) A subrelation decomposing a value from the transcript (for example, z1) into 68-bit limbs. These relations
 * will have the structure
 * `lagrange_even_in_minicircuit⋅(a - a_low - a_high⋅2⁶⁸)`
 * 2) A subrelation decomposing a value of one of the limbs used in bigfield computation (for example, the lower
 * wide relation limb) into 14-bit limbs. These relations will have the structure
 * `lagrange_even_in_minicircuit⋅(a - a_0 - a_1⋅2¹⁴ - ....)`
 * 3) A subrelation making a microlimb range constraint more constraining. For example, we want to constrain
 * some values to 12 bits instead of 14. So we add a constraint
 * `lagrange_even_in_minicircuit⋅(a_highest⋅4 - a_tail)`.
 * In a separate relation both a_highest and a_tail are constrained to be 14 bits, but this relation
 * changes the constraint on a_highest to be 12 bits.
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorDecompositionRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                         const AllEntities& in,
                                                         const Parameters&,
                                                         const FF& scaling_factor)
{
    static constexpr size_t NUM_LIMB_BITS = 68;       // Number of bits in a standard limb used for bigfield operations
    static constexpr size_t NUM_MICRO_LIMB_BITS = 14; // Number of bits in a standard limb used for bigfield operations

    [&]() {
        // Within the no-op range i.e. when the op polynomial is 0 at even index the 2 Translator trace rows are empty
        // except for the accumulator binary limbs which get transferred across the no-op range
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        // Values to multiply an element by to perform an appropriate shift
        const auto MICRO_LIMB_SHIFT = FF(uint256_t(1) << NUM_MICRO_LIMB_BITS);
        const auto MICRO_LIMB_SHIFTx2 = MICRO_LIMB_SHIFT * MICRO_LIMB_SHIFT;
        const auto MICRO_LIMB_SHIFTx3 = MICRO_LIMB_SHIFTx2 * MICRO_LIMB_SHIFT;
        const auto MICRO_LIMB_SHIFTx4 = MICRO_LIMB_SHIFTx3 * MICRO_LIMB_SHIFT;

        // A = (A₃ || A₂ || A₁ || A₀)
        auto accumulators_binary_limbs_0 = View(in.accumulators_binary_limbs_0);
        auto accumulators_binary_limbs_1 = View(in.accumulators_binary_limbs_1);
        auto accumulators_binary_limbs_2 = View(in.accumulators_binary_limbs_2);
        auto accumulators_binary_limbs_3 = View(in.accumulators_binary_limbs_3);

        // A₀ = (A₀,₄ || A₀,₃ || A₀,₂ || A₀,₁ || A₀,₀) (68-bit limb)
        auto accumulator_limb_0_range_constraint_0 = View(in.accumulator_low_limbs_range_constraint_0);
        auto accumulator_limb_0_range_constraint_1 = View(in.accumulator_low_limbs_range_constraint_1);
        auto accumulator_limb_0_range_constraint_2 = View(in.accumulator_low_limbs_range_constraint_2);
        auto accumulator_limb_0_range_constraint_3 = View(in.accumulator_low_limbs_range_constraint_3);
        auto accumulator_limb_0_range_constraint_4 = View(in.accumulator_low_limbs_range_constraint_4);

        // A₁ = (A₁,₄ || A₁,₃ || A₁,₂ || A₁,₁ || A₁,₀) (68-bit limb)
        auto accumulator_limb_1_range_constraint_0 = View(in.accumulator_low_limbs_range_constraint_0_shift);
        auto accumulator_limb_1_range_constraint_1 = View(in.accumulator_low_limbs_range_constraint_1_shift);
        auto accumulator_limb_1_range_constraint_2 = View(in.accumulator_low_limbs_range_constraint_2_shift);
        auto accumulator_limb_1_range_constraint_3 = View(in.accumulator_low_limbs_range_constraint_3_shift);
        auto accumulator_limb_1_range_constraint_4 = View(in.accumulator_low_limbs_range_constraint_4_shift);

        // A₂ = (A₂,₄ || A₂,₃ || A₂,₂ || A₂,₁ || A₂,₀) (68-bit limb)
        auto accumulator_limb_2_range_constraint_0 = View(in.accumulator_high_limbs_range_constraint_0);
        auto accumulator_limb_2_range_constraint_1 = View(in.accumulator_high_limbs_range_constraint_1);
        auto accumulator_limb_2_range_constraint_2 = View(in.accumulator_high_limbs_range_constraint_2);
        auto accumulator_limb_2_range_constraint_3 = View(in.accumulator_high_limbs_range_constraint_3);
        auto accumulator_limb_2_range_constraint_4 = View(in.accumulator_high_limbs_range_constraint_4);

        // A₃ = (A₃,₃ || A₃,₂ || A₃,₁ || A₃,₀) (50-bit limb)
        auto accumulator_limb_3_range_constraint_0 = View(in.accumulator_high_limbs_range_constraint_0_shift);
        auto accumulator_limb_3_range_constraint_1 = View(in.accumulator_high_limbs_range_constraint_1_shift);
        auto accumulator_limb_3_range_constraint_2 = View(in.accumulator_high_limbs_range_constraint_2_shift);
        auto accumulator_limb_3_range_constraint_3 = View(in.accumulator_high_limbs_range_constraint_3_shift);

        auto op = View(in.op);
        auto lagrange_even_in_minicircuit = View(in.lagrange_even_in_minicircuit);
        auto not_even_or_no_op_scaled = lagrange_even_in_minicircuit * op * scaling_factor;

        // Contribution 1, accumulator lowest limb decomposition
        // clang-format off
        auto tmp_1 =
            ((accumulator_limb_0_range_constraint_0 +
              accumulator_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              accumulator_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              accumulator_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              accumulator_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             accumulators_binary_limbs_0);
        tmp_1 *= not_even_or_no_op_scaled;
        std::get<0>(accumulators) += tmp_1;

        // Contribution 2, accumulator second limb decomposition
        auto tmp_2 =
            ((accumulator_limb_1_range_constraint_0 +
              accumulator_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              accumulator_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              accumulator_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              accumulator_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             accumulators_binary_limbs_1);
        tmp_2 *= not_even_or_no_op_scaled;
        std::get<1>(accumulators) += tmp_2;

        // Contribution 3, accumulator second highest limb decomposition
        auto tmp_3 =
            ((accumulator_limb_2_range_constraint_0 +
              accumulator_limb_2_range_constraint_1 * MICRO_LIMB_SHIFT +
              accumulator_limb_2_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              accumulator_limb_2_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              accumulator_limb_2_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             accumulators_binary_limbs_2);
        tmp_3 *= not_even_or_no_op_scaled;
        std::get<2>(accumulators) += tmp_3;

        // Contribution 4, accumulator highest limb decomposition
        auto tmp_4 =
            ((accumulator_limb_3_range_constraint_0 +
              accumulator_limb_3_range_constraint_1 * MICRO_LIMB_SHIFT +
              accumulator_limb_3_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              accumulator_limb_3_range_constraint_3 * MICRO_LIMB_SHIFTx3) -
             accumulators_binary_limbs_3);
        tmp_4 *= not_even_or_no_op_scaled;
        std::get<3>(accumulators) += tmp_4;
        // clang-format on
    }();

    [&]() {
        using Accumulator = std::tuple_element_t<4, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        // Value to multiply an element by to perform an appropriate shift
        const auto LIMB_SHIFT = FF(uint256_t(1) << NUM_LIMB_BITS);

        // Values to multiply an element by to perform an appropriate shift
        const auto MICRO_LIMB_SHIFT = FF(uint256_t(1) << NUM_MICRO_LIMB_BITS);
        const auto MICRO_LIMB_SHIFTx2 = MICRO_LIMB_SHIFT * MICRO_LIMB_SHIFT;
        const auto MICRO_LIMB_SHIFTx3 = MICRO_LIMB_SHIFTx2 * MICRO_LIMB_SHIFT;
        const auto MICRO_LIMB_SHIFTx4 = MICRO_LIMB_SHIFTx3 * MICRO_LIMB_SHIFT;
        const auto MICRO_LIMB_SHIFTx5 = MICRO_LIMB_SHIFTx4 * MICRO_LIMB_SHIFT;

        auto accumulator_low_limbs_range_constraint_4 = View(in.accumulator_low_limbs_range_constraint_4);
        auto accumulator_low_limbs_range_constraint_4_shift = View(in.accumulator_low_limbs_range_constraint_4_shift);
        auto accumulator_high_limbs_range_constraint_4 = View(in.accumulator_high_limbs_range_constraint_4);

        // Shifts used to constrain ranges further
        static auto SHIFT_12_TO_14 =
            FF(4); // Shift used to range constrain the last microlimb of 68-bit limbs (standard limbs)
        static auto SHIFT_10_TO_14 =
            FF(16); // Shift used to range constrain the last microlimb of 52-bit limb (top quotient limb)
        static auto SHIFT_8_TO_14 = FF(64); // Shift used to range constrain the last microlimb of 50-bit
                                            // limbs (top limb of standard 254-bit value)
        static auto SHIFT_4_TO_14 =
            FF(1024); // Shift used to range constrain the last mircrolimb of 60-bit limbs from z scalars

        // Basic notation:
        //
        // Pₓ = (Pₓ,₃ || Pₓ,₂ || Pₓ,₁ || Pₓ,₀)
        // Pᵧ = (Pᵧ,₃ || Pᵧ,₂ || Pᵧ,₁ || Pᵧ,₀)
        // z₁ = (z₁,₁ || z₁,₀)
        // z₂ = (z₂,₁ || z₂,₀)
        // Q  = (q₃ || q₂ || q₁ || q₀)
        //
        // Each of these is further decomposed into 14-bit microlimbs as follows:
        //
        // Pₓ,₀ = (Pₓ,₀[4] || Pₓ,₀[3] || Pₓ,₀[2] || Pₓ,₀[1] || Pₓ,₀[0])
        auto p_x_limb_0 = View(in.p_x_low_limbs);
        auto p_x_limb_0_range_constraint_0 = View(in.p_x_low_limbs_range_constraint_0);
        auto p_x_limb_0_range_constraint_1 = View(in.p_x_low_limbs_range_constraint_1);
        auto p_x_limb_0_range_constraint_2 = View(in.p_x_low_limbs_range_constraint_2);
        auto p_x_limb_0_range_constraint_3 = View(in.p_x_low_limbs_range_constraint_3);
        auto p_x_limb_0_range_constraint_4 = View(in.p_x_low_limbs_range_constraint_4);

        // Pₓ,₁ = (Pₓ,₁[4] || Pₓ,₁[3] || Pₓ,₁[2] || Pₓ,₁[1] || Pₓ,₁[0])
        auto p_x_limb_1 = View(in.p_x_low_limbs_shift);
        auto p_x_limb_1_range_constraint_0 = View(in.p_x_low_limbs_range_constraint_0_shift);
        auto p_x_limb_1_range_constraint_1 = View(in.p_x_low_limbs_range_constraint_1_shift);
        auto p_x_limb_1_range_constraint_2 = View(in.p_x_low_limbs_range_constraint_2_shift);
        auto p_x_limb_1_range_constraint_3 = View(in.p_x_low_limbs_range_constraint_3_shift);
        auto p_x_limb_1_range_constraint_4 = View(in.p_x_low_limbs_range_constraint_4_shift);

        // Pₓ,₂ = (Pₓ,₂[4] || Pₓ,₂[3] || Pₓ,₂[2] || Pₓ,₂[1] || Pₓ,₂[0])
        auto p_x_limb_2 = View(in.p_x_high_limbs);
        auto p_x_limb_2_range_constraint_0 = View(in.p_x_high_limbs_range_constraint_0);
        auto p_x_limb_2_range_constraint_1 = View(in.p_x_high_limbs_range_constraint_1);
        auto p_x_limb_2_range_constraint_2 = View(in.p_x_high_limbs_range_constraint_2);
        auto p_x_limb_2_range_constraint_3 = View(in.p_x_high_limbs_range_constraint_3);
        auto p_x_limb_2_range_constraint_4 = View(in.p_x_high_limbs_range_constraint_4);

        // Pₓ,₃ = (Pₓ,₃[4] || Pₓ,₃[3] || Pₓ,₃[2] || Pₓ,₃[1] || Pₓ,₃[0])
        auto p_x_limb_3 = View(in.p_x_high_limbs_shift);
        auto p_x_limb_3_range_constraint_0 = View(in.p_x_high_limbs_range_constraint_0_shift);
        auto p_x_limb_3_range_constraint_1 = View(in.p_x_high_limbs_range_constraint_1_shift);
        auto p_x_limb_3_range_constraint_2 = View(in.p_x_high_limbs_range_constraint_2_shift);
        auto p_x_limb_3_range_constraint_3 = View(in.p_x_high_limbs_range_constraint_3_shift);

        // Pᵧ,₀ = (Pᵧ,₀[4] || Pᵧ,₀[3] || Pᵧ,₀[2] || Pᵧ,₀[1] || Pᵧ,₀[0])
        auto p_y_limb_0 = View(in.p_y_low_limbs);
        auto p_y_limb_0_range_constraint_0 = View(in.p_y_low_limbs_range_constraint_0);
        auto p_y_limb_0_range_constraint_1 = View(in.p_y_low_limbs_range_constraint_1);
        auto p_y_limb_0_range_constraint_2 = View(in.p_y_low_limbs_range_constraint_2);
        auto p_y_limb_0_range_constraint_3 = View(in.p_y_low_limbs_range_constraint_3);
        auto p_y_limb_0_range_constraint_4 = View(in.p_y_low_limbs_range_constraint_4);

        // Pᵧ,₁ = (Pᵧ,₁[4] || Pᵧ,₁[3] || Pᵧ,₁[2] || Pᵧ,₁[1] || Pᵧ,₁[0])
        auto p_y_limb_1 = View(in.p_y_low_limbs_shift);
        auto p_y_limb_1_range_constraint_0 = View(in.p_y_low_limbs_range_constraint_0_shift);
        auto p_y_limb_1_range_constraint_1 = View(in.p_y_low_limbs_range_constraint_1_shift);
        auto p_y_limb_1_range_constraint_2 = View(in.p_y_low_limbs_range_constraint_2_shift);
        auto p_y_limb_1_range_constraint_3 = View(in.p_y_low_limbs_range_constraint_3_shift);
        auto p_y_limb_1_range_constraint_4 = View(in.p_y_low_limbs_range_constraint_4_shift);

        // Pᵧ,₂ = (Pᵧ,₂[4] || Pᵧ,₂[3] || Pᵧ,₂[2] || Pᵧ,₂[1] || Pᵧ,₂[0])
        auto p_y_limb_2 = View(in.p_y_high_limbs);
        auto p_y_limb_2_range_constraint_0 = View(in.p_y_high_limbs_range_constraint_0);
        auto p_y_limb_2_range_constraint_1 = View(in.p_y_high_limbs_range_constraint_1);
        auto p_y_limb_2_range_constraint_2 = View(in.p_y_high_limbs_range_constraint_2);
        auto p_y_limb_2_range_constraint_3 = View(in.p_y_high_limbs_range_constraint_3);
        auto p_y_limb_2_range_constraint_4 = View(in.p_y_high_limbs_range_constraint_4);

        // Pᵧ,₃ = (Pᵧ,₃[3] || Pᵧ,₃[2] || Pᵧ,₃[1] || Pᵧ,₃[0])
        auto p_y_limb_3 = View(in.p_y_high_limbs_shift);
        auto p_y_limb_3_range_constraint_0 = View(in.p_y_high_limbs_range_constraint_0_shift);
        auto p_y_limb_3_range_constraint_1 = View(in.p_y_high_limbs_range_constraint_1_shift);
        auto p_y_limb_3_range_constraint_2 = View(in.p_y_high_limbs_range_constraint_2_shift);
        auto p_y_limb_3_range_constraint_3 = View(in.p_y_high_limbs_range_constraint_3_shift);

        // z₁,₀ = (z₁,₀[4] || z₁,₀[3] || z₁,₀[2] || z₁,₀[1] || z₁,₀[0])
        auto z_1_limb_0 = View(in.z_low_limbs);
        auto z_1_limb_0_range_constraint_0 = View(in.z_low_limbs_range_constraint_0);
        auto z_1_limb_0_range_constraint_1 = View(in.z_low_limbs_range_constraint_1);
        auto z_1_limb_0_range_constraint_2 = View(in.z_low_limbs_range_constraint_2);
        auto z_1_limb_0_range_constraint_3 = View(in.z_low_limbs_range_constraint_3);
        auto z_1_limb_0_range_constraint_4 = View(in.z_low_limbs_range_constraint_4);

        // z₂,₀ = (z₂,₀[4] || z₂,₀[3] || z₂,₀[2] || z₂,₀[1] || z₂,₀[0])
        auto z_2_limb_0 = View(in.z_low_limbs_shift);
        auto z_2_limb_0_range_constraint_0 = View(in.z_low_limbs_range_constraint_0_shift);
        auto z_2_limb_0_range_constraint_1 = View(in.z_low_limbs_range_constraint_1_shift);
        auto z_2_limb_0_range_constraint_2 = View(in.z_low_limbs_range_constraint_2_shift);
        auto z_2_limb_0_range_constraint_3 = View(in.z_low_limbs_range_constraint_3_shift);
        auto z_2_limb_0_range_constraint_4 = View(in.z_low_limbs_range_constraint_4_shift);

        // z₁,₁ = (z₁,₁[4] || z₁,₁[3] || z₁,₁[2] || z₁,₁[1] || z₁,₁[0])
        auto z_1_limb_1 = View(in.z_high_limbs);
        auto z_1_limb_1_range_constraint_0 = View(in.z_high_limbs_range_constraint_0);
        auto z_1_limb_1_range_constraint_1 = View(in.z_high_limbs_range_constraint_1);
        auto z_1_limb_1_range_constraint_2 = View(in.z_high_limbs_range_constraint_2);
        auto z_1_limb_1_range_constraint_3 = View(in.z_high_limbs_range_constraint_3);
        auto z_1_limb_1_range_constraint_4 = View(in.z_high_limbs_range_constraint_4);

        // z₂,₁ = (z₂,₁[4] || z₂,₁[3] || z₂,₁[2] || z₂,₁[1] || z₂,₁[0])
        auto z_2_limb_1 = View(in.z_high_limbs_shift);
        auto z_2_limb_1_range_constraint_0 = View(in.z_high_limbs_range_constraint_0_shift);
        auto z_2_limb_1_range_constraint_1 = View(in.z_high_limbs_range_constraint_1_shift);
        auto z_2_limb_1_range_constraint_2 = View(in.z_high_limbs_range_constraint_2_shift);
        auto z_2_limb_1_range_constraint_3 = View(in.z_high_limbs_range_constraint_3_shift);
        auto z_2_limb_1_range_constraint_4 = View(in.z_high_limbs_range_constraint_4_shift);

        // Q₀ = (Q₀[4] || Q₀[3] || Q₀[2] || Q₀[1] || Q₀[0])
        auto quotient_binary_limbs_0 = View(in.quotient_low_binary_limbs);
        auto quotient_limb_0_range_constraint_0 = View(in.quotient_low_limbs_range_constraint_0);
        auto quotient_limb_0_range_constraint_1 = View(in.quotient_low_limbs_range_constraint_1);
        auto quotient_limb_0_range_constraint_2 = View(in.quotient_low_limbs_range_constraint_2);
        auto quotient_limb_0_range_constraint_3 = View(in.quotient_low_limbs_range_constraint_3);
        auto quotient_limb_0_range_constraint_4 = View(in.quotient_low_limbs_range_constraint_4);

        // Q₁ = (Q₁[4] || Q₁[3] || Q₁[2] || Q₁[1] || Q₁[0])
        auto quotient_binary_limbs_1 = View(in.quotient_low_binary_limbs_shift);
        auto quotient_limb_1_range_constraint_0 = View(in.quotient_low_limbs_range_constraint_0_shift);
        auto quotient_limb_1_range_constraint_1 = View(in.quotient_low_limbs_range_constraint_1_shift);
        auto quotient_limb_1_range_constraint_2 = View(in.quotient_low_limbs_range_constraint_2_shift);
        auto quotient_limb_1_range_constraint_3 = View(in.quotient_low_limbs_range_constraint_3_shift);
        auto quotient_limb_1_range_constraint_4 = View(in.quotient_low_limbs_range_constraint_4_shift);

        // Q₂ = (Q₂[4] || Q₂[3] || Q₂[2] || Q₂[1] || Q₂[0])
        auto quotient_binary_limbs_2 = View(in.quotient_high_binary_limbs);
        auto quotient_limb_2_range_constraint_0 = View(in.quotient_high_limbs_range_constraint_0);
        auto quotient_limb_2_range_constraint_1 = View(in.quotient_high_limbs_range_constraint_1);
        auto quotient_limb_2_range_constraint_2 = View(in.quotient_high_limbs_range_constraint_2);
        auto quotient_limb_2_range_constraint_3 = View(in.quotient_high_limbs_range_constraint_3);
        auto quotient_limb_2_range_constraint_4 = View(in.quotient_high_limbs_range_constraint_4);

        // Q₃ = (Q₃[3] || Q₃[2] || Q₃[1] || Q₃[0])
        auto quotient_binary_limbs_3 = View(in.quotient_high_binary_limbs_shift);
        auto quotient_limb_3_range_constraint_0 = View(in.quotient_high_limbs_range_constraint_0_shift);
        auto quotient_limb_3_range_constraint_1 = View(in.quotient_high_limbs_range_constraint_1_shift);
        auto quotient_limb_3_range_constraint_2 = View(in.quotient_high_limbs_range_constraint_2_shift);
        auto quotient_limb_3_range_constraint_3 = View(in.quotient_high_limbs_range_constraint_3_shift);

        // Carry limbs: relation_wide_limbs_lo (84 bits)
        // cₗₒ = (cₗₒ[5] || cₗₒ[4] || cₗₒ[3] || cₗₒ[2] || cₗₒ[1] || cₗₒ[0])
        auto relation_wide_limbs_lo = View(in.relation_wide_limbs);
        auto relation_wide_limbs_lo_range_constraint_0 = View(in.relation_wide_limbs_range_constraint_0);
        auto relation_wide_limbs_lo_range_constraint_1 = View(in.relation_wide_limbs_range_constraint_1);
        auto relation_wide_limbs_lo_range_constraint_2 = View(in.relation_wide_limbs_range_constraint_2);
        auto relation_wide_limbs_lo_range_constraint_3 = View(in.relation_wide_limbs_range_constraint_3);

        // The final two limbs of cₗₒ are stored in the unused tail columns of pₓ and accumulator.
        auto relation_wide_limbs_lo_range_constraint_4 = View(in.p_x_high_limbs_range_constraint_tail_shift);
        auto relation_wide_limbs_lo_range_constraint_5 = View(in.accumulator_high_limbs_range_constraint_tail_shift);

        // Carry limbs: relation_wide_limbs_hi (84 bits)
        // cₕᵢ = (cₕᵢ[5] || cₕᵢ[4] || cₕᵢ[3] || cₕᵢ[2] || cₕᵢ[1] || cₕᵢ[0])
        auto relation_wide_limbs_hi = View(in.relation_wide_limbs_shift);
        auto relation_wide_limbs_hi_range_constraint_0 = View(in.relation_wide_limbs_range_constraint_0_shift);
        auto relation_wide_limbs_hi_range_constraint_1 = View(in.relation_wide_limbs_range_constraint_1_shift);
        auto relation_wide_limbs_hi_range_constraint_2 = View(in.relation_wide_limbs_range_constraint_2_shift);
        auto relation_wide_limbs_hi_range_constraint_3 = View(in.relation_wide_limbs_range_constraint_3_shift);

        // The final two limbs of cₕᵢ are stored in the unused tail columns of pᵧ and quotient.
        auto relation_wide_limbs_hi_range_constraint_4 = View(in.p_y_high_limbs_range_constraint_tail_shift);
        auto relation_wide_limbs_hi_range_constraint_5 = View(in.quotient_high_limbs_range_constraint_tail_shift);

        // Additional tail microlimbs for tighter range constraints
        // ==> [Pₓ,₀[tail], Pₓ,₁[tail], Pₓ,₂[tail], Pₓ,₃[tail]]
        auto p_x_limb_0_range_constraint_tail = View(in.p_x_low_limbs_range_constraint_tail);
        auto p_x_limb_1_range_constraint_tail = View(in.p_x_low_limbs_range_constraint_tail_shift);
        auto p_x_limb_2_range_constraint_tail = View(in.p_x_high_limbs_range_constraint_tail);

        // Pₓ,₃[tail] is stored in the unused (odd) column of Pₓ,₃[4].
        auto p_x_limb_3_range_constraint_tail = View(in.p_x_high_limbs_range_constraint_4_shift);

        // ==> [Pᵧ,₀[tail], Pᵧ,₁[tail], Pᵧ,₂[tail], Pᵧ,₃[tail]]
        auto p_y_limb_0_range_constraint_tail = View(in.p_y_low_limbs_range_constraint_tail);
        auto p_y_limb_1_range_constraint_tail = View(in.p_y_low_limbs_range_constraint_tail_shift);
        auto p_y_limb_2_range_constraint_tail = View(in.p_y_high_limbs_range_constraint_tail);

        // Pᵧ,₃[tail] is stored in the unused (odd) column of Pᵧ,₃[4].
        auto p_y_limb_3_range_constraint_tail = View(in.p_y_high_limbs_range_constraint_4_shift);

        // ==> [z₁,₀[tail], z₂,₀[tail], z₁,₁[tail], z₂,₁[tail]]
        auto z_1_limb_0_range_constraint_tail = View(in.z_low_limbs_range_constraint_tail);
        auto z_2_limb_0_range_constraint_tail = View(in.z_low_limbs_range_constraint_tail_shift);
        auto z_1_limb_1_range_constraint_tail = View(in.z_high_limbs_range_constraint_tail);
        auto z_2_limb_1_range_constraint_tail = View(in.z_high_limbs_range_constraint_tail_shift);

        // Accumulator and quotient tail microlimbs for tighter range constraints
        // ==> [A₀[tail], A₁[tail], A₂[tail], A₃[tail]]
        auto accumulator_limb_0_range_constraint_tail = View(in.accumulator_low_limbs_range_constraint_tail);
        auto accumulator_limb_1_range_constraint_tail = View(in.accumulator_low_limbs_range_constraint_tail_shift);
        auto accumulator_limb_2_range_constraint_tail = View(in.accumulator_high_limbs_range_constraint_tail);

        // Fetch the highest microlimb of A₃ for range constraint
        // To get A₃[tail]], we fetch the unused (odd) column of A₃[3].
        auto accumulator_limb_3_range_constraint_3 = View(in.accumulator_high_limbs_range_constraint_3_shift);
        auto accumulator_limb_3_range_constraint_tail = View(in.accumulator_high_limbs_range_constraint_4_shift);

        // ==> [Q₀[tail], Q₁[tail], Q₂[tail], Q₃[tail]]
        // To get Q₃[tail], we fetch the unused (odd) column of Q₃[3].
        auto quotient_limb_0_range_constraint_tail = View(in.quotient_low_limbs_range_constraint_tail);
        auto quotient_limb_1_range_constraint_tail = View(in.quotient_low_limbs_range_constraint_tail_shift);
        auto quotient_limb_2_range_constraint_tail = View(in.quotient_high_limbs_range_constraint_tail);
        auto quotient_limb_3_range_constraint_tail = View(in.quotient_high_limbs_range_constraint_4_shift);

        // Coordinate decompositions
        // first column: [x_lo, y_hi]
        // second column: [x_hi, z_1]
        // third column: [y_lo, z_2]
        auto x_lo = View(in.x_lo_y_hi);
        auto y_hi = View(in.x_lo_y_hi_shift);
        auto x_hi = View(in.x_hi_z_1);
        auto z_one = View(in.x_hi_z_1_shift);
        auto y_lo = View(in.y_lo_z_2);
        auto z_two = View(in.y_lo_z_2_shift);
        auto lagrange_even_in_minicircuit = View(in.lagrange_even_in_minicircuit);

        // clang-format off
        // Contribution 5 , Pᵧ,₀ limb decomposition
        auto tmp_5 =
            ((p_y_limb_0_range_constraint_0 +
              p_y_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_y_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_y_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_y_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_y_limb_0);
        tmp_5 *= lagrange_even_in_minicircuit;
        tmp_5 *= scaling_factor;
        std::get<4>(accumulators) += tmp_5;

        // Contribution 6 , Pᵧ,₁ limb decomposition
        auto tmp_6 =
            ((p_y_limb_1_range_constraint_0 +
              p_y_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_y_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_y_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_y_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_y_limb_1);
        tmp_6 *= lagrange_even_in_minicircuit;
        tmp_6 *= scaling_factor;
        std::get<5>(accumulators) += tmp_6;

        // Contribution 7 , Pᵧ,₂ limb decomposition
        auto tmp_7 =
            ((p_y_limb_2_range_constraint_0 +
              p_y_limb_2_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_y_limb_2_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_y_limb_2_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_y_limb_2_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_y_limb_2);
        tmp_7 *= lagrange_even_in_minicircuit;
        tmp_7 *= scaling_factor;
        std::get<6>(accumulators) += tmp_7;

        // Contribution 8 , Pᵧ,₃ limb decomposition
        auto tmp_8 =
            ((p_y_limb_3_range_constraint_0 +
              p_y_limb_3_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_y_limb_3_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_y_limb_3_range_constraint_3 * MICRO_LIMB_SHIFTx3) -
             p_y_limb_3);
        tmp_8 *= lagrange_even_in_minicircuit;
        tmp_8 *= scaling_factor;
        std::get<7>(accumulators) += tmp_8;

        // Contribution 9 , z₁,₀ limb decomposition
        auto tmp_9 =
            ((z_1_limb_0_range_constraint_0 +
              z_1_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              z_1_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              z_1_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              z_1_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             z_1_limb_0);
        tmp_9 *= lagrange_even_in_minicircuit;
        tmp_9 *= scaling_factor;
        std::get<8>(accumulators) += tmp_9;

        // Contribution 10 , z₂,₀ limb decomposition
        auto tmp_10 =
            ((z_2_limb_0_range_constraint_0 +
              z_2_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              z_2_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              z_2_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              z_2_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             z_2_limb_0);
        tmp_10 *= lagrange_even_in_minicircuit;
        tmp_10 *= scaling_factor;
        std::get<9>(accumulators) += tmp_10;

        // Contribution 11 , z₁,₁ limb decomposition
        auto tmp_11 =
            ((z_1_limb_1_range_constraint_0 +
              z_1_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              z_1_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              z_1_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              z_1_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             z_1_limb_1);
        tmp_11 *= lagrange_even_in_minicircuit;
        tmp_11 *= scaling_factor;
        std::get<10>(accumulators) += tmp_11;

        // Contribution 12 , z₂,₁ limb decomposition
        auto tmp_12 =
            ((z_2_limb_1_range_constraint_0 +
              z_2_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              z_2_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              z_2_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              z_2_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             z_2_limb_1);
        tmp_12 *= lagrange_even_in_minicircuit;
        tmp_12 *= scaling_factor;
        std::get<11>(accumulators) += tmp_12;

        // Contributions that decompose 50, 52, 68 or 84 bit limbs used for computation into range-constrained chunks
        // Contribution 13, Pₓ,₀ limb decomposition
        auto tmp_13 =
            ((p_x_limb_0_range_constraint_0 +
              p_x_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_x_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_x_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_x_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_x_limb_0);
        tmp_13 *= lagrange_even_in_minicircuit;
        tmp_13 *= scaling_factor;
        std::get<12>(accumulators) += tmp_13;

        // Contribution 14 , Pₓ,₁ limb decomposition
        auto tmp_14 =
            ((p_x_limb_1_range_constraint_0 +
              p_x_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_x_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_x_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_x_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_x_limb_1);
        tmp_14 *= lagrange_even_in_minicircuit;
        tmp_14 *= scaling_factor;
        std::get<13>(accumulators) += tmp_14;

        // Contribution 15 , Pₓ,₂ limb decomposition
        auto tmp_15 =
            ((p_x_limb_2_range_constraint_0 +
              p_x_limb_2_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_x_limb_2_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_x_limb_2_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_x_limb_2_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_x_limb_2);
        tmp_15 *= lagrange_even_in_minicircuit;
        tmp_15 *= scaling_factor;
        std::get<14>(accumulators) += tmp_15;

        // Contribution 16 , Pₓ,₃ limb decomposition
        auto tmp_16 =
            ((p_x_limb_3_range_constraint_0 +
              p_x_limb_3_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_x_limb_3_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_x_limb_3_range_constraint_3 * MICRO_LIMB_SHIFTx3) -
             p_x_limb_3);
        tmp_16 *= lagrange_even_in_minicircuit;
        tmp_16 *= scaling_factor;
        std::get<15>(accumulators) += tmp_16;

        // Contribution 17 , Q₀ limb decomposition
        auto tmp_17 =
            ((quotient_limb_0_range_constraint_0 +
              quotient_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              quotient_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              quotient_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              quotient_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             quotient_binary_limbs_0);
        tmp_17 *= lagrange_even_in_minicircuit;
        tmp_17 *= scaling_factor;
        std::get<16>(accumulators) += tmp_17;

        // Contribution 18 , Q₁ limb decomposition
        auto tmp_18 =
            ((quotient_limb_1_range_constraint_0 +
              quotient_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              quotient_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              quotient_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              quotient_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             quotient_binary_limbs_1);
        tmp_18 *= lagrange_even_in_minicircuit;
        tmp_18 *= scaling_factor;
        std::get<17>(accumulators) += tmp_18;

        // Contribution 19 , Q₂ limb decomposition
        auto tmp_19 =
            ((quotient_limb_2_range_constraint_0 +
              quotient_limb_2_range_constraint_1 * MICRO_LIMB_SHIFT +
              quotient_limb_2_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              quotient_limb_2_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              quotient_limb_2_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             quotient_binary_limbs_2);
        tmp_19 *= lagrange_even_in_minicircuit;
        tmp_19 *= scaling_factor;
        std::get<18>(accumulators) += tmp_19;

        // Contribution 20 , Q₃ limb decomposition
        auto tmp_20 =
            ((quotient_limb_3_range_constraint_0 +
              quotient_limb_3_range_constraint_1 * MICRO_LIMB_SHIFT +
              quotient_limb_3_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              quotient_limb_3_range_constraint_3 * MICRO_LIMB_SHIFTx3) -
             quotient_binary_limbs_3);
        tmp_20 *= lagrange_even_in_minicircuit;
        tmp_20 *= scaling_factor;
        std::get<19>(accumulators) += tmp_20;

        // Contribution 21 , decomposition of the low wide relation limb used for the bigfield relation.
        // N.B. top microlimbs of relation wide limbs are stored in microlimbs for range constraints of P_x, P_y,
        // accumulator and quotient. This is to save space and because these microlimbs are not used by their namesakes,
        // since top limbs in 254/6-bit values use one less microlimb for the top 50/52-bit limb
        auto tmp_21 =
            ((relation_wide_limbs_lo_range_constraint_0 +
              relation_wide_limbs_lo_range_constraint_1 * MICRO_LIMB_SHIFT +
              relation_wide_limbs_lo_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              relation_wide_limbs_lo_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              relation_wide_limbs_lo_range_constraint_4 * MICRO_LIMB_SHIFTx4 +
              relation_wide_limbs_lo_range_constraint_5 * MICRO_LIMB_SHIFTx5) -
             relation_wide_limbs_lo);
        tmp_21 *= lagrange_even_in_minicircuit;
        tmp_21 *= scaling_factor;
        std::get<20>(accumulators) += tmp_21;

        // Contribution 22 , decomposition of high relation limb
        auto tmp_22 =
            ((relation_wide_limbs_hi_range_constraint_0 +
              relation_wide_limbs_hi_range_constraint_1 * MICRO_LIMB_SHIFT +
              relation_wide_limbs_hi_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              relation_wide_limbs_hi_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              relation_wide_limbs_hi_range_constraint_4 * MICRO_LIMB_SHIFTx4 +
              relation_wide_limbs_hi_range_constraint_5 * MICRO_LIMB_SHIFTx5) -
             relation_wide_limbs_hi);
        tmp_22 *= lagrange_even_in_minicircuit;
        tmp_22 *= scaling_factor;
        std::get<21>(accumulators) += tmp_22;

        // Contributions enfocing a reduced range constraint on high limbs (these relation force the last microlimb in
        // each limb to be more severely range constrained)

        // Contribution 23, range constrain the highest microlimb of lowest P.x limb to be 12 bits (68 % 14 = 12)
        auto tmp_23 = p_x_limb_0_range_constraint_4 * SHIFT_12_TO_14 - p_x_limb_0_range_constraint_tail;
        tmp_23 *= lagrange_even_in_minicircuit;
        tmp_23 *= scaling_factor;
        std::get<22>(accumulators) += tmp_23;

        // Contribution 24, range constrain the highest microlimb of second lowest P.x limb to be 12 bits
        auto tmp_24 = p_x_limb_1_range_constraint_4 * SHIFT_12_TO_14 - p_x_limb_1_range_constraint_tail;
        tmp_24 *= lagrange_even_in_minicircuit;
        tmp_24 *= scaling_factor;
        std::get<23>(accumulators) += tmp_24;

        // Contribution 25, range constrain the highest microlimb of second highest P.x limb to be 12 bits
        auto tmp_25 = p_x_limb_2_range_constraint_4 * SHIFT_12_TO_14 - p_x_limb_2_range_constraint_tail;
        tmp_25 *= lagrange_even_in_minicircuit;
        tmp_25 *= scaling_factor;
        std::get<24>(accumulators) += tmp_25;

        // Contribution 26, range constrain the highest microilmb of highest P.x limb to be 8 bits (50 % 14 = 8)
        auto tmp_26 = p_x_limb_3_range_constraint_3 * SHIFT_8_TO_14 - p_x_limb_3_range_constraint_tail;

        tmp_26 *= lagrange_even_in_minicircuit;
        tmp_26 *= scaling_factor;
        std::get<25>(accumulators) += tmp_26;

        // Contribution 27, range constrain the highest microlimb of lowest P.y limb to be 12 bits (68 % 14 = 12)
        auto tmp_27 = p_y_limb_0_range_constraint_4 * SHIFT_12_TO_14 - p_y_limb_0_range_constraint_tail;
        tmp_27 *= lagrange_even_in_minicircuit;
        tmp_27 *= scaling_factor;
        std::get<26>(accumulators) += tmp_27;

        // Contribution 28, range constrain the highest microlimb of second lowest P.y limb to be 12 bits (68 % 14 = 12)
        auto tmp_28 =
            p_y_limb_1_range_constraint_4 * SHIFT_12_TO_14 - p_y_limb_1_range_constraint_tail;
        tmp_28 *= lagrange_even_in_minicircuit;
        tmp_28 *= scaling_factor;
        std::get<27>(accumulators) += tmp_28;

        // Contribution 29, range constrain the highest microlimb of second highest P.y limb to be 12 bits (68 % 14 =
        // 12)
        auto tmp_29 = p_y_limb_2_range_constraint_4 * SHIFT_12_TO_14 - p_y_limb_2_range_constraint_tail;
        tmp_29 *= lagrange_even_in_minicircuit;
        tmp_29 *= scaling_factor;
        std::get<28>(accumulators) += tmp_29;

        // Contribution 30, range constrain the highest microlimb of highest P.y limb to be 8 bits (50 % 14 = 8)
        auto tmp_30 = p_y_limb_3_range_constraint_3 * SHIFT_8_TO_14 - p_y_limb_3_range_constraint_tail;

        tmp_30 *= lagrange_even_in_minicircuit;
        tmp_30 *= scaling_factor;
        std::get<29>(accumulators) += tmp_30;

        // Contribution 31, range constrain the highest microlimb of low z1 limb to be 12 bits (68 % 14 = 12)
        auto tmp_31 = (z_1_limb_0_range_constraint_4 * SHIFT_12_TO_14 - z_1_limb_0_range_constraint_tail);
        tmp_31 *= lagrange_even_in_minicircuit;
        tmp_31 *= scaling_factor;
        std::get<30>(accumulators) += tmp_31;

        // Contribution 32, range constrain the highest microlimb of low z2 limb to be 12 bits (68 % 14 = 12)
        auto tmp_32 = (z_2_limb_0_range_constraint_4 * SHIFT_12_TO_14 - z_2_limb_0_range_constraint_tail);
        tmp_32 *= lagrange_even_in_minicircuit;
        tmp_32 *= scaling_factor;
        std::get<31>(accumulators) += tmp_32;

        // Contribution 33, range constrain the highest microlimb of high z1 limb to be 4 bits (60 % 14 = 12)
        auto tmp_33 = (z_1_limb_1_range_constraint_4 * SHIFT_4_TO_14 - z_1_limb_1_range_constraint_tail);
        tmp_33 *= lagrange_even_in_minicircuit;
        tmp_33 *= scaling_factor;
        std::get<32>(accumulators) += tmp_33;

        // Contribution 34, range constrain the highest microlimb of high z2 limb to be 4 bits (60 % 14 = 12)
        auto tmp_34 = z_2_limb_1_range_constraint_4 * SHIFT_4_TO_14 - z_2_limb_1_range_constraint_tail;
        tmp_34 *= lagrange_even_in_minicircuit;
        tmp_34 *= scaling_factor;
        std::get<33>(accumulators) += tmp_34;

        // Contribution 35, range constrain the highest microlimb of lowest current accumulator limb to be 12 bits (68 %
        // 14 = 12)
        auto tmp_35 = accumulator_low_limbs_range_constraint_4 * SHIFT_12_TO_14 - accumulator_limb_0_range_constraint_tail;
        tmp_35 *= lagrange_even_in_minicircuit;
        tmp_35 *= scaling_factor;
        std::get<34>(accumulators) += tmp_35;

        // Contribution 36, range constrain the highest microlimb of second lowest current accumulator limb to be 12
        // bits (68 % 14 = 12)
        auto tmp_36 = (accumulator_low_limbs_range_constraint_4_shift * SHIFT_12_TO_14 -
                       accumulator_limb_1_range_constraint_tail);
        tmp_36 *= lagrange_even_in_minicircuit;
        tmp_36 *= scaling_factor;
        std::get<35>(accumulators) += tmp_36;

        // Contribution 37, range constrain the highest microlimb of second highest current accumulator limb to be 12
        // bits (68 % 14 = 12)
        auto tmp_37 =
            (accumulator_high_limbs_range_constraint_4 * SHIFT_12_TO_14 - accumulator_limb_2_range_constraint_tail);
        tmp_37 *= lagrange_even_in_minicircuit;
        tmp_37 *= scaling_factor;
        std::get<36>(accumulators) += tmp_37;

        // Contribution 38, range constrain the highest microlimb of highest current accumulator limb to be 8 bits (50 %
        // 14 = 12)
        auto tmp_38 = (accumulator_limb_3_range_constraint_3 * SHIFT_8_TO_14 - accumulator_limb_3_range_constraint_tail);
        tmp_38 *= lagrange_even_in_minicircuit;
        tmp_38 *= scaling_factor;
        std::get<37>(accumulators) += tmp_38;

        // Contribution 39, range constrain the highest microlimb of lowest quotient limb to be 12 bits (68 % 14 = 12)
        auto tmp_39 =
            (quotient_limb_0_range_constraint_4 * SHIFT_12_TO_14 - quotient_limb_0_range_constraint_tail);
        tmp_39 *= lagrange_even_in_minicircuit;
        tmp_39 *= scaling_factor;
        std::get<38>(accumulators) += tmp_39;

        // Contribution 40, range constrain the highest microlimb of second lowest quotient limb to be 12 bits (68 % 14
        // = 12)
        auto tmp_40 = (quotient_limb_1_range_constraint_4 * SHIFT_12_TO_14 - quotient_limb_1_range_constraint_tail);
        tmp_40 *= lagrange_even_in_minicircuit;
        tmp_40 *= scaling_factor;
        std::get<39>(accumulators) += tmp_40;

        // Contribution 41, range constrain the highest microlimb of second highest quotient limb to be 12 bits (68 % 14
        // = 12)
        auto tmp_41 =
            (quotient_limb_2_range_constraint_4 * SHIFT_12_TO_14 - quotient_limb_2_range_constraint_tail);
        tmp_41 *= lagrange_even_in_minicircuit;
        tmp_41 *= scaling_factor;
        std::get<40>(accumulators) += tmp_41;

        // Contribution 42, range constrain the highest microlimb of highest quotient limb to be 10 bits (52 % 14 = 12)
        auto tmp_42 = (quotient_limb_3_range_constraint_3 * SHIFT_10_TO_14 - quotient_limb_3_range_constraint_tail);
        tmp_42 *= lagrange_even_in_minicircuit;
        tmp_42 *= scaling_factor;
        std::get<41>(accumulators) += tmp_42;

        // Contributions where we decompose initial EccOpQueue values into 68-bit limbs

        // Contribution 43, decompose x_lo
        auto tmp_43 = (p_x_limb_0 + p_x_limb_1 * LIMB_SHIFT) - x_lo;
        tmp_43 *= lagrange_even_in_minicircuit;
        tmp_43 *= scaling_factor;
        std::get<42>(accumulators) += tmp_43;

        // Contribution 44, decompose x_hi
        auto tmp_44 = (p_x_limb_2 + p_x_limb_3 * LIMB_SHIFT) - x_hi;
        tmp_44 *= lagrange_even_in_minicircuit;
        tmp_44 *= scaling_factor;
        std::get<43>(accumulators) += tmp_44;
        // Contribution 45, decompose y_lo
        auto tmp_45 = (p_y_limb_0 + p_y_limb_1 * LIMB_SHIFT) - y_lo;
        tmp_45 *= lagrange_even_in_minicircuit;
        tmp_45 *= scaling_factor;
        std::get<44>(accumulators) += tmp_45;

        // Contribution 46, decompose y_hi
        auto tmp_46 = (p_y_limb_2 + p_y_limb_3 * LIMB_SHIFT) - y_hi;
        tmp_46 *= lagrange_even_in_minicircuit;
        tmp_46 *= scaling_factor;
        std::get<45>(accumulators) += tmp_46;

        // Contribution 47, decompose z1
        auto tmp_47 = (z_1_limb_0 + z_1_limb_1 * LIMB_SHIFT) - z_one;
        tmp_47 *= lagrange_even_in_minicircuit;
        tmp_47 *= scaling_factor;
        std::get<46>(accumulators) += tmp_47;

        // Contribution 48, decompose z2
        auto tmp_48 = (z_2_limb_0 + z_2_limb_1 * LIMB_SHIFT) - z_two;
        tmp_48 *= lagrange_even_in_minicircuit;
        tmp_48 *= scaling_factor;
        std::get<47>(accumulators) += tmp_48;
    }();
};
} // namespace bb
