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

        // Square the degree-1 pow5 input in the coefficient basis before promoting -- see
        // UnivariateCoefficientBasis::sqr.
        auto pow5 = [](const auto& x_m) -> Accumulator {
            const Accumulator x(x_m);
            const Accumulator sq(x_m.sqr());
            return sq.sqr() * x;
        };

        // S-boxes for the four rounds.
        auto u_0 = pow5(w_l + q_l);
        auto u_1 = pow5(w_r + q_r);
        auto u_2 = pow5(w_o + q_o);
        auto u_3 = pow5(w_4 + q_4);

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

    /**
     * @brief Prover-only constants of the separator-weighted sum of the four subrelation bodies (see
     * HasProverSubrelationBatching): \f$ \sum_k w_k A_k = \sum_i m_i u_i + \sum_j n_j \cdot \text{wire}_j \f$.
     */
    struct SubrelationBatchingConstants {
        std::array<FF, 4> sbox;  // m_i for u_0, u_1, u_2, u_3
        std::array<FF, 7> wires; // n_j for w_r, w_o, w_4, w_l_shift, w_r_shift, w_o_shift, w_4_shift
    };

    static SubrelationBatchingConstants compute_subrelation_batching_constants(const std::array<FF, 4>& weights)
    {
        const auto& C = QuadParams::tables.closed_form;
        SubrelationBatchingConstants constants;
        for (size_t i = 0; i < 3; ++i) {
            constants.sbox[i] = weights[0] * C[0][3 + i] + weights[1] * C[1][3 + i] + weights[2] * C[2][3 + i] +
                                weights[3] * C[3][3 + i];
            constants.wires[i] =
                weights[0] * C[0][i] + weights[1] * C[1][i] + weights[2] * C[2][i] + weights[3] * C[3][i];
        }
        // u_3 enters A_1, A_2, A_3 with coefficient 1.
        constants.sbox[3] = weights[0] * C[0][6] + weights[1] + weights[2] + weights[3];
        for (size_t k = 0; k < 4; ++k) {
            constants.wires[3 + k] = -weights[k];
        }
        return constants;
    }

    /**
     * @brief Prover-only: add \f$ q \cdot \text{scaling} \cdot \sum_k w_k A_k \f$ into the first subrelation
     * accumulator, folding each S-box constant into the degree-1 factor of x^5 = x^4 \cdot x.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate_with_subrelation_batching(ContainerOverSubrelations& evals,
                                                     const AllEntities& in,
                                                     const Parameters& /*params*/,
                                                     const FF& scaling_factor,
                                                     const SubrelationBatchingConstants& constants)
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

        // m * x^5 = (x^2)^2 * (m * x)
        auto scaled_pow5 = [](const auto& x_m, const FF& m) -> Accumulator {
            const Accumulator sq(x_m.sqr());
            return sq.sqr() * Accumulator(x_m * m);
        };

        auto body = scaled_pow5(w_l + q_l, constants.sbox[0]);
        body += scaled_pow5(w_r + q_r, constants.sbox[1]);
        body += scaled_pow5(w_o + q_o, constants.sbox[2]);
        body += scaled_pow5(w_4 + q_4, constants.sbox[3]);

        auto wires = w_r * constants.wires[0];
        wires += w_o * constants.wires[1];
        wires += w_4 * constants.wires[2];
        wires += w_l_shift * constants.wires[3];
        wires += w_r_shift * constants.wires[4];
        wires += w_o_shift * constants.wires[5];
        wires += w_4_shift * constants.wires[6];
        body += Accumulator(wires);

        std::get<0>(evals) += Accumulator(q_sel * scaling_factor) * body;
    }
};

template <typename FF>
using Poseidon2QuadInternalTerminalRelation = Relation<Poseidon2QuadInternalTerminalRelationImpl<FF>>;

} // namespace bb
