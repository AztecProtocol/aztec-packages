// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief ECCVMTranscriptRelationImpl evaluates the correctness of the ECCVM transcript columns
 *
 * @details The transcript relations directly evaluate the correctness of `add, eq, reset` operations.
 * `mul` operations are lazily evaluated. The output of multiscalar multiplications is present in
 * `transcript_msm_x, transcript_msm_y` columns. A set equality check is used to validate these
 * have been correctly read from a table produced by the relations in `ecc_msm_relation.hpp`.
 *
 * Sequential `mul` opcodes are interpreted as a multiscalar multiplication.
 * The column `transcript_msm_count` tracks the number of muls in a given multiscalar multiplication.
 *
 * The column `transcript_pc` tracks a "point counter" value, that describes the number of multiplications
 * that must be evaluated.
 *
 * One mul opcode can generate up to TWO multiplications. Each 128-bit scalar `z1, z2` is treated as an independent
 * mul. The purpose of this is to reduce the length of the MSM algorithm evalauted in `ecc_msm_relation.hpp` to 128
 * bits (from 256 bits). Many scalar muls required to recursively verify a proof are only 128-bits in length; this
 * prevents us doing redundant computation.
 * @tparam FF
 */
template <typename FF_> class ECCVMTranscriptRelationImpl {
  public:
    using FF = FF_;

    // Named subrelation indices — matches SUBRELATION_PARTIAL_LENGTHS ordering.
    enum SubrelationIndex : size_t {
        // z1/z2 zero checks: if z_zero flag is set, scalar must be 0
        Z1_ZERO_CHECK = 0,
        Z2_ZERO_CHECK = 1,
        // Opcode encoding: op = q_reset + 2*q_eq + 4*q_mul + 8*q_add
        OPCODE_WELL_FORMED = 2,
        // Point counter update: pc decrements by number of muls
        PC_UPDATE = 3,
        // MSM count zero at transition: witnesses correct msm_count_zero_at_transition
        MSM_COUNT_ZERO_AT_TRANSITION = 4,
        // MSM transition: msm_transition = q_mul * (1 - q_mul_shift) * (1 - msm_count_zero_at_transition)
        MSM_TRANSITION = 5,
        // MSM count zero when not at a mul op
        MSM_COUNT_ZERO_WHEN_NOT_MUL = 6,
        // MSM count increments correctly across mul rows
        MSM_COUNT_INCREMENT_ACROSS_ROWS = 7,
        // Opcode exclusion: q_mul and q_add are mutually exclusive with other opcodes
        OPCODE_EXCLUSION = 8,
        // Equality check x-coordinate
        EQ_X_DIFF = 9,
        // Equality check y-coordinate
        EQ_Y_DIFF = 10,
        // Boundary: is_accumulator_empty = 1 at third row
        BOUNDARY_ACCUMULATOR_EMPTY = 11,
        // Boundary: msm_count = 0 at third row, pc = 0 at last row
        BOUNDARY_MSM_COUNT_AND_PC = 12,
        // On-curve check for input points
        ON_CURVE_CHECK = 13,
        // Lambda relation for add/msm group operations
        LAMBDA_RELATION = 14,
        // Accumulator x-coordinate update
        ACCUMULATOR_X_UPDATE = 15,
        // Accumulator y-coordinate update
        ACCUMULATOR_Y_UPDATE = 16,
        // Accumulator empty flag update
        ACCUMULATOR_EMPTY_UPDATE = 17,
        // x-equal flag validation
        ADD_X_EQUAL_CHECK = 18,
        // y-equal flag validation
        ADD_Y_EQUAL_CHECK = 19,
        // Hiding op row: q_eq must be 1
        HIDING_ROW_EQ = 20,
        // Hiding op row: q_reset must be 1
        HIDING_ROW_RESET = 21,
        // Infinity flag consistency: Px = 0 when base infinity
        INFINITY_BASE_PX = 22,
        // Infinity flag consistency: Py = 0 when base infinity
        INFINITY_BASE_PY = 23,
        // Infinity flag consistency: acc_x = 0 when accumulator empty
        INFINITY_ACC_X = 24,
        // Infinity flag consistency: acc_y = 0 when accumulator empty
        INFINITY_ACC_Y = 25,
        // The following subrelations are gated entirely by `msm_transition` and are grouped contiguously at the end so
        // the short-monomial flavor can split them into a separately-skippable relation (skip when msm_transition ==
        // 0).
        // MSM offset generator subtraction: x-coordinate
        OFFSET_GENERATOR_X = 26,
        // MSM offset generator subtraction: y-coordinate
        OFFSET_GENERATOR_Y = 27,
        // MSM infinity x-diff check
        MSM_INFINITY_X_DIFF = 28,
        // MSM infinity y-sum check
        MSM_INFINITY_Y_SUM = 29,
        // MSM infinity inverse check
        MSM_INFINITY_INVERSE = 30,
        NUM_SUBRELATIONS,
    };

    // The previous ACCUMULATOR_NOT_EMPTY_INIT subrelation (`lagrange_first
    // · transcript_accumulator_not_empty = 0`) was moved to ECCVMShiftableInitRelation as
    // part of centralizing all `lagrange_first · col = 0` pins. The `is_accumulator_empty ·
    // transcript_accumulator_{x,y} = 0` cascade in this relation continues to depend on
    // that pin firing — DO NOT remove it without revisiting.
    static constexpr std::array<size_t, 31> SUBRELATION_PARTIAL_LENGTHS{
        8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
    };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& /* unused */,
                           const FF& scaling_factor);

    static constexpr FF get_curve_b()
    {
        if constexpr (FF::modulus == bb::fq::modulus) {
            return bb::g1::curve_b;
        } else if constexpr (FF::modulus == grumpkin::fq::modulus) {
            return grumpkin::g1::curve_b;
        } else {
            static_assert(!std::is_same_v<FF, FF>, "Unsupported field type for ECC transcript relation");
        }
    }
};

template <typename FF> using ECCVMTranscriptRelation = Relation<ECCVMTranscriptRelationImpl<FF>>;

} // namespace bb
