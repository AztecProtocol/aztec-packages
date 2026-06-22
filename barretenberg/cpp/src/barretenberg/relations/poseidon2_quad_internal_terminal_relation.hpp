#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Terminal variant of the K=4 compressed internal-round relation.
 *
 * @details Same four-round closed-form computation as `Poseidon2QuadInternalRelationImpl`, but
 * the successor is the standard-encoded first final-external row rather than another compressed
 * row. The four subrelations directly match (out_0, out_1, out_2, out_3) against
 * (w_l_shift, w_r_shift, w_o_shift, w_4_shift).
 *
 * This ties the compressed chain's output state (state[0..3] after 56 internal rounds) to
 * witnesses that the first final-external gate consumes via shared witness indices.
 *
 * Selector layout on the terminal row:
 *     q_l = c_{4i}, q_r = c_{4i+1}, q_o = c_{4i+2}, q_4 = c_{4i+3}   // this final quad
 *     q_m, q_c, q_5 = 0 (unused — no next quad)
 */
template <typename FF_> class Poseidon2QuadInternalTerminalRelationImpl {
  public:
    using FF = FF_;
    using QuadParams = crypto::Poseidon2QuadBn254Params;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{ 7, 7, 7, 7 };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in[AllEntities::EntityId::q_poseidon2_quad_internal_terminal].is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters& /*params*/,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        const auto w_l = CoeffAcc(in[AllEntities::EntityId::w_l]);
        const auto w_r = CoeffAcc(in[AllEntities::EntityId::w_r]);
        const auto w_o = CoeffAcc(in[AllEntities::EntityId::w_o]);
        const auto w_4 = CoeffAcc(in[AllEntities::EntityId::w_4]);

        const auto w_l_shift = CoeffAcc(in[AllEntities::EntityId::w_l_shift]);
        const auto w_r_shift = CoeffAcc(in[AllEntities::EntityId::w_r_shift]);
        const auto w_o_shift = CoeffAcc(in[AllEntities::EntityId::w_o_shift]);
        const auto w_4_shift = CoeffAcc(in[AllEntities::EntityId::w_4_shift]);

        const auto q_l = CoeffAcc(in[AllEntities::EntityId::q_l]);
        const auto q_r = CoeffAcc(in[AllEntities::EntityId::q_r]);
        const auto q_o = CoeffAcc(in[AllEntities::EntityId::q_o]);
        const auto q_4 = CoeffAcc(in[AllEntities::EntityId::q_4]);

        const auto q_sel = CoeffAcc(in[AllEntities::EntityId::q_poseidon2_quad_internal_terminal]);

        auto pow5 = [](const Accumulator& x) -> Accumulator {
            auto sq = x.sqr();
            auto quart = sq.sqr();
            return quart * x;
        };

        // S-boxes for the four rounds.
        auto u_0 = pow5(Accumulator(w_l + q_l));
        auto u_1 = pow5(Accumulator(w_r + q_r));
        auto u_2 = pow5(Accumulator(w_o + q_o));
        auto u_3 = pow5(Accumulator(w_4 + q_4));

        // Closed-form output rows, with shifted successor-row terms folded into the wire part.
        const auto& C = QuadParams::tables.closed_form;
        auto wp_0 = w_r * C[0][0] + w_o * C[0][1] + w_4 * C[0][2] - w_l_shift;
        auto wp_1 = w_r * C[1][0] + w_o * C[1][1] + w_4 * C[1][2] - w_r_shift;
        auto wp_2 = w_r * C[2][0] + w_o * C[2][1] + w_4 * C[2][2] - w_o_shift;
        auto wp_3 = w_r * C[3][0] + w_o * C[3][1] + w_4 * C[3][2] - w_4_shift;

        const auto q_by_scaling_m = q_sel * scaling_factor;
        const auto q_by_scaling = Accumulator(q_by_scaling_m);

        // Subrelation bodies: out_k - w_*_shift = 0.
        auto a0_body = u_0 * C[0][3] + u_1 * C[0][4] + u_2 * C[0][5] + u_3 * C[0][6] + Accumulator(wp_0);
        auto a1_body = u_0 * C[1][3] + u_1 * C[1][4] + u_2 * C[1][5] + u_3 + Accumulator(wp_1);
        auto a2_body = u_0 * C[2][3] + u_1 * C[2][4] + u_2 * C[2][5] + u_3 + Accumulator(wp_2);
        auto a3_body = u_0 * C[3][3] + u_1 * C[3][4] + u_2 * C[3][5] + u_3 + Accumulator(wp_3);

        std::get<0>(evals) += q_by_scaling * a0_body;
        std::get<1>(evals) += q_by_scaling * a1_body;
        std::get<2>(evals) += q_by_scaling * a2_body;
        std::get<3>(evals) += q_by_scaling * a3_body;
    }
};

template <typename FF>
using Poseidon2QuadInternalTerminalRelation = Relation<Poseidon2QuadInternalTerminalRelationImpl<FF>>;

} // namespace bb
