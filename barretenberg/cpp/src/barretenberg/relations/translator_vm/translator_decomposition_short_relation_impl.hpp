// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/translator_vm/translator_decomposition_short_relation.hpp"

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
void TranslatorDecompositionShortRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                              const AllEntities& in,
                                                              const Parameters&,
                                                              const FF& scaling_factor)
{
    static constexpr size_t NUM_LIMB_BITS = 68;       // Number of bits in a standard limb used for bigfield operations
    static constexpr size_t NUM_MICRO_LIMB_BITS = 14; // Number of bits in a standard limb used for bigfield operations

    // Values to multiply an element by to perform an appropriate shift
    const auto MICRO_LIMB_SHIFT = FF(uint256_t(1) << NUM_MICRO_LIMB_BITS);
    const auto MICRO_LIMB_SHIFTx2 = MICRO_LIMB_SHIFT * MICRO_LIMB_SHIFT;
    const auto MICRO_LIMB_SHIFTx3 = MICRO_LIMB_SHIFTx2 * MICRO_LIMB_SHIFT;
    const auto MICRO_LIMB_SHIFTx4 = MICRO_LIMB_SHIFTx3 * MICRO_LIMB_SHIFT;
    const auto MICRO_LIMB_SHIFTx5 = MICRO_LIMB_SHIFTx4 * MICRO_LIMB_SHIFT;

    [&]() {
        // Within the no-op range i.e. when the op polynomial is 0 at even index the 2 Translator trace rows are empty
        // except for the accumulator binary limbs which get transferred across the no-op range
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using View = TranslatorShortMonomialView<Accumulator>;

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
        auto not_even_or_no_op_scaled = Accumulator(lagrange_even_in_minicircuit * (op * scaling_factor));

        // Contribution 1, accumulator lowest limb decomposition
        // clang-format off
        auto tmp_1 =
            ((accumulator_limb_0_range_constraint_0 +
              accumulator_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              accumulator_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              accumulator_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              accumulator_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             accumulators_binary_limbs_0);
        std::get<0>(accumulators) += Accumulator(tmp_1) * not_even_or_no_op_scaled;

        // Contribution 2, accumulator second limb decomposition
        auto tmp_2 =
            ((accumulator_limb_1_range_constraint_0 +
              accumulator_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              accumulator_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              accumulator_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              accumulator_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             accumulators_binary_limbs_1);
        std::get<1>(accumulators) += Accumulator(tmp_2) * not_even_or_no_op_scaled;

        // Contribution 3, accumulator second highest limb decomposition
        auto tmp_3 =
            ((accumulator_limb_2_range_constraint_0 +
              accumulator_limb_2_range_constraint_1 * MICRO_LIMB_SHIFT +
              accumulator_limb_2_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              accumulator_limb_2_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              accumulator_limb_2_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             accumulators_binary_limbs_2);
        std::get<2>(accumulators) += Accumulator(tmp_3) * not_even_or_no_op_scaled;

        // Contribution 4, accumulator highest limb decomposition
        auto tmp_4 =
            ((accumulator_limb_3_range_constraint_0 +
              accumulator_limb_3_range_constraint_1 * MICRO_LIMB_SHIFT +
              accumulator_limb_3_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              accumulator_limb_3_range_constraint_3 * MICRO_LIMB_SHIFTx3) -
             accumulators_binary_limbs_3);
        std::get<3>(accumulators) += Accumulator(tmp_4) * not_even_or_no_op_scaled;
        // clang-format on
    }();

    [&]() {
        using Accumulator = std::tuple_element_t<4, ContainerOverSubrelations>;
        using View = TranslatorShortMonomialView<Accumulator>;

        // Value to multiply an element by to perform an appropriate shift
        const auto LIMB_SHIFT = FF(uint256_t(1) << NUM_LIMB_BITS);

        // Top limbs of accumulator
        // [A₀,₄, A₁,₄, A₂,₄] (these are 50-bit limbs)
        auto accumulator_limb_0_range_constraint_4 = View(in.accumulator_low_limbs_range_constraint_4);
        auto accumulator_limb_1_range_constraint_4 = View(in.accumulator_low_limbs_range_constraint_4_shift);
        auto accumulator_limb_2_range_constraint_4 = View(in.accumulator_high_limbs_range_constraint_4);

        // Shifts used to constrain ranges further
        // Lets create a table in comments with columns No of bits in limb, last microlimb bits, shift used
        // ┌───────────┬─────────────────────┬─────────────────┐
        // │ Limb bits │ Last microlimb bits │ Shift           │
        // ├───────────┼─────────────────────┼─────────────────┤
        // │    68     │         12          │    4  (2¹⁴⁻¹²)  │
        // │    52     │         10          │   16  (2¹⁴⁻¹⁰)  │
        // │    50     │          8          │   64  (2¹⁴⁻⁸)   │
        // │    60     │          4          │ 1024  (2¹⁴⁻⁴)   │
        // └───────────┴─────────────────────┴─────────────────┘
        static const auto SHIFT_12_TO_14 = FF(4);
        static const auto SHIFT_10_TO_14 = FF(16);
        static const auto SHIFT_8_TO_14 = FF(64);
        static const auto SHIFT_4_TO_14 = FF(1024);

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
        //        (12 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto p_x_limb_0 = View(in.p_x_low_limbs);
        auto p_x_limb_0_range_constraint_0 = View(in.p_x_low_limbs_range_constraint_0);
        auto p_x_limb_0_range_constraint_1 = View(in.p_x_low_limbs_range_constraint_1);
        auto p_x_limb_0_range_constraint_2 = View(in.p_x_low_limbs_range_constraint_2);
        auto p_x_limb_0_range_constraint_3 = View(in.p_x_low_limbs_range_constraint_3);
        auto p_x_limb_0_range_constraint_4 = View(in.p_x_low_limbs_range_constraint_4);

        // Pₓ,₁ = (Pₓ,₁[4] || Pₓ,₁[3] || Pₓ,₁[2] || Pₓ,₁[1] || Pₓ,₁[0])
        //        (12 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto p_x_limb_1 = View(in.p_x_low_limbs_shift);
        auto p_x_limb_1_range_constraint_0 = View(in.p_x_low_limbs_range_constraint_0_shift);
        auto p_x_limb_1_range_constraint_1 = View(in.p_x_low_limbs_range_constraint_1_shift);
        auto p_x_limb_1_range_constraint_2 = View(in.p_x_low_limbs_range_constraint_2_shift);
        auto p_x_limb_1_range_constraint_3 = View(in.p_x_low_limbs_range_constraint_3_shift);
        auto p_x_limb_1_range_constraint_4 = View(in.p_x_low_limbs_range_constraint_4_shift);

        // Pₓ,₂ = (Pₓ,₂[4] || Pₓ,₂[3] || Pₓ,₂[2] || Pₓ,₂[1] || Pₓ,₂[0])
        //        (12 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto p_x_limb_2 = View(in.p_x_high_limbs);
        auto p_x_limb_2_range_constraint_0 = View(in.p_x_high_limbs_range_constraint_0);
        auto p_x_limb_2_range_constraint_1 = View(in.p_x_high_limbs_range_constraint_1);
        auto p_x_limb_2_range_constraint_2 = View(in.p_x_high_limbs_range_constraint_2);
        auto p_x_limb_2_range_constraint_3 = View(in.p_x_high_limbs_range_constraint_3);
        auto p_x_limb_2_range_constraint_4 = View(in.p_x_high_limbs_range_constraint_4);

        // Pₓ,₃ = (Pₓ,₃[3] || Pₓ,₃[2] || Pₓ,₃[1] || Pₓ,₃[0])
        //        (08 bits || 14 bits || 14 bits || 14 bits)
        auto p_x_limb_3 = View(in.p_x_high_limbs_shift);
        auto p_x_limb_3_range_constraint_0 = View(in.p_x_high_limbs_range_constraint_0_shift);
        auto p_x_limb_3_range_constraint_1 = View(in.p_x_high_limbs_range_constraint_1_shift);
        auto p_x_limb_3_range_constraint_2 = View(in.p_x_high_limbs_range_constraint_2_shift);
        auto p_x_limb_3_range_constraint_3 = View(in.p_x_high_limbs_range_constraint_3_shift);

        // Pᵧ,₀ = (Pᵧ,₀[4] || Pᵧ,₀[3] || Pᵧ,₀[2] || Pᵧ,₀[1] || Pᵧ,₀[0])
        //        (12 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto p_y_limb_0 = View(in.p_y_low_limbs);
        auto p_y_limb_0_range_constraint_0 = View(in.p_y_low_limbs_range_constraint_0);
        auto p_y_limb_0_range_constraint_1 = View(in.p_y_low_limbs_range_constraint_1);
        auto p_y_limb_0_range_constraint_2 = View(in.p_y_low_limbs_range_constraint_2);
        auto p_y_limb_0_range_constraint_3 = View(in.p_y_low_limbs_range_constraint_3);
        auto p_y_limb_0_range_constraint_4 = View(in.p_y_low_limbs_range_constraint_4);

        // Pᵧ,₁ = (Pᵧ,₁[4] || Pᵧ,₁[3] || Pᵧ,₁[2] || Pᵧ,₁[1] || Pᵧ,₁[0])
        //        (12 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto p_y_limb_1 = View(in.p_y_low_limbs_shift);
        auto p_y_limb_1_range_constraint_0 = View(in.p_y_low_limbs_range_constraint_0_shift);
        auto p_y_limb_1_range_constraint_1 = View(in.p_y_low_limbs_range_constraint_1_shift);
        auto p_y_limb_1_range_constraint_2 = View(in.p_y_low_limbs_range_constraint_2_shift);
        auto p_y_limb_1_range_constraint_3 = View(in.p_y_low_limbs_range_constraint_3_shift);
        auto p_y_limb_1_range_constraint_4 = View(in.p_y_low_limbs_range_constraint_4_shift);

        // Pᵧ,₂ = (Pᵧ,₂[4] || Pᵧ,₂[3] || Pᵧ,₂[2] || Pᵧ,₂[1] || Pᵧ,₂[0])
        //        (12 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto p_y_limb_2 = View(in.p_y_high_limbs);
        auto p_y_limb_2_range_constraint_0 = View(in.p_y_high_limbs_range_constraint_0);
        auto p_y_limb_2_range_constraint_1 = View(in.p_y_high_limbs_range_constraint_1);
        auto p_y_limb_2_range_constraint_2 = View(in.p_y_high_limbs_range_constraint_2);
        auto p_y_limb_2_range_constraint_3 = View(in.p_y_high_limbs_range_constraint_3);
        auto p_y_limb_2_range_constraint_4 = View(in.p_y_high_limbs_range_constraint_4);

        // Pᵧ,₃ = (Pᵧ,₃[3] || Pᵧ,₃[2] || Pᵧ,₃[1] || Pᵧ,₃[0])
        //        (08 bits || 14 bits || 14 bits || 14 bits)
        auto p_y_limb_3 = View(in.p_y_high_limbs_shift);
        auto p_y_limb_3_range_constraint_0 = View(in.p_y_high_limbs_range_constraint_0_shift);
        auto p_y_limb_3_range_constraint_1 = View(in.p_y_high_limbs_range_constraint_1_shift);
        auto p_y_limb_3_range_constraint_2 = View(in.p_y_high_limbs_range_constraint_2_shift);
        auto p_y_limb_3_range_constraint_3 = View(in.p_y_high_limbs_range_constraint_3_shift);

        // z₁,₀ = (z₁,₀[4] || z₁,₀[3] || z₁,₀[2] || z₁,₀[1] || z₁,₀[0])
        //        (12 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto z_first_limb_0 = View(in.z_low_limbs);
        auto z_first_limb_0_range_constraint_0 = View(in.z_low_limbs_range_constraint_0);
        auto z_first_limb_0_range_constraint_1 = View(in.z_low_limbs_range_constraint_1);
        auto z_first_limb_0_range_constraint_2 = View(in.z_low_limbs_range_constraint_2);
        auto z_first_limb_0_range_constraint_3 = View(in.z_low_limbs_range_constraint_3);
        auto z_first_limb_0_range_constraint_4 = View(in.z_low_limbs_range_constraint_4);

        // z₂,₀ = (z₂,₀[4] || z₂,₀[3] || z₂,₀[2] || z₂,₀[1] || z₂,₀[0])
        //        (12 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto z_second_limb_0 = View(in.z_low_limbs_shift);
        auto z_second_limb_0_range_constraint_0 = View(in.z_low_limbs_range_constraint_0_shift);
        auto z_second_limb_0_range_constraint_1 = View(in.z_low_limbs_range_constraint_1_shift);
        auto z_second_limb_0_range_constraint_2 = View(in.z_low_limbs_range_constraint_2_shift);
        auto z_second_limb_0_range_constraint_3 = View(in.z_low_limbs_range_constraint_3_shift);
        auto z_second_limb_0_range_constraint_4 = View(in.z_low_limbs_range_constraint_4_shift);

        // z₁,₁ = (z₁,₁[4] || z₁,₁[3] || z₁,₁[2] || z₁,₁[1] || z₁,₁[0])
        //        (04 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto z_first_limb_1 = View(in.z_high_limbs);
        auto z_first_limb_1_range_constraint_0 = View(in.z_high_limbs_range_constraint_0);
        auto z_first_limb_1_range_constraint_1 = View(in.z_high_limbs_range_constraint_1);
        auto z_first_limb_1_range_constraint_2 = View(in.z_high_limbs_range_constraint_2);
        auto z_first_limb_1_range_constraint_3 = View(in.z_high_limbs_range_constraint_3);
        auto z_first_limb_1_range_constraint_4 = View(in.z_high_limbs_range_constraint_4);

        // z₂,₁ = (z₂,₁[4] || z₂,₁[3] || z₂,₁[2] || z₂,₁[1] || z₂,₁[0])
        //        (04 bits || 14 bits || 14 bits || 14 bits || 14 bits)
        auto z_second_limb_1 = View(in.z_high_limbs_shift);
        auto z_second_limb_1_range_constraint_0 = View(in.z_high_limbs_range_constraint_0_shift);
        auto z_second_limb_1_range_constraint_1 = View(in.z_high_limbs_range_constraint_1_shift);
        auto z_second_limb_1_range_constraint_2 = View(in.z_high_limbs_range_constraint_2_shift);
        auto z_second_limb_1_range_constraint_3 = View(in.z_high_limbs_range_constraint_3_shift);
        auto z_second_limb_1_range_constraint_4 = View(in.z_high_limbs_range_constraint_4_shift);

        // Q₀ = (Q₀[4] || Q₀[3] || Q₀[2] || Q₀[1] || Q₀[0])
        //      (12    || 14    || 14    || 14    || 14   )
        auto quotient_binary_limbs_0 = View(in.quotient_low_binary_limbs);
        auto quotient_limb_0_range_constraint_0 = View(in.quotient_low_limbs_range_constraint_0);
        auto quotient_limb_0_range_constraint_1 = View(in.quotient_low_limbs_range_constraint_1);
        auto quotient_limb_0_range_constraint_2 = View(in.quotient_low_limbs_range_constraint_2);
        auto quotient_limb_0_range_constraint_3 = View(in.quotient_low_limbs_range_constraint_3);
        auto quotient_limb_0_range_constraint_4 = View(in.quotient_low_limbs_range_constraint_4);

        // Q₁ = (Q₁[4] || Q₁[3] || Q₁[2] || Q₁[1] || Q₁[0])
        //      (12    || 14    || 14    || 14    || 14   )
        auto quotient_binary_limbs_1 = View(in.quotient_low_binary_limbs_shift);
        auto quotient_limb_1_range_constraint_0 = View(in.quotient_low_limbs_range_constraint_0_shift);
        auto quotient_limb_1_range_constraint_1 = View(in.quotient_low_limbs_range_constraint_1_shift);
        auto quotient_limb_1_range_constraint_2 = View(in.quotient_low_limbs_range_constraint_2_shift);
        auto quotient_limb_1_range_constraint_3 = View(in.quotient_low_limbs_range_constraint_3_shift);
        auto quotient_limb_1_range_constraint_4 = View(in.quotient_low_limbs_range_constraint_4_shift);

        // Q₂ = (Q₂[4] || Q₂[3] || Q₂[2] || Q₂[1] || Q₂[0])
        //      (12    || 14    || 14    || 14    || 14   )
        auto quotient_binary_limbs_2 = View(in.quotient_high_binary_limbs);
        auto quotient_limb_2_range_constraint_0 = View(in.quotient_high_limbs_range_constraint_0);
        auto quotient_limb_2_range_constraint_1 = View(in.quotient_high_limbs_range_constraint_1);
        auto quotient_limb_2_range_constraint_2 = View(in.quotient_high_limbs_range_constraint_2);
        auto quotient_limb_2_range_constraint_3 = View(in.quotient_high_limbs_range_constraint_3);
        auto quotient_limb_2_range_constraint_4 = View(in.quotient_high_limbs_range_constraint_4);

        // Q₃ = (Q₃[3] || Q₃[2] || Q₃[1] || Q₃[0])
        //      (10    || 14    || 14    || 14   )
        auto quotient_binary_limbs_3 = View(in.quotient_high_binary_limbs_shift);
        auto quotient_limb_3_range_constraint_0 = View(in.quotient_high_limbs_range_constraint_0_shift);
        auto quotient_limb_3_range_constraint_1 = View(in.quotient_high_limbs_range_constraint_1_shift);
        auto quotient_limb_3_range_constraint_2 = View(in.quotient_high_limbs_range_constraint_2_shift);
        auto quotient_limb_3_range_constraint_3 = View(in.quotient_high_limbs_range_constraint_3_shift);

        // Carry limbs: relation_wide_limbs_lo (84 bits) (all limbs are 14 bits)
        // cₗₒ = (cₗₒ[5] || cₗₒ[4] || cₗₒ[3] || cₗₒ[2] || cₗₒ[1] || cₗₒ[0])
        auto relation_wide_limbs_lo = View(in.relation_wide_limbs);
        auto relation_wide_limbs_lo_range_constraint_0 = View(in.relation_wide_limbs_range_constraint_0);
        auto relation_wide_limbs_lo_range_constraint_1 = View(in.relation_wide_limbs_range_constraint_1);
        auto relation_wide_limbs_lo_range_constraint_2 = View(in.relation_wide_limbs_range_constraint_2);
        auto relation_wide_limbs_lo_range_constraint_3 = View(in.relation_wide_limbs_range_constraint_3);

        // The final two limbs of cₗₒ are stored in the unused tail columns of pₓ and accumulator.
        auto relation_wide_limbs_lo_range_constraint_4 = View(in.p_x_high_limbs_range_constraint_tail_shift);
        auto relation_wide_limbs_lo_range_constraint_5 = View(in.accumulator_high_limbs_range_constraint_tail_shift);

        // Carry limbs: relation_wide_limbs_hi (84 bits) (all limbs are 14 bits)
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
        auto z_first_limb_0_range_constraint_tail = View(in.z_low_limbs_range_constraint_tail);
        auto z_second_limb_0_range_constraint_tail = View(in.z_low_limbs_range_constraint_tail_shift);
        auto z_first_limb_1_range_constraint_tail = View(in.z_high_limbs_range_constraint_tail);
        auto z_second_limb_1_range_constraint_tail = View(in.z_high_limbs_range_constraint_tail_shift);

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
        auto lagrange_even_in_minicircuit_scaled = lagrange_even_in_minicircuit * scaling_factor;

        // clang-format off
        // Contribution 5 , Pᵧ,₀ limb decomposition
        auto tmp_5 =
            ((p_y_limb_0_range_constraint_0 +
              p_y_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_y_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_y_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_y_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_y_limb_0);
        std::get<4>(accumulators) += Accumulator(tmp_5 * lagrange_even_in_minicircuit_scaled);

        // Contribution 6 , Pᵧ,₁ limb decomposition
        auto tmp_6 =
            ((p_y_limb_1_range_constraint_0 +
              p_y_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_y_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_y_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_y_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_y_limb_1);
        std::get<5>(accumulators) += Accumulator(tmp_6 * lagrange_even_in_minicircuit_scaled);

        // Contribution 7 , Pᵧ,₂ limb decomposition
        auto tmp_7 =
            ((p_y_limb_2_range_constraint_0 +
              p_y_limb_2_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_y_limb_2_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_y_limb_2_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_y_limb_2_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_y_limb_2);
        std::get<6>(accumulators) += Accumulator(tmp_7 * lagrange_even_in_minicircuit_scaled);

        // Contribution 8 , Pᵧ,₃ limb decomposition
        auto tmp_8 =
            ((p_y_limb_3_range_constraint_0 +
              p_y_limb_3_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_y_limb_3_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_y_limb_3_range_constraint_3 * MICRO_LIMB_SHIFTx3) -
             p_y_limb_3);
        std::get<7>(accumulators) += Accumulator(tmp_8 * lagrange_even_in_minicircuit_scaled);

        // Contribution 9 , z₁,₀ limb decomposition
        auto tmp_9 =
            ((z_first_limb_0_range_constraint_0 +
              z_first_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              z_first_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              z_first_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              z_first_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             z_first_limb_0);
        std::get<8>(accumulators) += Accumulator(tmp_9 * lagrange_even_in_minicircuit_scaled);

        // Contribution 10 , z₂,₀ limb decomposition
        auto tmp_10 =
            ((z_second_limb_0_range_constraint_0 +
              z_second_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              z_second_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              z_second_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              z_second_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             z_second_limb_0);
        std::get<9>(accumulators) += Accumulator(tmp_10 * lagrange_even_in_minicircuit_scaled);

        // Contribution 11 , z₁,₁ limb decomposition
        auto tmp_11 =
            ((z_first_limb_1_range_constraint_0 +
              z_first_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              z_first_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              z_first_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              z_first_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             z_first_limb_1);
        std::get<10>(accumulators) += Accumulator(tmp_11 * lagrange_even_in_minicircuit_scaled);

        // Contribution 12 , z₂,₁ limb decomposition
        auto tmp_12 =
            ((z_second_limb_1_range_constraint_0 +
              z_second_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              z_second_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              z_second_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              z_second_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             z_second_limb_1);
        std::get<11>(accumulators) += Accumulator(tmp_12 * lagrange_even_in_minicircuit_scaled);

        // Contributions that decompose 50, 52, 68 or 84 bit limbs used for computation into range-constrained chunks
        // Contribution 13, Pₓ,₀ limb decomposition
        auto tmp_13 =
            ((p_x_limb_0_range_constraint_0 +
              p_x_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_x_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_x_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_x_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_x_limb_0);
        std::get<12>(accumulators) += Accumulator(tmp_13 * lagrange_even_in_minicircuit_scaled);

        // Contribution 14 , Pₓ,₁ limb decomposition
        auto tmp_14 =
            ((p_x_limb_1_range_constraint_0 +
              p_x_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_x_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_x_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_x_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_x_limb_1);
        std::get<13>(accumulators) += Accumulator(tmp_14 * lagrange_even_in_minicircuit_scaled);

        // Contribution 15 , Pₓ,₂ limb decomposition
        auto tmp_15 =
            ((p_x_limb_2_range_constraint_0 +
              p_x_limb_2_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_x_limb_2_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_x_limb_2_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              p_x_limb_2_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             p_x_limb_2);
        std::get<14>(accumulators) += Accumulator(tmp_15 * lagrange_even_in_minicircuit_scaled);

        // Contribution 16 , Pₓ,₃ limb decomposition
        auto tmp_16 =
            ((p_x_limb_3_range_constraint_0 +
              p_x_limb_3_range_constraint_1 * MICRO_LIMB_SHIFT +
              p_x_limb_3_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              p_x_limb_3_range_constraint_3 * MICRO_LIMB_SHIFTx3) -
             p_x_limb_3);
        std::get<15>(accumulators) += Accumulator(tmp_16 * lagrange_even_in_minicircuit_scaled);

        // Contribution 17 , Q₀ limb decomposition
        auto tmp_17 =
            ((quotient_limb_0_range_constraint_0 +
              quotient_limb_0_range_constraint_1 * MICRO_LIMB_SHIFT +
              quotient_limb_0_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              quotient_limb_0_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              quotient_limb_0_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             quotient_binary_limbs_0);
        std::get<16>(accumulators) += Accumulator(tmp_17 * lagrange_even_in_minicircuit_scaled);

        // Contribution 18 , Q₁ limb decomposition
        auto tmp_18 =
            ((quotient_limb_1_range_constraint_0 +
              quotient_limb_1_range_constraint_1 * MICRO_LIMB_SHIFT +
              quotient_limb_1_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              quotient_limb_1_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              quotient_limb_1_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             quotient_binary_limbs_1);
        std::get<17>(accumulators) += Accumulator(tmp_18 * lagrange_even_in_minicircuit_scaled);

        // Contribution 19 , Q₂ limb decomposition
        auto tmp_19 =
            ((quotient_limb_2_range_constraint_0 +
              quotient_limb_2_range_constraint_1 * MICRO_LIMB_SHIFT +
              quotient_limb_2_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              quotient_limb_2_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              quotient_limb_2_range_constraint_4 * MICRO_LIMB_SHIFTx4) -
             quotient_binary_limbs_2);
        std::get<18>(accumulators) += Accumulator(tmp_19 * lagrange_even_in_minicircuit_scaled);

        // Contribution 20 , Q₃ limb decomposition
        auto tmp_20 =
            ((quotient_limb_3_range_constraint_0 +
              quotient_limb_3_range_constraint_1 * MICRO_LIMB_SHIFT +
              quotient_limb_3_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              quotient_limb_3_range_constraint_3 * MICRO_LIMB_SHIFTx3) -
             quotient_binary_limbs_3);
        std::get<19>(accumulators) += Accumulator(tmp_20 * lagrange_even_in_minicircuit_scaled);

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
        std::get<20>(accumulators) += Accumulator(tmp_21 * lagrange_even_in_minicircuit_scaled);

        // Contribution 22 , decomposition of high relation limb
        auto tmp_22 =
            ((relation_wide_limbs_hi_range_constraint_0 +
              relation_wide_limbs_hi_range_constraint_1 * MICRO_LIMB_SHIFT +
              relation_wide_limbs_hi_range_constraint_2 * MICRO_LIMB_SHIFTx2 +
              relation_wide_limbs_hi_range_constraint_3 * MICRO_LIMB_SHIFTx3 +
              relation_wide_limbs_hi_range_constraint_4 * MICRO_LIMB_SHIFTx4 +
              relation_wide_limbs_hi_range_constraint_5 * MICRO_LIMB_SHIFTx5) -
             relation_wide_limbs_hi);
        std::get<21>(accumulators) += Accumulator(tmp_22 * lagrange_even_in_minicircuit_scaled);

        // Contributions enfocing a reduced range constraint on high limbs (these relation force the last microlimb in
        // each limb to be more severely range constrained)

        // Contribution 23, range constrain Pₓ,₀[4] to be 12 bits (68 % 14 = 12)
        auto tmp_23 = p_x_limb_0_range_constraint_4 * SHIFT_12_TO_14 - p_x_limb_0_range_constraint_tail;
        std::get<22>(accumulators) += Accumulator(tmp_23 * lagrange_even_in_minicircuit_scaled);

        // Contribution 24, range constrain Pₓ,₁[4] to be 12 bits
        auto tmp_24 = p_x_limb_1_range_constraint_4 * SHIFT_12_TO_14 - p_x_limb_1_range_constraint_tail;
        std::get<23>(accumulators) += Accumulator(tmp_24 * lagrange_even_in_minicircuit_scaled);

        // Contribution 25, range constrain Pₓ,₂[4] to be 12 bits
        auto tmp_25 = p_x_limb_2_range_constraint_4 * SHIFT_12_TO_14 - p_x_limb_2_range_constraint_tail;
        std::get<24>(accumulators) += Accumulator(tmp_25 * lagrange_even_in_minicircuit_scaled);

        // Contribution 26, range constrain Pₓ,₃[3] (top limb of Pₓ,₃) to be 8 bits (50 % 14 = 8)
        auto tmp_26 = p_x_limb_3_range_constraint_3 * SHIFT_8_TO_14 - p_x_limb_3_range_constraint_tail;
        std::get<25>(accumulators) += Accumulator(tmp_26 * lagrange_even_in_minicircuit_scaled);

        // Contribution 27, range constrain Pᵧ,₀[4] to be 12 bits (68 % 14 = 12)
        auto tmp_27 = p_y_limb_0_range_constraint_4 * SHIFT_12_TO_14 - p_y_limb_0_range_constraint_tail;
        std::get<26>(accumulators) += Accumulator(tmp_27 * lagrange_even_in_minicircuit_scaled);

        // Contribution 28, range constrain Pᵧ,₁[4] to be 12 bits (68 % 14 = 12)
        auto tmp_28 = p_y_limb_1_range_constraint_4 * SHIFT_12_TO_14 - p_y_limb_1_range_constraint_tail;
        std::get<27>(accumulators) += Accumulator(tmp_28 * lagrange_even_in_minicircuit_scaled);

        // Contribution 29, range constrain Pᵧ,₂[4] to be 12 bits (68 % 14 = 12)
        auto tmp_29 = p_y_limb_2_range_constraint_4 * SHIFT_12_TO_14 - p_y_limb_2_range_constraint_tail;
        std::get<28>(accumulators) += Accumulator(tmp_29 * lagrange_even_in_minicircuit_scaled);

        // Contribution 30, range constrain Pᵧ,₃[3] (top limb of Pᵧ,₃) to be 8 bits (50 % 14 = 8)
        auto tmp_30 = p_y_limb_3_range_constraint_3 * SHIFT_8_TO_14 - p_y_limb_3_range_constraint_tail;
        std::get<29>(accumulators) += Accumulator(tmp_30 * lagrange_even_in_minicircuit_scaled);

        // Contribution 31, range constrain z₁,₀[4] to be 12 bits (68 % 14 = 12)
        auto tmp_31 = (z_first_limb_0_range_constraint_4 * SHIFT_12_TO_14 - z_first_limb_0_range_constraint_tail);
        std::get<30>(accumulators) += Accumulator(tmp_31 * lagrange_even_in_minicircuit_scaled);

        // Contribution 32, range constrain z₂,₀[4] to be 12 bits (68 % 14 = 12)
        auto tmp_32 = (z_second_limb_0_range_constraint_4 * SHIFT_12_TO_14 - z_second_limb_0_range_constraint_tail);
        std::get<31>(accumulators) += Accumulator(tmp_32 * lagrange_even_in_minicircuit_scaled);

        // Contribution 33, range constrain z₁,₁[4] to be 4 bits (60 % 14 = 4)
        auto tmp_33 = (z_first_limb_1_range_constraint_4 * SHIFT_4_TO_14 - z_first_limb_1_range_constraint_tail);
        std::get<32>(accumulators) += Accumulator(tmp_33 * lagrange_even_in_minicircuit_scaled);

        // Contribution 34, range constrain z₂,₁[4] to be 4 bits (60 % 14 = 4)
        auto tmp_34 = z_second_limb_1_range_constraint_4 * SHIFT_4_TO_14 - z_second_limb_1_range_constraint_tail;
        std::get<33>(accumulators) += Accumulator(tmp_34 * lagrange_even_in_minicircuit_scaled);

        // Contribution 35, range constrain A₀,₄ to be 12 bits (68 % 14 = 12)
        auto tmp_35 = accumulator_limb_0_range_constraint_4 * SHIFT_12_TO_14 - accumulator_limb_0_range_constraint_tail;
        std::get<34>(accumulators) += Accumulator(tmp_35 * lagrange_even_in_minicircuit_scaled);

        // Contribution 36, range constrain A₁,₄ to be 12 bits (68 % 14 = 12)
        auto tmp_36 = (accumulator_limb_1_range_constraint_4 * SHIFT_12_TO_14 - accumulator_limb_1_range_constraint_tail);
        std::get<35>(accumulators) += Accumulator(tmp_36 * lagrange_even_in_minicircuit_scaled);

        // Contribution 37, range constrain A₂,₄ to be 12 bits (68 % 14 = 12)
        auto tmp_37 = (accumulator_limb_2_range_constraint_4 * SHIFT_12_TO_14 - accumulator_limb_2_range_constraint_tail);
        std::get<36>(accumulators) += Accumulator(tmp_37 * lagrange_even_in_minicircuit_scaled);

        // Contribution 38, range constrain A₃,₃ to be 8 bits (50 % 14 = 8)
        auto tmp_38 = (accumulator_limb_3_range_constraint_3 * SHIFT_8_TO_14 - accumulator_limb_3_range_constraint_tail);
        std::get<37>(accumulators) += Accumulator(tmp_38 * lagrange_even_in_minicircuit_scaled);

        // Contribution 39, range constrain Q₀[4] to be 12 bits (68 % 14 = 12)
        auto tmp_39 = (quotient_limb_0_range_constraint_4 * SHIFT_12_TO_14 - quotient_limb_0_range_constraint_tail);
        std::get<38>(accumulators) += Accumulator(tmp_39 * lagrange_even_in_minicircuit_scaled);

        // Contribution 40, range constrain Q₁[4] to be 12 bits (68 % 14 = 12)
        auto tmp_40 = (quotient_limb_1_range_constraint_4 * SHIFT_12_TO_14 - quotient_limb_1_range_constraint_tail);
        std::get<39>(accumulators) += Accumulator(tmp_40 * lagrange_even_in_minicircuit_scaled);

        // Contribution 41, range constrain Q₂[4] to be 12 bits (68 % 14 = 12)
        auto tmp_41 = (quotient_limb_2_range_constraint_4 * SHIFT_12_TO_14 - quotient_limb_2_range_constraint_tail);
        std::get<40>(accumulators) += Accumulator(tmp_41 * lagrange_even_in_minicircuit_scaled);

        // Contribution 42, range constrain Q₃[3] (top limb of Q₃) to be 10 bits (52 % 14 = 10)
        auto tmp_42 = (quotient_limb_3_range_constraint_3 * SHIFT_10_TO_14 - quotient_limb_3_range_constraint_tail);
        std::get<41>(accumulators) += Accumulator(tmp_42 * lagrange_even_in_minicircuit_scaled);

        // Contributions where we decompose initial EccOpQueue values into 68-bit limbs

        // Contribution 43, decompose x_lo = Pₓ,₀ + Pₓ,₁ * 2⁶⁸
        auto tmp_43 = (p_x_limb_0 + p_x_limb_1 * LIMB_SHIFT) - x_lo;
        std::get<42>(accumulators) += Accumulator(tmp_43 * lagrange_even_in_minicircuit_scaled);

        // Contribution 44, decompose x_hi = Pₓ,₂ + Pₓ,₃ * 2⁶⁸
        auto tmp_44 = (p_x_limb_2 + p_x_limb_3 * LIMB_SHIFT) - x_hi;
        std::get<43>(accumulators) += Accumulator(tmp_44 * lagrange_even_in_minicircuit_scaled);

        // Contribution 45, decompose y_lo = Pᵧ,₀ + Pᵧ,₁ * 2⁶⁸
        auto tmp_45 = (p_y_limb_0 + p_y_limb_1 * LIMB_SHIFT) - y_lo;
        std::get<44>(accumulators) += Accumulator(tmp_45 * lagrange_even_in_minicircuit_scaled);

        // Contribution 46, decompose y_hi = Pᵧ,₂ + Pᵧ,₃ * 2⁶⁸
        auto tmp_46 = (p_y_limb_2 + p_y_limb_3 * LIMB_SHIFT) - y_hi;
        std::get<45>(accumulators) += Accumulator(tmp_46 * lagrange_even_in_minicircuit_scaled);

        // Contribution 47, decompose z1 = z₁,₀ + z₁,₁ * 2⁶⁸
        auto tmp_47 = (z_first_limb_0 + z_first_limb_1 * LIMB_SHIFT) - z_one;
        std::get<46>(accumulators) += Accumulator(tmp_47 * lagrange_even_in_minicircuit_scaled);

        // Contribution 48, decompose z2 = z₂,₀ + z₂,₁ * 2⁶⁸
        auto tmp_48 = (z_second_limb_0 + z_second_limb_1 * LIMB_SHIFT) - z_two;
        std::get<47>(accumulators) += Accumulator(tmp_48 * lagrange_even_in_minicircuit_scaled);
    }();
};
} // namespace bb
