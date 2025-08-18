// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class NonNativeFieldRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 1> SUBRELATION_PARTIAL_LENGTHS{
        6 // nnf sub-relation;
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in) { return in.q_nnf.is_zero(); }

    /**
     * @brief Non-native field arithmetic relation
     * @details Adds contributions for identities associated with non-native field arithmetic:
     *  * Bigfield product evaluation (3 in total)
     *  * Bigfield limb accumulation (2 in total)
     *
     * Multiple selectors are used to 'switch' nnf gates on/off according to the following pattern:
     *
     * | gate type                    | q_nnf | q_2 | q_3 | q_4 | q_m |
     * | ---------------------------- | ----- | --- | --- | --- | --- |
     * | Bigfield Limb Accumulation 1 | 1     | 0   | 1   | 1   | 0   |
     * | Bigfield Limb Accumulation 2 | 1     | 0   | 1   | 0   | 1   |
     * | Bigfield Product 1           | 1     | 1   | 1   | 0   | 0   |
     * | Bigfield Product 2           | 1     | 1   | 0   | 1   | 0   |
     * | Bigfield Product 3           | 1     | 1   | 0   | 0   | 1   |
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the Totaly extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& accumulators,
                                  const AllEntities& in,
                                  [[maybe_unused]] const Parameters& params,
                                  const FF& scaling_factor)
    {
        // all accumulators are of the same length, so we set our accumulator type to (arbitrarily) be the first one.
        // if there were one that were shorter, we could also profitably use a `ShortAccumulator` type. however,
        // that is not the case here.
        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        auto w_1_m = CoefficientAccumulator(in.w_l);
        auto w_2_m = CoefficientAccumulator(in.w_r);
        auto w_3_m = CoefficientAccumulator(in.w_o);
        auto w_4_m = CoefficientAccumulator(in.w_4);
        auto w_1_shift_m = CoefficientAccumulator(in.w_l_shift);
        auto w_2_shift_m = CoefficientAccumulator(in.w_r_shift);
        auto w_3_shift_m = CoefficientAccumulator(in.w_o_shift);
        auto w_4_shift_m = CoefficientAccumulator(in.w_4_shift);

        auto q_2_m = CoefficientAccumulator(in.q_r);
        auto q_3_m = CoefficientAccumulator(in.q_o);
        auto q_4_m = CoefficientAccumulator(in.q_4);
        auto q_m_m = CoefficientAccumulator(in.q_m);

        auto q_nnf_m = CoefficientAccumulator(in.q_nnf);
        const FF LIMB_SIZE(uint256_t(1) << 68);
        const FF SUBLIMB_SHIFT(uint256_t(1) << 14);

        /**
         * Non native field arithmetic gate 2
         * deg 4
         *
         *             _                                                                               _
         *            /   _                   _                               _       14                \
         * q_2 . q_4 |   (w_1 . w_2) + (w_1 . w_2) + (w_1 . w_4 + w_2 . w_3 - w_3) . 2    - w_3 - w_4   |
         *            \_                                                                               _/
         *
         **/
        auto limb_subproduct = w_1_m * w_2_shift_m + w_1_shift_m * w_2_m;
        auto non_native_field_gate_2_m = (w_1_m * w_4_m + w_2_m * w_3_m - w_3_shift_m);
        non_native_field_gate_2_m *= LIMB_SIZE;
        non_native_field_gate_2_m -= w_4_shift_m;
        non_native_field_gate_2_m += limb_subproduct;
        auto non_native_field_gate_2 = Accumulator(non_native_field_gate_2_m) * Accumulator(q_4_m);

        limb_subproduct *= LIMB_SIZE;
        limb_subproduct += (w_1_shift_m * w_2_shift_m);
        auto non_native_field_gate_1_m = limb_subproduct;
        non_native_field_gate_1_m -= (w_3_m + w_4_m);
        // We transform into Accumulator to extend the degree of `non_native_field_gate_1` beyond degree-2
        // (CoefficientAccumulator only supports univariate polynomials of up to degree 2; it is not efficient to peform
        // higher-degree computations in the coefficient basis.)
        auto non_native_field_gate_1 = Accumulator(non_native_field_gate_1_m) * Accumulator(q_3_m);

        auto non_native_field_gate_3_m = limb_subproduct;
        non_native_field_gate_3_m += w_4_m;
        non_native_field_gate_3_m -= (w_3_shift_m + w_4_shift_m);
        auto non_native_field_gate_3 = Accumulator(non_native_field_gate_3_m) * Accumulator(q_m_m);

        auto non_native_field_identity = non_native_field_gate_1 + non_native_field_gate_2 + non_native_field_gate_3;
        non_native_field_identity *= Accumulator(q_2_m);

        // ((((w2' * 2^14 + w1') * 2^14 + w3) * 2^14 + w2) * 2^14 + w1 - w4) * q_4
        // deg 2
        auto limb_accumulator_1_m = w_2_shift_m * SUBLIMB_SHIFT;
        limb_accumulator_1_m += w_1_shift_m;
        limb_accumulator_1_m *= SUBLIMB_SHIFT;
        limb_accumulator_1_m += w_3_m;
        limb_accumulator_1_m *= SUBLIMB_SHIFT;
        limb_accumulator_1_m += w_2_m;
        limb_accumulator_1_m *= SUBLIMB_SHIFT;
        limb_accumulator_1_m += w_1_m;
        limb_accumulator_1_m -= w_4_m;
        auto limb_accumulator_1_m_full = limb_accumulator_1_m * q_4_m;

        // ((((w3' * 2^14 + w2') * 2^14 + w1') * 2^14 + w4) * 2^14 + w3 - w4') * q_m
        // deg 2
        auto limb_accumulator_2_m = w_3_shift_m * SUBLIMB_SHIFT;
        limb_accumulator_2_m += w_2_shift_m;
        limb_accumulator_2_m *= SUBLIMB_SHIFT;
        limb_accumulator_2_m += w_1_shift_m;
        limb_accumulator_2_m *= SUBLIMB_SHIFT;
        limb_accumulator_2_m += w_4_m;
        limb_accumulator_2_m *= SUBLIMB_SHIFT;
        limb_accumulator_2_m += w_3_m;
        limb_accumulator_2_m -= w_4_shift_m;
        auto limb_accumulator_2_m_full = limb_accumulator_2_m * q_m_m;

        auto limb_accumulator_identity_m = limb_accumulator_1_m_full + limb_accumulator_2_m_full;
        Accumulator limb_accumulator_identity(limb_accumulator_identity_m);
        limb_accumulator_identity *= q_3_m; //  deg 3

        auto q_nnf_by_scaling_m = q_nnf_m * scaling_factor; // deg 1
        auto q_nnf_by_scaling = Accumulator(q_nnf_by_scaling_m);

        auto nnf_identity = non_native_field_identity + limb_accumulator_identity;
        nnf_identity *= q_nnf_by_scaling;          // deg
        std::get<0>(accumulators) += nnf_identity; // deg
    };
};

template <typename FF> using NonNativeFieldRelation = Relation<NonNativeFieldRelationImpl<FF>>;
} // namespace bb
