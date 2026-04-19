#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Entry transition relation for the K=4 compressed Poseidon2 internal block, 7-wire variant.
 *
 * @details The entry row holds the external-round output in standard encoding:
 *     (w_l, w_r, w_o, w_4) = (s_0, s_1, s_2, s_3) at internal round 0
 * (copy-constrained via shared witness indices with the `poseidon2_external` propagate row).
 *
 * The successor is the first compressed row; its committed extra wires are:
 *     (w_p2_s1_shift, w_p2_s2_shift, w_p2_s3_shift) = state[1..3] at round 0
 *
 * Only these three bindings are enforced here:
 *
 *     A_0:  w_p2_s1_shift - w_r = 0
 *     A_1:  w_p2_s2_shift - w_o = 0
 *     A_2:  w_p2_s3_shift - w_4 = 0
 *
 * The remaining two bindings for the successor row are NOT enforced here and are redundant
 * with constraints that fire elsewhere:
 *
 *   - Successor's w_l = s_0 is handled by sigma (the stdlib permutation emits both the entry
 *     gate's w_l and the first compressed row's w_l with the same witness index, so the
 *     permutation argument binds them).
 *
 *   - Successor's (w_r, w_o, w_4) = state[0] at rounds 1, 2, 3 are re-pinned by the first
 *     compressed row's own `Poseidon2DoubleInternalRelation` subrelations A_0/A_1/A_2 acting
 *     on that row directly. Under A_0..A_2 here + sigma on w_l, those equations coincide
 *     algebraically with the "reach-forward-via-shifts" formulation that an earlier draft of
 *     this relation enforced redundantly.
 *
 * Round constants q_l, q_r, q_o (the next-row-firewall S-box constants) are therefore no
 * longer read by this relation.
 */
template <typename FF_> class Poseidon2TransitionEntryRelationImpl {
  public:
    using FF = FF_;

    // Each subrelation body is `q_sel * scaling_factor * (wire - shifted_wire)` — degree 1 in
    // the polynomials, times selector (+1) and gate separator (+1) → partial length 3.
    static constexpr std::array<size_t, 3> SUBRELATION_PARTIAL_LENGTHS{
        3, // A_0: w_p2_s1_shift - w_r
        3, // A_1: w_p2_s2_shift - w_o
        3, // A_2: w_p2_s3_shift - w_4
    };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_transition_entry.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoeffAcc = typename Accumulator::CoefficientAccumulator;

        const auto w_r = CoeffAcc(in.w_r);
        const auto w_o = CoeffAcc(in.w_o);
        const auto w_4 = CoeffAcc(in.w_4);

        const auto s1_shift = CoeffAcc(in.w_p2_s1_shift);
        const auto s2_shift = CoeffAcc(in.w_p2_s2_shift);
        const auto s3_shift = CoeffAcc(in.w_p2_s3_shift);

        const auto q_sel = CoeffAcc(in.q_poseidon2_transition_entry);
        const auto q_by_scaling_m = q_sel * scaling_factor;

        // A_0/A_1/A_2: state[1..3] at round 0 of the first compressed row — linear wire-copy
        // from the entry row's standard-encoded state.
        std::get<0>(evals) += Accumulator((w_r - s1_shift) * q_by_scaling_m);
        std::get<1>(evals) += Accumulator((w_o - s2_shift) * q_by_scaling_m);
        std::get<2>(evals) += Accumulator((w_4 - s3_shift) * q_by_scaling_m);
    }
};

template <typename FF> using Poseidon2TransitionEntryRelation = Relation<Poseidon2TransitionEntryRelationImpl<FF>>;

} // namespace bb
