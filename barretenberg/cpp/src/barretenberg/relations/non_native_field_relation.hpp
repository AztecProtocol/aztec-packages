// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Non-Native Field Relation for emulating arithmetic over fields larger than the native circuit field.
 *
 * @details This relation enables arithmetic operations (multiplication, reduction) on "bigfield" elements,
 * which represent values in a field larger than the circuit's native field (e.g., secp256k1's base field
 * when proving over BN254). A bigfield element is decomposed into 68-bit limbs that fit within the native
 * field, and this relation enforces correct limb-wise arithmetic with carry propagation.
 *
 * The relation handles two types of constraints:
 *
 * 1. **Bigfield Product Gates** (3 variants): Verify that limb products and cross-terms combine correctly
 *    when multiplying two bigfield elements. The product of two 4-limb numbers produces terms that must
 *    be accumulated with appropriate powers of 2^68.
 *
 * 2. **Limb Accumulation Gates** (2 variants): Verify that 14-bit sublimbs correctly reconstruct a 68-bit
 *    limb. Each 68-bit limb is decomposed into five 14-bit chunks (with 2 bits of slack), enabling
 *    efficient range checks via the delta range constraint relation.
 */
template <typename FF_> class NonNativeFieldRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 1> SUBRELATION_PARTIAL_LENGTHS{
        6 // combined non-native field sub-relation
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in[AllEntities::EntityId::q_nnf].is_zero();
    }

    /**
     * @brief Accumulates constraints for non-native field multiplication and limb decomposition.
     *
     * @details Multiple selectors toggle different gate types within this single relation:
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
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters unused
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulators,
                           const AllEntities& in,
                           BB_UNUSED const Parameters& params,
                           const FF& scaling_factor)
    {
        // all accumulators are of the same length, so we set our accumulator type to (arbitrarily) be the first one.
        // if there were one that were shorter, we could also profitably use a `ShortAccumulator` type. however,
        // that is not the case here.
        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        auto w_1_m = CoefficientAccumulator(in[AllEntities::EntityId::w_l]);
        auto w_2_m = CoefficientAccumulator(in[AllEntities::EntityId::w_r]);
        auto w_3_m = CoefficientAccumulator(in[AllEntities::EntityId::w_o]);
        auto w_4_m = CoefficientAccumulator(in[AllEntities::EntityId::w_4]);
        auto w_1_shift_m = CoefficientAccumulator(in[AllEntities::EntityId::w_l_shift]);
        auto w_2_shift_m = CoefficientAccumulator(in[AllEntities::EntityId::w_r_shift]);
        auto w_3_shift_m = CoefficientAccumulator(in[AllEntities::EntityId::w_o_shift]);
        auto w_4_shift_m = CoefficientAccumulator(in[AllEntities::EntityId::w_4_shift]);

        auto q_2_m = CoefficientAccumulator(in[AllEntities::EntityId::q_r]);
        auto q_3_m = CoefficientAccumulator(in[AllEntities::EntityId::q_o]);
        auto q_4_m = CoefficientAccumulator(in[AllEntities::EntityId::q_4]);
        auto q_m_m = CoefficientAccumulator(in[AllEntities::EntityId::q_m]);

        auto q_nnf_m = CoefficientAccumulator(in[AllEntities::EntityId::q_nnf]);
        const FF LIMB_SIZE(uint256_t(1) << 68);
        const FF SUBLIMB_SHIFT(uint256_t(1) << 14);

        // Bigfield Product Gate 2 (selected by q_2 * q_4):
        // Computes cross-term contributions in limb multiplication.
        // Formula: (w_1 * w_2') + (w_1' * w_2) + (w_1 * w_4 + w_2 * w_3 - w_3') * 2^68 - w_4' = 0
        // where primed values (') denote shifted wires from the next row.
        auto limb_subproduct = w_1_m * w_2_shift_m + w_1_shift_m * w_2_m;
        auto non_native_field_gate_2_m = (w_1_m * w_4_m + w_2_m * w_3_m - w_3_shift_m);
        non_native_field_gate_2_m *= LIMB_SIZE;
        non_native_field_gate_2_m -= w_4_shift_m;
        non_native_field_gate_2_m += limb_subproduct;
        auto non_native_field_gate_2 = Accumulator(non_native_field_gate_2_m) * Accumulator(q_4_m);

        // Bigfield Product Gate 1 (selected by q_2 * q_3):
        // Accumulates limb products with 2^68 scaling for high-order terms.
        // Formula: (w_1 * w_2' + w_1' * w_2) * 2^68 + (w_1' * w_2') - w_3 - w_4 = 0
        limb_subproduct *= LIMB_SIZE;
        limb_subproduct += (w_1_shift_m * w_2_shift_m);
        auto non_native_field_gate_1_m = limb_subproduct;
        non_native_field_gate_1_m -= (w_3_m + w_4_m);
        // Transform to Accumulator for degree > 2 (CoefficientAccumulator limited to degree 2)
        auto non_native_field_gate_1 = Accumulator(non_native_field_gate_1_m) * Accumulator(q_3_m);

        // Bigfield Product Gate 3 (selected by q_2 * q_m):
        // Handles remaining cross-terms in the limb product expansion.
        // Formula: limb_subproduct + w_4 - w_3' - w_4' = 0
        auto non_native_field_gate_3_m = limb_subproduct;
        non_native_field_gate_3_m += w_4_m;
        non_native_field_gate_3_m -= (w_3_shift_m + w_4_shift_m);
        auto non_native_field_gate_3 = Accumulator(non_native_field_gate_3_m) * Accumulator(q_m_m);

        auto non_native_field_identity = non_native_field_gate_1 + non_native_field_gate_2 + non_native_field_gate_3;
        non_native_field_identity *= Accumulator(q_2_m);

        // Limb Accumulation Gate 1 (selected by q_3 * q_4):
        // Reconstructs a 68-bit limb from five 14-bit sublimbs stored across wires.
        // Constraint: w_2' * 2^56 + w_1' * 2^42 + w_3 * 2^28 + w_2 * 2^14 + w_1 - w_4 = 0
        // Horner form: ((((w_2' * 2^14 + w_1') * 2^14 + w_3) * 2^14 + w_2) * 2^14 + w_1) - w_4 = 0
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

        // Limb Accumulation Gate 2 (selected by q_3 * q_m):
        // Reconstructs a second 68-bit limb from five 14-bit sublimbs.
        // Constraint: w_3' * 2^56 + w_2' * 2^42 + w_1' * 2^28 + w_4 * 2^14 + w_3 - w_4' = 0
        // Horner form: ((((w_3' * 2^14 + w_2') * 2^14 + w_1') * 2^14 + w_4) * 2^14 + w_3) - w_4' = 0
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
