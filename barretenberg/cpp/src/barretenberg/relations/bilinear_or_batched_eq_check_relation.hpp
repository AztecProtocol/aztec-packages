// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Bilinear / batched-eq custom gate (Mega flavors only).
 *
 * @details One precomputed selector `q_bilinear_batched_eq` ∈ {0, 1, 2} multiplexes two row-modes:
 *   - q_bilinear_batched_eq = 0: gate off
 *   - q_bilinear_batched_eq = 1: BILINEAR mode — enforces the shared-wire two-product identity
 *         q_m · w_l · w_r + q_5 · w_l · w_o + q_l · w_l + q_r · w_r + q_o · w_o + q_4 · w_4 + q_c = 0
 *     i.e. two products sharing the wire w_l (= w_l · (q_m · w_r + q_5 · w_o)), a linear term on each of
 *     the four wires, and a constant. The fourth wire w_4 appears only in its linear term.
 *   - q_bilinear_batched_eq = 2: BATCHED_EQ mode — enforces two independent linear equalities:
 *         (q_l · w_l + q_r · w_r + q_c) = 0      (batched-eq-half-1)
 *         (q_o · w_o + q_4 · w_4 + q_m) = 0      (batched-eq-half-2)
 *     q_m is repurposed as the second batched-eq constant.
 *
 * The second product uses the `q_5` selector, which is committed only in the Mega flavors (shared with
 * the poseidon2-quad relations), so this relation is part of the Mega flavors only.
 *
 * Two subrelations:
 *
 * Subrelation 1:
 *      q_cp · (2 − q_cp) · (q_m·w_l·w_r + q_5·w_l·w_o + q_l·w_l + q_r·w_r + q_o·w_o + q_4·w_4 + q_c)
 *    + q_cp · (q_cp − 1) · (q_l · w_l + q_r · w_r + q_c)
 *
 * Subrelation 2:
 *      q_cp · (q_cp − 1) · (q_o · w_o + q_4 · w_4 + q_m)
 *
 * Mode evaluation:
 *  - q_cp = 1 → sub 1 = 1·(2−1)·bilinear + 1·0·(…) = bilinear
 *               sub 2 = 1·0·(…) = 0
 *  - q_cp = 2 → sub 1 = 2·0·(…) + 2·1·batched_eq_half_1 = 2 · batched_eq_half_1
 *               sub 2 = 2·1·batched_eq_half_2           = 2 · batched_eq_half_2
 *  - q_cp = 0 → both subrelations identically zero.
 *
 * The BATCHED_EQ-mode factor of 2 is absorbed by scaling batched_eq_half_1 and batched_eq_half_2 by `half` inside the
 * relation, so the builder writes q_l..q_5, q_c, q_m raw — no caller-side scaling. BILINEAR mode is
 * gated by q_cp·(2−q_cp), which evaluates to 1 at q_cp = 1, so its selectors are also written raw.
 *
 * Trace placement: shares the existing `arithmetic` block (q_arith and q_bilinear_batched_eq are mutually
 * exclusive per row — set_gate_selector(GateKind::BilinearBatchedEq, …) zeros q_arith and vice versa).
 *
 * Partial lengths:
 *  - Sub 1's heaviest monomials are q_cp · q_cp · q_m · w_l · w_r and q_cp · q_cp · q_5 · w_l · w_o
 *    (the two products in q_cp = 1 mode) — degree 5, partial length 6.
 *  - Sub 2's heaviest is q_cp · q_cp · q_o · w_o — degree 4, partial length 5.
 */
template <typename FF_> class BilinearOrBatchedEqCheckRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{ 6, 5 };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in[AllEntities::EntityId::q_bilinear_batched_eq].is_zero();
    }

    /**
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in Inputs to the relation algebra
     * @param parameters Unused in this relation
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& evals,
                                  const AllEntities& in,
                                  BB_UNUSED const Parameters& params,
                                  const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        auto q_cp_m = CoefficientAccumulator(in[AllEntities::EntityId::q_bilinear_batched_eq]);
        auto w_l_m = CoefficientAccumulator(in[AllEntities::EntityId::w_l]);
        auto w_r_m = CoefficientAccumulator(in[AllEntities::EntityId::w_r]);
        auto w_o_m = CoefficientAccumulator(in[AllEntities::EntityId::w_o]);
        auto w_4_m = CoefficientAccumulator(in[AllEntities::EntityId::w_4]);

        // Mode gates:
        //   bilinear_gate       = q_cp · (2 − q_cp)        →   0 / 1 / 0   for q_cp = 0 / 1 / 2
        //   batched_eq_gate     = q_cp · (q_cp − 1) · 1/2  →   0 / 0 / 1   for q_cp = 0 / 1 / 2
        // The 1/2 in batched_eq_gate absorbs the factor of 2 that q_cp·(q_cp−1) evaluates to in BATCHED_EQ mode,
        // so q_l..q_5, q_c, q_m are written by the builder without halving.
        static const FF half = FF(2).invert();
        auto two_minus_q_cp = -q_cp_m + FF(2);
        auto q_cp_minus_1 = q_cp_m - FF(1);
        auto bilinear_gate = q_cp_m * two_minus_q_cp;
        auto batched_eq_gate = q_cp_m * q_cp_minus_1 * half;

        // Pre-scale the two mode gates by the scaling factor so it threads through both
        // contributions without an extra Accumulator-level multiply at the end.
        auto scaled_bilinear_gate = bilinear_gate * scaling_factor;
        auto scaled_batched_eq_gate = batched_eq_gate * scaling_factor;

        auto q_m_m = CoefficientAccumulator(in[AllEntities::EntityId::q_m]);
        auto q_l_m = CoefficientAccumulator(in[AllEntities::EntityId::q_l]);
        auto q_r_m = CoefficientAccumulator(in[AllEntities::EntityId::q_r]);
        auto q_o_m = CoefficientAccumulator(in[AllEntities::EntityId::q_o]);
        auto q_4_m = CoefficientAccumulator(in[AllEntities::EntityId::q_4]);
        auto q_c_m = CoefficientAccumulator(in[AllEntities::EntityId::q_c]);
        auto q_5_m = CoefficientAccumulator(in[AllEntities::EntityId::q_5]);

        // Subrelation 1
        {
            // Two products sharing the wire w_l, i.e. q_m·w_l·w_r + q_5·w_l·w_o (= w_l·(q_m·w_r + q_5·w_o)).
            // The q·w coefficient products are formed at the CoefficientAccumulator level so each product
            // needs a single Accumulator multiply.
            auto products =
                Accumulator(q_m_m * w_l_m) * Accumulator(w_r_m) + Accumulator(q_5_m * w_l_m) * Accumulator(w_o_m);
            auto linears = (q_l_m * w_l_m) + (q_r_m * w_r_m) + (q_o_m * w_o_m) + (q_4_m * w_4_m) + q_c_m;
            auto bilinear = products + Accumulator(linears);

            auto batched_eq_half_1 = (q_l_m * w_l_m) + (q_r_m * w_r_m) + q_c_m;

            std::get<0>(evals) += Accumulator(scaled_bilinear_gate) * bilinear +
                                  Accumulator(scaled_batched_eq_gate) * Accumulator(batched_eq_half_1);
        }

        // Subrelation 2
        {
            using ShortAccumulator = std::tuple_element_t<1, ContainerOverSubrelations>;

            auto batched_eq_half_2 = (q_o_m * w_o_m) + (q_4_m * w_4_m) + q_m_m;
            std::get<1>(evals) += ShortAccumulator(scaled_batched_eq_gate) * ShortAccumulator(batched_eq_half_2);
        }
    };
};

template <typename FF> using BilinearOrBatchedEqCheckRelation = Relation<BilinearOrBatchedEqCheckRelationImpl<FF>>;
} // namespace bb
