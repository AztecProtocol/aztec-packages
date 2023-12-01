#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace proof_system {

template <typename FF_> class EllipticRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        6, // x-coordinate sub-relation
        6, // y-coordinate sub-relation
    };

    // TODO(@zac-williamson #2609 find more generic way of doing this)
    static constexpr FF get_curve_b()
    {
        if constexpr (FF::modulus == barretenberg::fq::modulus) {
            return barretenberg::g1::curve_b;
        } else if constexpr (FF::modulus == grumpkin::fq::modulus) {
            return grumpkin::g1::curve_b;
        } else {
            return 0;
        }
    }

    /**
     * @brief Expression for the Ultra Arithmetic gate.
     * @details The relation is defined as C(in(X)...) =
     *    TODO(#429): steal description from elliptic_widget.hpp
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& accumulators,
                                  const AllEntities& in,
                                  const Parameters&,
                                  const FF& scaling_factor)
    {
        // TODO(@zac - williamson #2608 when Pedersen refactor is completed,
        // replace old addition relations with these ones and
        // remove endomorphism coefficient in ecc add gate(not used))

        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        // using View = typename Accumulator::View;
        const Accumulator& x_1 = in.w_r;
        const Accumulator& y_1 = in.w_o;

        const Accumulator& x_2 = in.w_l_shift;
        const Accumulator& y_2 = in.w_4_shift;
        const Accumulator& y_3 = in.w_o_shift;
        const Accumulator& x_3 = in.w_r_shift;

        const Accumulator& q_sign = in.q_l;
        const Accumulator& q_elliptic = in.q_elliptic;
        const Accumulator& q_is_double = in.q_m;

        // Contribution (1) point addition, x-coordinate check
        // q_elliptic * (x3 + x2 + x1)(x2 - x1)(x2 - x1) - y2^2 - y1^2 + 2(y2y1)*q_sign = 0
        Accumulator x_diff = (x_2 - x_1);
        Accumulator y2_sqr = (y_2 * y_2);
        Accumulator y1_sqr = (y_1 * y_1);
        Accumulator y1y2 = y_1 * y_2 * q_sign;
        Accumulator x_add_identity = (x_3 + x_2 + x_1) * x_diff * x_diff - y2_sqr - y1_sqr + y1y2 + y1y2;
        std::get<0>(accumulators) += x_add_identity * scaling_factor * q_elliptic * (-q_is_double + 1);

        // Contribution (2) point addition, x-coordinate check
        // q_elliptic * (q_sign * y1 + y3)(x2 - x1) + (x3 - x1)(y2 - q_sign * y1) = 0
        Accumulator y1_plus_y3 = y_1 + y_3;
        Accumulator y_diff = y_2 * q_sign - y_1;
        Accumulator y_add_identity = y1_plus_y3 * x_diff + (x_3 - x_1) * y_diff;
        std::get<1>(accumulators) += y_add_identity * scaling_factor * q_elliptic * (-q_is_double + 1);

        // Contribution (3) point doubling, x-coordinate check
        // (x3 + x1 + x1) (4y1*y1) - 9 * x1 * x1 * x1 * x1 = 0
        // N.B. we're using the equivalence x1*x1*x1 === y1*y1 - curve_b to reduce degree by 1
        const auto curve_b = get_curve_b();
        Accumulator x_pow_4 = (y1_sqr - curve_b) * x_1;
        Accumulator y1_sqr_mul_4 = y1_sqr + y1_sqr;
        y1_sqr_mul_4 += y1_sqr_mul_4;
        Accumulator x1_pow_4_mul_9 = x_pow_4 * 9;
        Accumulator x_double_identity = (x_3 + x_1 + x_1) * y1_sqr_mul_4 - x1_pow_4_mul_9;
        std::get<0>(accumulators) += x_double_identity * scaling_factor * q_elliptic * q_is_double;

        // Contribution (4) point doubling, y-coordinate check
        // (y1 + y1) (2y1) - (3 * x1 * x1)(x1 - x3) = 0
        Accumulator x1_sqr_mul_3 = (x_1 + x_1 + x_1) * x_1;
        Accumulator y_double_identity = x1_sqr_mul_3 * (x_1 - x_3) - (y_1 + y_1) * (y_1 + y_3);
        std::get<1>(accumulators) += y_double_identity * scaling_factor * q_elliptic * q_is_double;
    };
};

template <typename FF> using EllipticRelation = Relation<EllipticRelationImpl<FF>>;
} // namespace proof_system
