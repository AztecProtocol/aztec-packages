// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class EllipticRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        6, // x-coordinate sub-relation
        6, // y-coordinate sub-relation
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in) { return in.q_elliptic.is_zero(); }

    // TODO(@zac-williamson #2609 find more generic way of doing this)
    static constexpr FF get_curve_b()
    {
        if constexpr (FF::modulus == bb::fq::modulus) {
            return bb::g1::curve_b;
        } else if constexpr (FF::modulus == grumpkin::fq::modulus) {
            return grumpkin::g1::curve_b;
        } else {
            return 0;
        }
    }

    /**
     * @brief Expression for elliptic curve point addition and doubling.
     * @details This relation implements elliptic curve operations in short Weierstrass form: y^2 = x^3 + b
     *
     * The relation supports both point addition and point doubling, controlled by q_is_double (q_l).
     * - When q_is_double = 0: Point addition is performed
     * - When q_is_double = 1: Point doubling is performed
     *
     * Point Addition/Subtraction:
     * ---------------
     * For adding/subtracting two distinct points (x1, y1) and (x2, y2) to get (x3, y3):
     *
     * Let lambda = (q_sign * y2 - y1)/(x2 - x1)
     * X-coordinate check (Contribution 1):
     * - Formula: x3 = lambda^2 - (x1 + x2)
     * - Constraint: (x3 + x2 + x1)(x2 - x1)^2 - y2^2 - y1^2 + 2(y2*y1)*q_sign = 0
     *
     * Y-coordinate check (Contribution 2):
     * - Formula: y3 = lambda * (x1 - x3) - y1
     * - Constraint: (y1 + y3)(x2 - x1) + (x3 - x1)(q_sign * y2 - y1) = 0
     *
     * Note: Both constraints are toggled on/off via multiplication by q_elliptic * (1 - q_is_double).
     *
     * Point Doubling:
     * ---------------
     * For doubling point (x1, y1) to get (x3, y3):
     *
     * Let lambda = 3*x1^2 / (2*y1)
     * X-coordinate check (Contribution 3):
     * - Formula: x3 = lambda^2 - 2*x1
     * - Constraint: (x3 + x1 + x1)(4y1^2) - 9x1^4 = 0
     * - Note: we use the curve equation x1^3 = y1^2 - b to reduce degree of last term from 4 to 3:
     *   (x3 + x1 + x1)(4y1^2) - 9x1(y1^2 - b) = 0
     *
     * Y-coordinate check (Contribution 4):
     * - Formula: y3 = lambda * (x1 - x3) - y1
     * - Constraint: (y1 + y3)(2y1) - (3x1^2)(x1 - x3) = 0
     *
     * @param accumulators transformed to `accumulators + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to accumulators.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& accumulators,
                                  const AllEntities& in,
                                  const Parameters&,
                                  const FF& scaling_factor)
    {
        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        auto x_3_m = CoefficientAccumulator(in.w_r_shift);
        auto y_1_m = CoefficientAccumulator(in.w_o);
        auto y_2_m = CoefficientAccumulator(in.w_4_shift);

        auto x_1_m = CoefficientAccumulator(in.w_r);
        auto x_2_m = CoefficientAccumulator(in.w_l_shift);
        auto y_3_m = CoefficientAccumulator(in.w_o_shift);
        auto q_elliptic_m = CoefficientAccumulator(in.q_elliptic);
        auto q_is_double_m = CoefficientAccumulator(in.q_m);
        auto q_sign_m = CoefficientAccumulator(in.q_l);

        // We efficiently construct the following:
        auto x2_sub_x1_m = (x_2_m - x_1_m);                         // (x2 - x1)
        auto x1_mul_3_m = (x_1_m + x_1_m + x_1_m);                  // (3*x1)
        auto x3_sub_x1_m = x_3_m - x_1_m;                           // (x3 - x1)
        auto x3_plus_two_x1_m = x3_sub_x1_m + x1_mul_3_m;           // (x3 - x1 + 3*x1) = (x3 + 2*x1)
        auto x3_plus_x2_plus_x1_m = x3_plus_two_x1_m + x2_sub_x1_m; // (x3 + 2*x1 + x2 - x1) = (x3 + x2 + x1)
        Accumulator x3_plus_x2_plus_x1(x3_plus_x2_plus_x1_m);
        Accumulator x3_sub_x1(x3_sub_x1_m);
        Accumulator x1_mul_3(x1_mul_3_m);
        Accumulator x3_plus_two_x1(x3_plus_two_x1_m);

        // Contribution (1) point addition, x-coordinate check:
        // q_elliptic * (q_is_double - 1) * (x3 + x2 + x1)(x2 - x1)(x2 - x1) - y2^2 - y1^2 + 2(y2y1)*q_sign = 0
        auto y2_sqr_m = y_2_m.sqr();
        auto y1_sqr_m = y_1_m.sqr();
        auto y2_mul_q_sign_m = y_2_m * q_sign_m;
        auto x_add_identity = x3_plus_x2_plus_x1 * Accumulator(x2_sub_x1_m.sqr()) - Accumulator(y2_sqr_m + y1_sqr_m) +
                              Accumulator(y2_mul_q_sign_m + y2_mul_q_sign_m) * Accumulator(y_1_m);

        auto q_elliptic_by_scaling_m = q_elliptic_m * scaling_factor;                   // a * q_elliptic
        auto q_elliptic_q_double_scaling_m = (q_elliptic_by_scaling_m * q_is_double_m); // a * q_elliptic * q_is_double
        Accumulator q_elliptic_q_double_scaling(q_elliptic_q_double_scaling_m);
        // (a * q_elliptic * q_is_double - a * q_elliptic) = a * q_elliptic * (q_is_double - 1)
        auto neg_q_elliptic_not_double_scaling = Accumulator(q_elliptic_q_double_scaling_m - q_elliptic_by_scaling_m);
        std::get<0>(accumulators) -= x_add_identity * neg_q_elliptic_not_double_scaling;

        // Contribution (2) point addition, x-coordinate check:
        // q_elliptic *  (q_is_double - 1) * (y1 + y3)(x2 - x1) + (x3 - x1)(q_sign * y2 - y1) = 0
        auto y1_plus_y3_m = y_1_m + y_3_m;       // (y1 + y3)
        auto y_diff_m = y2_mul_q_sign_m - y_1_m; // (q_sign * y2 - y1)
        auto y_diff = Accumulator(y_diff_m);
        auto y_add_identity = Accumulator(y1_plus_y3_m * x2_sub_x1_m) + (x3_sub_x1)*y_diff;
        std::get<1>(accumulators) -= y_add_identity * neg_q_elliptic_not_double_scaling;

        // Contribution (3) point doubling, x-coordinate check
        // (x3 + x1 + x1) (4*y1*y1) - 9 * x1 * x1 * x1 * x1 = 0
        // N.B. we're using the equivalence x1^3 === y1^2 - curve_b to reduce degree by 1
        const auto curve_b = get_curve_b();
        auto x_pow_4_mul_3 = (Accumulator(y1_sqr_m - curve_b)) * x1_mul_3;
        auto y1_sqr_mul_4_m = y1_sqr_m + y1_sqr_m;
        y1_sqr_mul_4_m += y1_sqr_mul_4_m;
        auto x1_pow_4_mul_9 = x_pow_4_mul_3 + x_pow_4_mul_3 + x_pow_4_mul_3;
        auto x_double_identity = x3_plus_two_x1 * Accumulator(y1_sqr_mul_4_m) - x1_pow_4_mul_9;
        std::get<0>(accumulators) += x_double_identity * q_elliptic_q_double_scaling;

        // Contribution (4) point doubling, y-coordinate check
        // (y1 + y3) (2*y1) - (3 * x1 * x1)(x1 - x3) = 0
        auto x1_sqr_mul_3 = Accumulator(x1_mul_3_m * x_1_m);
        auto neg_y_double_identity = x1_sqr_mul_3 * (x3_sub_x1) + Accumulator((y_1_m + y_1_m) * (y1_plus_y3_m));
        std::get<1>(accumulators) -= neg_y_double_identity * q_elliptic_q_double_scaling;
    };
};

template <typename FF> using EllipticRelation = Relation<EllipticRelationImpl<FF>>;
} // namespace bb
