#pragma once
#include "barretenberg/relations/relation_types.hpp"
namespace bb {

/**
 * @brief Mega-only external-round Poseidon2 relation with committed-square S-boxes.
 *
 * @details Same external-round linear layer as `Poseidon2ExternalRelationImpl`, but the pow5 is
 * realised via committed squares:
 *     u_k = z_k² · (w_k + c_k),   with z_k enforced on this row by a separate z-check subrel.
 * This drops each main subrelation from degree 6 to degree 4 (before selector), so after the
 * q_sel multiplication the partial length lands at 5 instead of 7. The four added z-check
 * subrels are at partial length 4 (body `q_sel · (z_k − (w_k+c_k)²)` is degree 3).
 *
 * Kept separate from `Poseidon2ExternalRelation` so Ultra (which does not migrate to z-commits)
 * is unaffected — Ultra's internal relation is still pow5 so Ultra would pay the z-polynomial
 * baggage without a degree win.
 */
template <typename FF_> class Poseidon2ExternalMegaRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 8> SUBRELATION_PARTIAL_LENGTHS{
        5, // A_0: v_1 - w_{1,shift}   (main external row, degree 3 body · selector)
        5, // A_1: v_2 - w_{2,shift}
        5, // A_2: v_3 - w_{3,shift}
        5, // A_3: v_4 - w_{4,shift}
        4, // z_l - (w_l + c_1)^2      (z-check, degree 2 body · selector)
        4, // z_r - (w_r + c_2)^2
        4, // z_o - (w_o + c_3)^2
        4, // z_4 - (w_4 + c_4)^2
    };

    template <typename AllEntities> static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_external.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters& /*unused*/,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto w_1 = CoefficientAccumulator(in.w_l);
        const auto w_2 = CoefficientAccumulator(in.w_r);
        const auto w_3 = CoefficientAccumulator(in.w_o);
        const auto w_4 = CoefficientAccumulator(in.w_4);
        const auto w_1_shift = CoefficientAccumulator(in.w_l_shift);
        const auto w_2_shift = CoefficientAccumulator(in.w_r_shift);
        const auto w_3_shift = CoefficientAccumulator(in.w_o_shift);
        const auto w_4_shift = CoefficientAccumulator(in.w_4_shift);
        const auto c_1 = CoefficientAccumulator(in.q_l);
        const auto c_2 = CoefficientAccumulator(in.q_r);
        const auto c_3 = CoefficientAccumulator(in.q_o);
        const auto c_4 = CoefficientAccumulator(in.q_4);
        const auto z_1 = CoefficientAccumulator(in.z_l);
        const auto z_2 = CoefficientAccumulator(in.z_r);
        const auto z_3 = CoefficientAccumulator(in.z_o);
        const auto z_4 = CoefficientAccumulator(in.z_4);
        const auto q_poseidon2_external = CoefficientAccumulator(in.q_poseidon2_external);

        // Keep (w_k + c_k) in CoefficientAccumulator so z-check subrels (length 4) can
        // be constructed at their native degree; u_k uses z_k² (CA square) · x_k (Lagrange).
        auto x1_ca = w_1 + c_1;
        auto x2_ca = w_2 + c_2;
        auto x3_ca = w_3 + c_3;
        auto x4_ca = w_4 + c_4;
        auto u1 = Accumulator(z_1 * z_1) * Accumulator(x1_ca);
        auto u2 = Accumulator(z_2 * z_2) * Accumulator(x2_ca);
        auto u3 = Accumulator(z_3 * z_3) * Accumulator(x3_ca);
        auto u4 = Accumulator(z_4 * z_4) * Accumulator(x4_ca);

        // Matrix mul v = M_E * u with 14 additions. Precompute common summands.
        auto t0 = u1 + u2; // u_1 + u_2
        auto t1 = u3 + u4; // u_3 + u_4
        auto t2 = u2 + u2; // 2u_2
        t2 += t1;          // 2u_2 + u_3 + u_4
        auto t3 = u4 + u4; // 2u_4
        t3 += t0;          // u_1 + u_2 + 2u_4

        auto v4 = t1 + t1;
        v4 += v4;
        v4 += t3;

        auto v2 = t0 + t0;
        v2 += v2;
        v2 += t2;
        auto v1 = t3 + v2;

        auto v3 = t2 + v4;

        auto q_pos_by_scaling_ca = q_poseidon2_external * scaling_factor;
        auto q_pos_by_scaling = Accumulator(q_pos_by_scaling_ca);
        std::get<0>(evals) += q_pos_by_scaling * (v1 - Accumulator(w_1_shift));
        std::get<1>(evals) += q_pos_by_scaling * (v2 - Accumulator(w_2_shift));
        std::get<2>(evals) += q_pos_by_scaling * (v3 - Accumulator(w_3_shift));
        std::get<3>(evals) += q_pos_by_scaling * (v4 - Accumulator(w_4_shift));

        // Z-check subrels: compute x²−z in CA (one CA×CA mul → length-3 CA deg 2),
        // promote to length-4 Accumulator, and subtract with -= to flip sign (avoids a
        // length-2 − length-3 CA subtraction that would truncate the quadratic coefficient).
        using ZCheckAccumulator = std::tuple_element_t<4, ContainerOverSubrelations>;
        auto q_pos_by_scaling_zc = ZCheckAccumulator(q_pos_by_scaling_ca);
        std::get<4>(evals) -= q_pos_by_scaling_zc * ZCheckAccumulator(x1_ca * x1_ca - z_1);
        std::get<5>(evals) -= q_pos_by_scaling_zc * ZCheckAccumulator(x2_ca * x2_ca - z_2);
        std::get<6>(evals) -= q_pos_by_scaling_zc * ZCheckAccumulator(x3_ca * x3_ca - z_3);
        std::get<7>(evals) -= q_pos_by_scaling_zc * ZCheckAccumulator(x4_ca * x4_ca - z_4);
    }
};

template <typename FF> using Poseidon2ExternalMegaRelation = Relation<Poseidon2ExternalMegaRelationImpl<FF>>;
} // namespace bb
