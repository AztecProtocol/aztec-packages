#pragma once

#include "./transition_widget.hpp"

namespace proof_system::plonk {
namespace widget {

/*
 * The range constraint accumulates base 4 values into a sum.
 * We do this by evaluating a kind of 'raster scan', where we compare adjacent elements
 * and validate that their differences map to a base for value  *
 * Let's say that we want to perform a 32-bit range constraint in 'x'.
 * We can represent x via 16 constituent base-4 'quads' {q_0, ..., q_15}:
 *
 *      15
 *      ===
 *      \          i
 * x =  /    q  . 4
 *      ===   i
 *     i = 0
 *
 * In program memory, we place an accumulating base-4 sum of x {a_0, ..., a_15}, where
 *
 *            i                         |
 *           ===                        | a_0  =                         q_15
 *           \                  i - j   | a_1  =              q_15 . 4 + q_14
 *    a   =  /    q         .  4        | a_2  = q_15 . 4^2 + q_14 . 4 + q_13
 *     i     ===   (15 - j)             |   ...
 *          j = 0                       | a_15 = x
 *
 *
 * From this, we can use our range transition constraint to validate that
 *
 *
 *  a      - 4 . a  ϵ {0, 1, 2, 3}  (for the a_i above, we have
 *   i + 1        i                  a_{i+1} - 4.a_i = q_{14-i}, for i = 0, ..., 15),
 *
 * setting a_{-1} = 0.
 *
 * We place our accumulating sums in program memory in the following sequence:
 *
 * +-----+-----+-----+-----+
 * |  A  |  B  |  C  |  D  |
 * +-----+-----+-----+-----+
 * | a2  | a1  | a0  | 0   |
 * | a6  | a5  | a4  | a3  |
 * | a10 | a9  | a8  | a7  |
 * | a14 | a13 | a12 | a11 |
 * | --- | --- | --- | a15 |
 * +-----+-----+-----+-----+
 *
 * Our range transition constraint on row 'i'
 * performs our base-4 range check on the follwing pairs:
 *
 * (D_{i}, C_{i}), (C_{i}, B_{i}), (B_{i}, A_{i}), (A_{i}, D_{i+1})
 *
 * We need to start our raster scan at zero, so we simplify matters and just force the first value
 * to be zero.
 *
 * The output will be in the 4th column of an otherwise unused row. Assuming this row can
 * be used for a width-3 standard gate, the total number of gates for an n-bit range constraint
 * is (n / 8) gates
 *
 **/
template <class Field, class Getters, typename PolyContainer> class TurboRangeKernel {
  public:
    static constexpr size_t num_independent_relations = 4;
    // We state the challenges required for linear/nonlinear terms computation
    static constexpr uint8_t quotient_required_challenges = CHALLENGE_BIT_ALPHA;
    // We state the challenges required for updating kate opening scalars
    static constexpr uint8_t update_required_challenges = CHALLENGE_BIT_ALPHA;

  private:
    typedef containers::challenge_array<Field, num_independent_relations> challenge_array;
    typedef containers::coefficient_array<Field> coefficient_array;

  public:
    /**
     * @brief Quickly checks if the result of all computation will be zero because of the selector or not
     *
     * @param polynomials Polynomial or simulated container
     * @param i Gate index
     * @return q_range[i] != 0
     */
    inline static bool gate_enabled(PolyContainer& polynomials, const size_t i = 0)
    {
        const Field& q_range =
            Getters::template get_value<EvaluationType::NON_SHIFTED, PolynomialIndex::Q_RANGE>(polynomials, i);
        return !q_range.is_zero();
    }

    inline static std::set<PolynomialIndex> const& get_required_polynomial_ids()
    {
        static const std::set<PolynomialIndex> required_polynomial_ids = { PolynomialIndex::Q_RANGE,
                                                                           PolynomialIndex::W_1,
                                                                           PolynomialIndex::W_2,
                                                                           PolynomialIndex::W_3,
                                                                           PolynomialIndex::W_4 };
        return required_polynomial_ids;
    }

    inline static void compute_linear_terms(PolyContainer& polynomials,
                                            const challenge_array& challenges,
                                            coefficient_array& linear_terms,
                                            const size_t i = 0)
    {
        constexpr barretenberg::fr minus_two(-2);
        constexpr barretenberg::fr minus_three(-3);

        const Field& alpha_base = challenges.alpha_powers[0];
        const Field& alpha = challenges.elements[ChallengeIndex::ALPHA];
        const Field& w_1 =
            Getters::template get_value<EvaluationType::NON_SHIFTED, PolynomialIndex::W_1>(polynomials, i);
        const Field& w_2 =
            Getters::template get_value<EvaluationType::NON_SHIFTED, PolynomialIndex::W_2>(polynomials, i);
        const Field& w_3 =
            Getters::template get_value<EvaluationType::NON_SHIFTED, PolynomialIndex::W_3>(polynomials, i);
        const Field& w_4 =
            Getters::template get_value<EvaluationType::NON_SHIFTED, PolynomialIndex::W_4>(polynomials, i);
        const Field& w_4_omega =
            Getters::template get_value<EvaluationType::SHIFTED, PolynomialIndex::W_4>(polynomials, i);

        Field alpha_a = alpha_base;
        Field alpha_b = alpha_a * alpha;
        Field alpha_c = alpha_b * alpha;
        Field alpha_d = alpha_c * alpha;

        Field delta_1 = w_4 + w_4;
        delta_1 += delta_1;
        delta_1 = w_3 - delta_1;

        Field delta_2 = w_3 + w_3;
        delta_2 += delta_2;
        delta_2 = w_2 - delta_2;

        Field delta_3 = w_2 + w_2;
        delta_3 += delta_3;
        delta_3 = w_1 - delta_3;

        Field delta_4 = w_1 + w_1;
        delta_4 += delta_4;
        delta_4 = w_4_omega - delta_4;

        // D(D - 1)(D - 2)(D - 3).alpha
        Field T0 = delta_1.sqr();
        T0 -= delta_1;
        Field T1 = delta_1 + minus_two;
        T0 *= T1;
        T1 = delta_1 + minus_three;
        T0 *= T1;
        Field range_accumulator = T0 * alpha_a;

        T0 = delta_2.sqr();
        T0 -= delta_2;
        T1 = delta_2 + minus_two;
        T0 *= T1;
        T1 = delta_2 + minus_three;
        T0 *= T1;
        T0 *= alpha_b;
        range_accumulator += T0;

        T0 = delta_3.sqr();
        T0 -= delta_3;
        T1 = delta_3 + minus_two;
        T0 *= T1;
        T1 = delta_3 + minus_three;
        T0 *= T1;
        T0 *= alpha_c;
        range_accumulator += T0;

        T0 = delta_4.sqr();
        T0 -= delta_4;
        T1 = delta_4 + minus_two;
        T0 *= T1;
        T1 = delta_4 + minus_three;
        T0 *= T1;
        T0 *= alpha_d;
        range_accumulator += T0;

        linear_terms[0] = range_accumulator;
    }

    inline static void compute_non_linear_terms(PolyContainer&, const challenge_array&, Field&, const size_t = 0) {}

    inline static Field sum_linear_terms(PolyContainer& polynomials,
                                         const challenge_array&,
                                         coefficient_array& linear_terms,
                                         const size_t i = 0)
    {
        const Field& q_range =
            Getters::template get_value<EvaluationType::NON_SHIFTED, PolynomialIndex::Q_RANGE>(polynomials, i);

        return linear_terms[0] * q_range;
    }

    inline static void update_kate_opening_scalars(coefficient_array& linear_terms,
                                                   std::map<std::string, Field>& scalars,
                                                   const challenge_array&)
    {
        scalars["Q_RANGE"] += linear_terms[0];
    }
};

} // namespace widget

template <typename Settings>
using ProverTurboRangeWidget = widget::TransitionWidget<barretenberg::fr, Settings, widget::TurboRangeKernel>;

template <typename Field, typename Group, typename Transcript, typename Settings>
using VerifierTurboRangeWidget = widget::GenericVerifierWidget<Field, Transcript, Settings, widget::TurboRangeKernel>;

} // namespace proof_system::plonk