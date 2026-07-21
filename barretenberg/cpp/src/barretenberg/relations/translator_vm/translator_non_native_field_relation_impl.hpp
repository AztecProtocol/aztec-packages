// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/translator_vm/translator_non_native_field_relation.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"

namespace bb {
/**
 * @brief Expression for the computation of Translator accumulator in integers through 68-bit limbs and
 * native field (prime) limb
 *
 * @details This relation is a part of system of relations that enforce a formula in non-native field (base field of
 * bn254 curve Fp (p - modulus of Fp)). We are trying to compute:
 *
 * `current_accumulator = previous_accumulator ⋅ x + op + P.x ⋅ v + P.y ⋅ v² +z1 ⋅ v³ + z2 ⋅ v⁴ mod p`.
 *
 * However, we can only operate in Fr (scalar field of bn254) with
 * modulus r. To emulate arithmetic in Fp we rephrase the equation in integers:
 *
 * `previous_accumulator ⋅ x + op + P.x ⋅ v + P.y ⋅ v² +z1 ⋅ v³ + z2 ⋅ v⁴ - quotient⋅p - current_accumulator = 0`
 *
 * We can't operate over unbounded integers, but since we know the maximum value of each element (we also treat
 * powers of v as new constants constrained to 254 bits) we know that the maximum values of the sum of the positive
 * products is ~2⁵¹⁴, so we only need to make sure that no overflow happens till that bound. We calculate integer
 * logic until the bound 2²⁷²⋅r (which is more than 2⁵¹⁴) by using the representations modulo 2²⁷² (requires limb
 * computation over native scalar field) and r (native scalar field computation).
 *
 * We perform modulo 2²⁷² computations by separating each of values into 4 68-bit limbs (z1 and z2 are just two
 * since they represent the values < 2¹²⁸ and op is just itself). Then we compute the first subrelation (index means
 * sublimb and we use 2²⁷² - p instead of -p):
 * `      previous_accumulator[0]⋅x[0] + op + P.x[0]⋅v[0] + P.y[0]⋅v²[0] + z1[0] ⋅ v³[0] + z2[0] ⋅ v⁴[0]
 *          + quotient[0]⋅(-p)[0] - current_accumulator[0]
 * + 2⁶⁸⋅(previous_accumulator[1]⋅x[0] +      P.x[1]⋅v[0] + P.y[1]⋅v²[0] + z1[1] ⋅ v³[0] + z2[1] ⋅ v⁴[0]
 *          + quotient[1]⋅(-p)[0] +
 *        previous_accumulator[0]⋅x[1] +      P.x[0]⋅v[1] + P.y[0]⋅v²[1] + z1[0] ⋅ v³[1] + z2[0] ⋅ v⁴[1]
 *          + quotient[0]⋅(-p)[1] - current_accumulator[1])
 *  - 2¹³⁶⋅relation_wide_lower_limb
 *  == 0`
 *
 * We use 2 relation wide limbs which are called wide, because they contain the results of products (like you needed
 * EDX:EAX in x86 to hold the product results of two standard 32-bit registers) and because they are constrained to
 * 84 bits instead of 68 or lower by other relations.
 *
 * We show that the evaluation in 2 lower limbs results in relation_wide_lower_limb multiplied by 2¹³⁶. If
 * relation_wide_lower_limb is propertly constrained (this is performed in other relations), then that means that
 * the lower 136 bits of the result are 0. This is the first subrelation.
 *
 * We then use the relation_wide_lower_limb as carry and add it to the next expression, computing the evaluation in
 * higher bits (carry + combinations of limbs (0,2), (1,1), (2,0), (0,3), (2,1), (1,2), (0,3)) and checking that it
 * results in 2¹³⁶⋅relation_wide_higher_limb. This ensures that the logic was sound modulo 2²⁷². This is the second
 * subrelation.
 *
 * Finally, we check that the relation holds in the native field. For this we reconstruct each value, for example:
 * `previous_accumulator_native =        previous_accumulator[0] + 2⁶⁸ ⋅previous_accumulator[1]
 *                                + 2¹³⁶⋅previous_accumulator[2] + 2²⁰⁴⋅previous accumulator[3] mod r`
 *
 * Then the last subrelation is simply checking the integer equation in this native form
 *
 * All of these subrelations are multiplied by lagrange_even_in_minicircuit, which is a polynomial with 1 at each even
 * index less than the size of the mini-circuit (16 times smaller than the final circuit and the only part over
 * which we need to calculate non-permutation relations). All other indices are set to zero. Each EccOpQueue entry
 * (operation) occupies 2 rows in bn254 transcripts. So the Translator VM has a 2-row cycle and we need to
 * switch the checks being performed depending on which row we are at right now. We have half a cycle of
 * accumulation, where we perform this computation, and half a cycle where we just copy accumulator data. They also get
 * multiplied by the op because the no-op range within the trace (if one exits) should imply the accumulator doesn't
 * change (fully enforced by the AccumulatorTransferRelation and OpcodeRelation )
 *
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Univariate edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void TranslatorNonNativeFieldRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulators,
                                                          const AllEntities& in,
                                                          const Parameters& params,
                                                          const FF& scaling_factor)
{

    using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    static constexpr size_t NUM_LIMB_BITS = 68;
    static const FF shift = FF(uint256_t(1) << NUM_LIMB_BITS);
    static const FF shiftx2 = FF(uint256_t(1) << (NUM_LIMB_BITS * 2));
    static const FF shiftx3 = FF(uint256_t(1) << (NUM_LIMB_BITS * 3));
    static const std::array<FF, 5> NEGATIVE_MODULUS_LIMBS =
        TranslatorCircuitBuilder::compute_negative_modulus_limbs<FF>();

    // Limbs of evaluation challenge x
    const auto& evaluation_input_x_0 = params.evaluation_input_x[0];
    const auto& evaluation_input_x_1 = params.evaluation_input_x[1];
    const auto& evaluation_input_x_2 = params.evaluation_input_x[2];
    const auto& evaluation_input_x_3 = params.evaluation_input_x[3];
    const auto& evaluation_input_x_4 = params.evaluation_input_x[4];

    // Limbs of batching challenge v
    const auto& v_0 = params.batching_challenge_v[0][0];
    const auto& v_1 = params.batching_challenge_v[0][1];
    const auto& v_2 = params.batching_challenge_v[0][2];
    const auto& v_3 = params.batching_challenge_v[0][3];
    const auto& v_4 = params.batching_challenge_v[0][4];

    // Limbs of batching challenge v²
    const auto& v_sqr_0 = params.batching_challenge_v[1][0];
    const auto& v_sqr_1 = params.batching_challenge_v[1][1];
    const auto& v_sqr_2 = params.batching_challenge_v[1][2];
    const auto& v_sqr_3 = params.batching_challenge_v[1][3];
    const auto& v_sqr_4 = params.batching_challenge_v[1][4];

    // Limbs of batching challenge v³
    const auto& v_cube_0 = params.batching_challenge_v[2][0];
    const auto& v_cube_1 = params.batching_challenge_v[2][1];
    const auto& v_cube_2 = params.batching_challenge_v[2][2];
    const auto& v_cube_3 = params.batching_challenge_v[2][3];
    const auto& v_cube_4 = params.batching_challenge_v[2][4];

    // Limbs of batching challenge v⁴
    const auto& v_quad_0 = params.batching_challenge_v[3][0];
    const auto& v_quad_1 = params.batching_challenge_v[3][1];
    const auto& v_quad_2 = params.batching_challenge_v[3][2];
    const auto& v_quad_3 = params.batching_challenge_v[3][3];
    const auto& v_quad_4 = params.batching_challenge_v[3][4];

    // Fetch witness values
    // Pₓ = (Pₓ,₃ || Pₓ,₂ || Pₓ,₁ || Pₓ,₀)
    // Pᵧ = (Pᵧ,₃ || Pᵧ,₂ || Pᵧ,₁ || Pᵧ,₀)
    // z₁ = (z₁,₁ || z₁,₀)
    // z₂ = (z₂,₁ || z₂,₀)
    // Q  = (q₃ || q₂ || q₁ || q₀)
    const auto& op = View(in.op);
    const auto& p_x_limb_0 = View(in.p_x_low_limbs);
    const auto& p_y_limb_0 = View(in.p_y_low_limbs);
    const auto& p_x_limb_2 = View(in.p_x_high_limbs);
    const auto& p_y_limb_2 = View(in.p_y_high_limbs);
    const auto& accumulators_binary_limbs_0 = View(in.accumulators_binary_limbs_0);
    const auto& accumulators_binary_limbs_1 = View(in.accumulators_binary_limbs_1);
    const auto& accumulators_binary_limbs_2 = View(in.accumulators_binary_limbs_2);
    const auto& accumulators_binary_limbs_3 = View(in.accumulators_binary_limbs_3);
    const auto& z_first_limb_0 = View(in.z_low_limbs);
    const auto& z_first_limb_1 = View(in.z_high_limbs);
    const auto& quotient_binary_limbs_0 = View(in.quotient_low_binary_limbs);
    const auto& quotient_binary_limbs_1 = View(in.quotient_low_binary_limbs_shift);
    const auto& p_x_limb_1 = View(in.p_x_low_limbs_shift);
    const auto& p_y_limb_1 = View(in.p_y_low_limbs_shift);
    const auto& p_x_limb_3 = View(in.p_x_high_limbs_shift);
    const auto& p_y_limb_3 = View(in.p_y_high_limbs_shift);
    const auto& prev_accumulators_binary_limbs_0 = View(in.accumulators_binary_limbs_0_shift);
    const auto& prev_accumulators_binary_limbs_1 = View(in.accumulators_binary_limbs_1_shift);
    const auto& prev_accumulators_binary_limbs_2 = View(in.accumulators_binary_limbs_2_shift);
    const auto& prev_accumulators_binary_limbs_3 = View(in.accumulators_binary_limbs_3_shift);
    const auto& z_second_limb_0 = View(in.z_low_limbs_shift);
    const auto& z_second_limb_1 = View(in.z_high_limbs_shift);
    const auto& quotient_binary_limbs_2 = View(in.quotient_high_binary_limbs);
    const auto& quotient_binary_limbs_3 = View(in.quotient_high_binary_limbs_shift);
    const auto& relation_wide_limbs_lo = View(in.relation_wide_limbs);
    const auto& relation_wide_limbs_hi = View(in.relation_wide_limbs_shift);
    const auto& lagrange_even_in_minicircuit = View(in.lagrange_even_in_minicircuit);

    /**
     * Contribution (1): Subrelation 1 - Lower Mod 2¹³⁶ Check
     *
     * Proves that the accumulation formula holds for the lower 136 bits (limbs 0 and 1).
     * Computes: T₀ + 2⁶⁸·T₁ - 2¹³⁶·c_lo = 0
     * where T₀ and T₁ are linear combinations of limb-0 and limb-1 products respectively,
     * and c_lo is the carry to the higher 136 bits.
     */
    // clang-format off
        // T₀: Limb 0 contribution (all products contributing at weight 2⁰)
        auto tmp = prev_accumulators_binary_limbs_0 * evaluation_input_x_0
                   + op
                   + p_x_limb_0 * v_0
                   + p_y_limb_0 * v_sqr_0
                   + z_first_limb_0 * v_cube_0
                   + z_second_limb_0 * v_quad_0
                   + quotient_binary_limbs_0 * NEGATIVE_MODULUS_LIMBS[0]
                   - accumulators_binary_limbs_0;

        // T₁: Limb 1 contribution (all cross-products contributing at weight 2⁶⁸)
        tmp += (prev_accumulators_binary_limbs_1      * evaluation_input_x_0
                   + prev_accumulators_binary_limbs_0 * evaluation_input_x_1
                   + p_x_limb_0 * v_1
                   + p_x_limb_1 * v_0
                   + p_y_limb_0 * v_sqr_1
                   + p_y_limb_1 * v_sqr_0
                   + z_first_limb_0 * v_cube_1
                   + z_first_limb_1 * v_cube_0
                   + z_second_limb_0 * v_quad_1
                   + z_second_limb_1 * v_quad_0
                   + quotient_binary_limbs_0 * NEGATIVE_MODULUS_LIMBS[1]
                   + quotient_binary_limbs_1 * NEGATIVE_MODULUS_LIMBS[0]
                   - accumulators_binary_limbs_1)
                * shift ;
    // clang-format on
    // Subtract 2¹³⁶·c_lo: if the result is zero, lower 136 bits are correct
    tmp -= relation_wide_limbs_lo * shiftx2;
    tmp *= lagrange_even_in_minicircuit * op;
    tmp *= scaling_factor;
    std::get<0>(accumulators) += tmp;

    /**
     * Contribution (2): Subrelation 2 - Higher Mod 2¹³⁶ Check
     *
     * Proves that the accumulation formula holds for the higher 136 bits (limbs 2 and 3).
     * Computes: T₂ + 2⁶⁸·T₃ - 2¹³⁶·c_hi = 0
     * where T₂ includes the carry c_lo from subrelation 1, T₃ contains limb-3 products,
     * and c_hi is the overflow carry (should be range-constrained to ensure soundness).
     * Together with Subrelation 1, this proves the relation holds mod 2²⁷².
     */
    // clang-format off
        // T₂: Limb 2 contribution (with carry from lower 136 bits)
        tmp = relation_wide_limbs_lo
              + prev_accumulators_binary_limbs_2 * evaluation_input_x_0
              + prev_accumulators_binary_limbs_1 * evaluation_input_x_1
              + prev_accumulators_binary_limbs_0 * evaluation_input_x_2
              + p_x_limb_2 * v_0
              + p_x_limb_1 * v_1
              + p_x_limb_0 * v_2
              + p_y_limb_2 * v_sqr_0
              + p_y_limb_1 * v_sqr_1
              + p_y_limb_0 * v_sqr_2
              + z_first_limb_1 * v_cube_1
              + z_first_limb_0 * v_cube_2
              + z_second_limb_1 * v_quad_1
              + z_second_limb_0 * v_quad_2
              + quotient_binary_limbs_2 * NEGATIVE_MODULUS_LIMBS[0]
              + quotient_binary_limbs_1 * NEGATIVE_MODULUS_LIMBS[1]
              + quotient_binary_limbs_0 * NEGATIVE_MODULUS_LIMBS[2]
              - accumulators_binary_limbs_2;

        // T₃: Limb 3 contribution (all cross-products contributing at weight 2²⁰⁴)
        tmp += (prev_accumulators_binary_limbs_3      * evaluation_input_x_0
                   + prev_accumulators_binary_limbs_2 * evaluation_input_x_1
                   + prev_accumulators_binary_limbs_1 * evaluation_input_x_2
                   + prev_accumulators_binary_limbs_0 * evaluation_input_x_3
                   + p_x_limb_3 * v_0
                   + p_x_limb_2 * v_1
                   + p_x_limb_1 * v_2
                   + p_x_limb_0 * v_3
                   + p_y_limb_3 * v_sqr_0
                   + p_y_limb_2 * v_sqr_1
                   + p_y_limb_1 * v_sqr_2
                   + p_y_limb_0 * v_sqr_3
                   + z_first_limb_1 * v_cube_2
                   + z_first_limb_0 * v_cube_3
                   + z_second_limb_1 * v_quad_2
                   + z_second_limb_0 * v_quad_3
                   + quotient_binary_limbs_3 * NEGATIVE_MODULUS_LIMBS[0]
                   + quotient_binary_limbs_2 * NEGATIVE_MODULUS_LIMBS[1]
                   + quotient_binary_limbs_1 * NEGATIVE_MODULUS_LIMBS[2]
                   + quotient_binary_limbs_0 * NEGATIVE_MODULUS_LIMBS[3]
                   - accumulators_binary_limbs_3)
                * shift;
    // clang-format on
    // Subtract 2¹³⁶·c_hi: if the result is zero, higher 136 bits are correct
    tmp -= relation_wide_limbs_hi * shiftx2;
    tmp *= lagrange_even_in_minicircuit * op;
    tmp *= scaling_factor;
    std::get<1>(accumulators) += tmp;

    // Helper functions to reconstruct field elements from limbs
    const auto reconstruct_from_two = [](const auto& l0, const auto& l1) { return l0 + l1 * shift; };

    const auto reconstruct_from_four = [](const auto& l0, const auto& l1, const auto& l2, const auto& l3) {
        return l0 + l1 * shift + l2 * shiftx2 + l3 * shiftx3;
    };

    // Reconstruct native 𝔽ᵣ representations from binary limbs
    auto reconstructed_p_x = reconstruct_from_four(p_x_limb_0, p_x_limb_1, p_x_limb_2, p_x_limb_3);
    auto reconstructed_p_y = reconstruct_from_four(p_y_limb_0, p_y_limb_1, p_y_limb_2, p_y_limb_3);
    auto reconstructed_previous_accumulator = reconstruct_from_four(prev_accumulators_binary_limbs_0,
                                                                    prev_accumulators_binary_limbs_1,
                                                                    prev_accumulators_binary_limbs_2,
                                                                    prev_accumulators_binary_limbs_3);
    auto reconstructed_current_accumulator = reconstruct_from_four(accumulators_binary_limbs_0,
                                                                   accumulators_binary_limbs_1,
                                                                   accumulators_binary_limbs_2,
                                                                   accumulators_binary_limbs_3);
    auto reconstructed_z1 = reconstruct_from_two(z_first_limb_0, z_first_limb_1);
    auto reconstructed_z2 = reconstruct_from_two(z_second_limb_0, z_second_limb_1);
    auto reconstructed_quotient = reconstruct_from_four(
        quotient_binary_limbs_0, quotient_binary_limbs_1, quotient_binary_limbs_2, quotient_binary_limbs_3);

    /**
     * Contribution (3): Subrelation 3 - Native Field Check
     *
     * Proves the accumulation formula holds when computed directly in 𝔽ᵣ.
     * Uses reconstructed native field representations (tilde notation in docs).
     * Combined with mod 2²⁷² checks (Subrelations 1 & 2), this proves the relation
     * holds in integers via Chinese Remainder Theorem, which implies it holds mod q.
     */
    // clang-format off
        // Compute accumulation formula using native 𝔽ᵣ arithmetic (limb index 4)
        tmp = reconstructed_previous_accumulator * evaluation_input_x_4
                     + op
                     + reconstructed_p_x * v_4
                     + reconstructed_p_y * v_sqr_4
                     + reconstructed_z1  * v_cube_4
                     + reconstructed_z2  * v_quad_4
                     + reconstructed_quotient * NEGATIVE_MODULUS_LIMBS[4]
                     - reconstructed_current_accumulator;
    // clang-format on
    tmp *= lagrange_even_in_minicircuit * op;
    tmp *= scaling_factor;
    std::get<2>(accumulators) += tmp;
};
} // namespace bb
