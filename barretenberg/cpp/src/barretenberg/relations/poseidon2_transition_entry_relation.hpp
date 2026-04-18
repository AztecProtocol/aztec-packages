#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Entry transition relation between the external block's standard-encoded output and the
 * first row of the compressed double-internal block.
 *
 * @details The first compressed double-internal row stores `state[0]` at round `2i+1` in its `w_r`
 * slot --- a value one internal round ahead of the external block's output. Without a boundary
 * relation, that `w_r` is a free witness and the prover can inject an arbitrary shift in
 * `state[1]` at the boundary, producing a valid-looking chain for a different computation.
 *
 * This relation is placed on a transition row that holds the standard-encoded state
 * `(s_0, s_1, s_2, s_3)` at round `rounds_f_begin` (copy-constrained to the external block's
 * propagate row via shared witness indices). It enforces that the successor row's `w_r_shift`
 * equals `v_0` = `D_1 (s_0 + c)^5 + s_1 + s_2 + s_3`, where `c = c_{rounds_f_begin}` is stored in
 * the row's `q_l` selector.
 *
 * Single subrelation of degree 7:
 *   q_poseidon2_transition_entry * ( w_r_shift - D_1 (w_l + q_l)^5 - w_r - w_o - w_4 ) = 0
 *
 * Here (w_l, w_r, w_o, w_4) is the standard encoding at round `rounds_f_begin` and `w_r_shift`
 * is the first compressed row's `w_r` (= `intermediate_s0`).
 */
template <typename FF_> class Poseidon2TransitionEntryRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 1> SUBRELATION_PARTIAL_LENGTHS{
        7, // w_r_shift - D_1 (w_l + q_l)^5 - w_r - w_o - w_4
    };

    static constexpr fr D1m1 = crypto::Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[0];
    static constexpr fr D1 = fr{ 1 } + D1m1;

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero.
     * @details The entry relation is active on exactly one row per Poseidon2 permutation (the standard-encoded
     * transition row that precedes the first compressed row). Everywhere else the selector is 0, so the prover
     * skips accumulation.
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return (in.q_poseidon2_transition_entry.is_zero());
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator7 = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator7 = typename Accumulator7::CoefficientAccumulator;

        const auto w_l = CoefficientAccumulator7(in.w_l);
        const auto w_r = CoefficientAccumulator7(in.w_r);
        const auto w_o = CoefficientAccumulator7(in.w_o);
        const auto w_4 = CoefficientAccumulator7(in.w_4);
        const auto w_r_shift = CoefficientAccumulator7(in.w_r_shift);
        const auto q_sel = CoefficientAccumulator7(in.q_poseidon2_transition_entry);
        const auto q_l = CoefficientAccumulator7(in.q_l);

        // u = (w_l + q_l)^5
        auto s = Accumulator7(w_l + q_l);
        auto u = s.sqr();
        u = u.sqr();
        u *= s;

        const auto q_by_scaling_m = q_sel * scaling_factor;
        const auto q_by_scaling = Accumulator7(q_by_scaling_m);

        // q_sel * ( w_r_shift - D_1 * u - w_r - w_o - w_4 )
        auto body = Accumulator7(w_r_shift) - (u * D1) - Accumulator7(w_r + w_o + w_4);
        std::get<0>(evals) += q_by_scaling * body;
    };
};

template <typename FF> using Poseidon2TransitionEntryRelation = Relation<Poseidon2TransitionEntryRelationImpl<FF>>;
} // namespace bb
