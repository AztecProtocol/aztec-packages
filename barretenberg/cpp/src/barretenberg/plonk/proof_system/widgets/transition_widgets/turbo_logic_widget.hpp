#pragma once

#include "./transition_widget.hpp"

namespace proof_system::plonk {
namespace widget {

template <class Field, class Getters, typename PolyContainer> class TurboLogicKernel {
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
    inline static std::set<PolynomialIndex> const& get_required_polynomial_ids()
    {
        static const std::set<PolynomialIndex> required_polynomial_ids = {
            PolynomialIndex::Q_C, PolynomialIndex::Q_LOGIC, PolynomialIndex::W_1,
            PolynomialIndex::W_2, PolynomialIndex::W_3,     PolynomialIndex::W_4
        };
        return required_polynomial_ids;
    }

    /**
     * @brief Quickly checks if the result of all computation will be zero because of the selector or not
     *
     * @param polynomials Polynomial or simulated container
     * @param i Gate index
     * @return q_logic[i] != 0
     */
    inline static bool gate_enabled(PolyContainer& polynomials, const size_t i = 0)
    {
        const Field& q_logic =
            Getters::template get_value<EvaluationType::NON_SHIFTED, PolynomialIndex::Q_LOGIC>(polynomials, i);
        return !q_logic.is_zero();
    }

    inline static void compute_linear_terms(PolyContainer& polynomials,
                                            const challenge_array& challenges,
                                            coefficient_array& linear_terms,
                                            const size_t i = 0)
    {
        constexpr barretenberg::fr six(6);
        constexpr barretenberg::fr eighty_one(81);
        constexpr barretenberg::fr eighty_three(83);

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
        const Field& w_1_omega =
            Getters::template get_value<EvaluationType::SHIFTED, PolynomialIndex::W_1>(polynomials, i);
        const Field& w_2_omega =
            Getters::template get_value<EvaluationType::SHIFTED, PolynomialIndex::W_2>(polynomials, i);
        const Field& w_4_omega =
            Getters::template get_value<EvaluationType::SHIFTED, PolynomialIndex::W_4>(polynomials, i);

        const Field& q_c =
            Getters::template get_value<EvaluationType::NON_SHIFTED, PolynomialIndex::Q_C>(polynomials, i);

        Field delta_sum;
        Field delta_squared_sum;
        Field T0;
        Field T1;
        Field T2;
        Field T3;
        Field T4;
        Field identity;

        T0 = w_1 + w_1;
        T0 += T0;
        T0 = w_1_omega - T0;

        // T1 = b
        T1 = w_2 + w_2;
        T1 += T1;
        T1 = w_2_omega - T1;

        // delta_sum = a + b
        delta_sum = T0 + T1;

        // T2 = a^2, T3 = b^2
        T2 = T0.sqr();
        T3 = T1.sqr();

        delta_squared_sum = T2 + T3;

        // identity = a^2 + b^2 + 2ab
        identity = delta_sum.sqr();
        // identity = 2ab
        identity -= delta_squared_sum;

        // identity = 2(ab - w)
        T4 = w_3 + w_3;
        identity -= T4;
        identity *= alpha;

        // T4 = 4w
        T4 += T4;

        // T2 = a^2 - a
        T2 -= T0;

        // T0 = a^2 - 5a + 6
        T0 += T0;
        T0 += T0;
        T0 = T2 - T0;
        T0 += six;

        // identity = (identity + a(a - 1)(a - 2)(a - 3)) * alpha
        T0 *= T2;
        identity += T0;
        identity *= alpha;

        // T3 = b^2 - b
        T3 -= T1;

        // T1 = b^2 - 5b + 6
        T1 += T1;
        T1 += T1;
        T1 = T3 - T1;
        T1 += six;

        // identity = (identity + b(b - 1)(b - 2)(b - 3)) * alpha
        T1 *= T3;
        identity += T1;
        identity *= alpha;

        // T0 = 3(a + b)
        T0 = delta_sum + delta_sum;
        T0 += delta_sum;

        // T1 = 9(a + b)
        T1 = T0 + T0;
        T1 += T0;

        // delta_sum = 18(a + b)
        delta_sum = T1 + T1;

        // T1 = 81(a + b)
        T2 = delta_sum + delta_sum;
        T2 += T2;
        T1 += T2;

        // delta_squared_sum = 18(a^2 + b^2)
        T2 = delta_squared_sum + delta_squared_sum;
        T2 += delta_squared_sum;
        delta_squared_sum = T2 + T2;
        delta_squared_sum += T2;
        delta_squared_sum += delta_squared_sum;

        // delta_sum = w(4w - 18(a + b) + 81)
        delta_sum = T4 - delta_sum;
        delta_sum += eighty_one;
        delta_sum *= w_3;

        // T1 = 18(a^2 + b^2) - 81(a + b) + 83
        T1 = delta_squared_sum - T1;
        T1 += eighty_three;

        // delta_sum = w ( w ( 4w - 18(a + b) + 81) + 18(a^2 + b^2) - 81(a + b) + 83)
        delta_sum += T1;
        delta_sum *= w_3;

        // T2 = 3c
        T2 = w_4 + w_4;
        T2 += T2;
        T2 = w_4_omega - T2;
        T3 = T2 + T2;
        T2 += T3;

        // T3 = 9c
        T3 = T2 + T2;
        T3 += T2;

        // T3 = q_c * (9c - 3(a + b))
        T3 -= T0;
        T3 *= q_c;

        // T2 = 3c + 3(a + b) - 2 * delta_sum
        T2 += T0;
        delta_sum += delta_sum;
        T2 -= delta_sum;

        // T2 = T2 + T3
        T2 += T3;

        // identity = q_logic * alpha_base * (identity + T2)
        identity += T2;
        identity *= alpha_base;

        linear_terms[0] = identity;
    }

    inline static void compute_non_linear_terms(PolyContainer&, const challenge_array&, Field&, const size_t = 0) {}

    inline static Field sum_linear_terms(PolyContainer& polynomials,
                                         const challenge_array&,
                                         coefficient_array& linear_terms,
                                         const size_t i = 0)
    {
        const Field& q_logic =
            Getters::template get_value<EvaluationType::NON_SHIFTED, PolynomialIndex::Q_LOGIC>(polynomials, i);

        return linear_terms[0] * q_logic;
    }

    inline static void update_kate_opening_scalars(coefficient_array& linear_terms,
                                                   std::map<std::string, Field>& scalars,
                                                   const challenge_array&)
    {
        scalars["Q_LOGIC"] += linear_terms[0];
    }
};

} // namespace widget

template <typename Settings>
using ProverTurboLogicWidget = widget::TransitionWidget<barretenberg::fr, Settings, widget::TurboLogicKernel>;

template <typename Field, typename Group, typename Transcript, typename Settings>
using VerifierTurboLogicWidget = widget::GenericVerifierWidget<Field, Transcript, Settings, widget::TurboLogicKernel>;

} // namespace proof_system::plonk