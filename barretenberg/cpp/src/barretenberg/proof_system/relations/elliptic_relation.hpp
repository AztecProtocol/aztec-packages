#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system {

// TODO(@zac-williamson #2609 find more generic way of doing this)
template <typename FF> static constexpr FF get_curve_b()
{
    if constexpr (FF::modulus == barretenberg::fq::modulus) {
        return barretenberg::g1::curve_b;
    } else if constexpr (FF::modulus == grumpkin::fq::modulus) {
        return grumpkin::g1::curve_b;
    } else {
        return 0;
    }
}

template <typename FF_> class EllipticRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 6; // degree(q_elliptic * q_beta * x^3) = 5

    static constexpr size_t LEN_1 = 6; // x-coordinate sub-relation
    static constexpr size_t LEN_2 = 5; // y-coordinate sub-relation
    static constexpr size_t LEN_3 = 5; // y-coordinate sub-relation
    static constexpr size_t LEN_4 = 5; // y-coordinate sub-relation
    template <template <size_t...> typename SubrelationAccumulatorsTemplate>
    using GetAccumulatorTypes = SubrelationAccumulatorsTemplate<LEN_1, LEN_2, LEN_3, LEN_4>;

    /**
     * @brief Expression for the Ultra Arithmetic gate.
     * @details The relation is defined as C(extended_edges(X)...) =
     *    TODO(#429): steal description from elliptic_widget.hpp
     *
     * @param evals transformed to `evals + C(extended_edges(X)...)*scaling_factor`
     * @param extended_edges an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename AccumulatorTypes>
    static void accumulate(typename AccumulatorTypes::Accumulators& accumulators,
                           const auto& extended_edges,
                           const RelationParameters<FF>&,
                           const FF& scaling_factor){
        // OPTIMIZATION?: Karatsuba in general, at least for some degrees?
        //       See https://hackmd.io/xGLuj6biSsCjzQnYN-pEiA?both
        // Note: Formatter turned off since it doesnt properly handle the explicit scoping below.

        /**
        TODO(@zac-williamson #2608 when Pedersen refactor is completed, replace old addition relations with these ones
        and remove endomorphism coefficient in ecc add gate (not used))

        using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
        auto x_1 = View(extended_edges.w_r);
        auto y_1 = View(extended_edges.w_o);

        auto x_2 = View(extended_edges.w_l_shift);
        auto y_2 = View(extended_edges.w_4_shift);
        auto y_3 = View(extended_edges.w_o_shift);
        auto x_3 = View(extended_edges.w_r_shift);

        auto q_sign = View(extended_edges.q_l);
        auto q_elliptic = View(extended_edges.q_elliptic);
        auto q_double = View(extended_edges.q_double);

        // Contribution (1) point addition, x-coordinate check
        // q_elliptic * (x3 + x2 + x1)(x2 - x1)(x2 - x1) - y2^2 - y1^2 + 2(y2y1)*q_sign = 0
        auto x_diff = (x_2 - x_1);
        auto y2_sqr = (y_2 * y_2);
        auto y1_sqr = (y_1 * y_1);
        auto y1y2 = y_1 * y_2 * q_sign;
        auto x_identity = (x_3 + x_2 + x_1) * x_diff * x_diff - y2_sqr - y1_sqr + y1y2 + y1y2;
        std::get<0>(accumulators) += x_identity * scaling_factor * q_elliptic;

        // Contribution (2) point addition, x-coordinate check
        // q_elliptic * (q_sign * y1 + y3)(x2 - x1) + (x3 - x1)(y2 - q_sign * y1) = 0
        auto y1_plus_y3 = y_1 * q_sign + y_3;
        auto y_diff = y_2 - q_sign * y_1;
        auto y_identity = y1_plus_y3 * x_diff + (x_3 - x_1) * y_diff;
        std::get<1>(accumulators) += y_identity * scaling_factor * q_elliptic;
        */

        // clang-format off
        // Contribution (1)
        {
            using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
            auto x_1 = View(extended_edges.w_r);
            auto y_1 = View(extended_edges.w_o);

            auto x_2 = View(extended_edges.w_l_shift);
            auto y_2 = View(extended_edges.w_4_shift);
            auto x_3 = View(extended_edges.w_r_shift);

            auto q_sign = View(extended_edges.q_l);
            auto q_beta = View(extended_edges.q_o);
            auto q_beta_sqr = View(extended_edges.q_4);
            auto q_elliptic = View(extended_edges.q_elliptic);

            auto beta_term = x_2 * x_1 * (x_3 + x_3 + x_1) * FF(-1); // -x_1 * x_2 * (2 * x_3 + x_1)
            auto beta_sqr_term = x_2 * x_2;                          // x_2^2
            auto leftovers = beta_sqr_term;                          // x_2^2
            beta_sqr_term *= (x_3 - x_1);                            // x_2^2 * (x_3 - x_1)
            auto sign_term = y_2 * y_1;                              // y_1 * y_2
            sign_term += sign_term;                                  // 2 * y_1 * y_2
            beta_term *= q_beta;                                     // -β * x_1 * x_2 * (2 * x_3 + x_1)
            beta_sqr_term *= q_beta_sqr;                             // β^2 * x_2^2 * (x_3 - x_1)
            sign_term *= q_sign;                                     // 2 * y_1 * y_2 * sign
            leftovers *= x_2;                                        // x_2^3
            leftovers += x_1 * x_1 * (x_3 + x_1);                    // x_2^3 + x_1 * (x_3 + x_1)
            leftovers -= (y_2 * y_2 + y_1 * y_1);                    // x_2^3 + x_1 * (x_3 + x_1) - y_2^2 - y_1^2

            // Can be found in class description
            auto x_identity = beta_term + beta_sqr_term + sign_term + leftovers;
            x_identity *= q_elliptic;
            x_identity *= scaling_factor;
            std::get<0>(accumulators) += x_identity;
        }
        // Contribution (2)
        {
            using View = typename std::tuple_element<1, typename AccumulatorTypes::AccumulatorViews>::type;
            auto x_1 = View(extended_edges.w_r);
            auto y_1 = View(extended_edges.w_o);

            auto x_2 = View(extended_edges.w_l_shift);
            auto y_2 = View(extended_edges.w_4_shift);
            auto x_3 = View(extended_edges.w_r_shift);
            auto y_3 = View(extended_edges.w_o_shift);

            auto q_sign = View(extended_edges.q_l);
            auto q_beta = View(extended_edges.q_o);
            auto q_elliptic = View(extended_edges.q_elliptic);

            auto beta_term = x_2 * (y_3 + y_1) * q_beta;          // β * x_2 * (y_3 + y_1)
            auto sign_term = y_2 * (x_1 - x_3) * q_sign * FF(-1); // - signt * y_2 * (x_1 - x_3)
            // TODO: remove extra additions if we decide to stay with this implementation
            auto leftovers = x_1 * (y_3 + y_1) * FF(-1) + y_1 * (x_1 - x_3); // -x_1 * y_3 - x_1 * y_1 + y_1 * x_1 - y_1 * x_3

            auto y_identity = beta_term + sign_term + leftovers;
            y_identity *= q_elliptic;
            y_identity *= scaling_factor;
            std::get<1>(accumulators) += y_identity;
        }
        {
            using View = typename std::tuple_element<1, typename AccumulatorTypes::AccumulatorViews>::type;
            auto x_1 = View(extended_edges.w_r);
            auto y_1 = View(extended_edges.w_o);
            auto x_3 = View(extended_edges.w_r_shift);
            auto y_3 = View(extended_edges.w_o_shift);
            auto q_double = View(extended_edges.q_double);

            // Contribution (3) point doubling, x-coordinate check
            // (x3 + x1 + x1) (4y1*y1) - 9 * x1 * x1 * x1 * x1 = 0
            // N.B. we're using the equivalence x1*x1*x1 === y1*y1 - curve_b to reduce degree by 1
            const auto curve_b = get_curve_b<FF>();
            auto y1_sqr = y_1 * y_1;
            auto x_pow_4 = (y1_sqr - curve_b) * x_1;
            auto y1_sqr_mul_4 = y1_sqr + y1_sqr;
            y1_sqr_mul_4 += y1_sqr_mul_4;
            auto x1_pow_4_mul_9 = x_pow_4 * 9;
            auto x_double_identity = (x_3 + x_1 + x_1) * y1_sqr_mul_4 - x1_pow_4_mul_9;
            std::get<2>(accumulators) += x_double_identity * scaling_factor * q_double;

            // Contribution (4) point doubling, y-coordinate check
            // (y1 + y1) (2y1) - (3 * x1 * x1)(x1 - x3) = 0
            auto x1_sqr_mul_3 = (x_1 + x_1 + x_1) * x_1;
            auto y_double_identity = x1_sqr_mul_3 * (x_1 - x_3) - (y_1 + y_1) * (y_1 + y_3);
            std::get<3>(accumulators) += y_double_identity * scaling_factor * q_double;
        }
    };
};

template <typename FF>
using EllipticRelation = Relation<EllipticRelationImpl<FF>>;
// clang-format on
} // namespace proof_system
