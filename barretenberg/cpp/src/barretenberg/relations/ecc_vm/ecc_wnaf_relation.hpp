// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {
/**
 * @brief ECCVMWnafRelationImpl evaluates relations that convert scalar multipliers into 4-bit WNAF slices
 * @details Each WNAF slice is a 4-bit slice representing one of 16 integers { -15, -13, ..., 15 }
 * Each WNAF slice is represented via two 2-bit columns (precompute_s1hi, ..., precompute_s4lo)
 * One 128-bit scalar multiplier is processed across 8 rows, indexed by a round variable.
 * The following table describes the structure for one scalar.
 *
 * | point_transition | round | slices          | skew   | scalar_sum                      |
 * | ---------------- | ----- | --------------- | ------ | ------------------------------- |
 * | 0                | 0     | s0,s1,s2,s3     | 0      | 0                               |
 * | 0                | 1     | s4,s5,s6,s7     | 0      | \sum_{i=0}^4 16^i * s_{3 - i}   |
 * | 0                | 2     | s8,s9,s10,s11   | 0      | \sum_{i=0}^8 16^i * s_{7 - i}   |
 * | 0                | 3     | s12,s13,s14,s14 | 0      | \sum_{i=0}^12 16^i * s_{11 - i} |
 * | 0                | 4     | s16,s17,s18,s19 | 0      | \sum_{i=0}^16 16^i * s_{15 - i} |
 * | 0                | 5     | s20,s21,s22,s23 | 0      | \sum_{i=0}^20 16^i * s_{19 - i} |
 * | 0                | 6     | s24,s25,s26,s27 | 0      | \sum_{i=0}^24 16^i * s_{23 - i} |
 * | 1                | 7     | s28,s29,s30,s31 | s_skew | \sum_{i=0}^28 16^i * s_{27 - i} |
 *
 * The value of the input scalar is equal to the following:
 *
 * scalar = 2^16 * scalar_sum + 2^12 * s28 + 2^8 * s29 + 2^4 * s30 + s31 - s_skew
 *
 * We use a multiset equality check in `ecc_set_relation.hpp` to validate the above value maps to the correct input
 * scalar for a given value of `pc` (i.e., for a given non-trivial EC point). In other words, this constrains that the
 * wNAF expansion is correct. Note that, from the perpsective of the Precomputed table, we only add the tuple (pc,
 * round, slice) to the multiset when point_transition == 1.
 *
 * The column `point_transition` is committed to by the Prover, we must constrain it is correctly computed (see
 * `ecc_point_table_relation.cpp` for details)
 *
 * @tparam FF
 */
template <typename FF_> class ECCVMWnafRelationImpl {
  public:
    using FF = FF_;

    // Named subrelation indices — matches SUBRELATION_PARTIAL_LENGTHS ordering.
    enum SubrelationIndex : size_t {
        // Range checks: each 2-bit slice is in {0, 1, 2, 3}
        RANGE_S1HI = 0,
        RANGE_S1LO = 1,
        RANGE_S2HI = 2,
        RANGE_S2LO = 3,
        RANGE_S3HI = 4,
        RANGE_S3LO = 5,
        RANGE_S4HI = 6,
        RANGE_S4LO = 7,
        // Scalar sum accumulation: check slice consistency across rows
        SCALAR_SUM_CHECK = 8,
        // Round transition: combined round increment / round==7 check
        ROUND_CHECK = 9,
        // Round shift must be 0 at transition or first row
        ROUND_SHIFT_ZERO = 10,
        // Scalar sum shift must be 0 at transition or first row
        SCALAR_SUM_SHIFT_ZERO = 11,
        // PC transition: combined pc decrement / pc propagation
        PC_CHECK = 12,
        // Skew is 0 or 7
        SKEW_RANGE = 13,
        // When precompute_select == 0: force slices to zero (w0)
        INACTIVE_SLICE_W0 = 14,
        // When precompute_select == 0: force slices to zero (w1)
        INACTIVE_SLICE_W1 = 15,
        // When precompute_select == 0: force slices to zero (w2)
        INACTIVE_SLICE_W2 = 16,
        // When precompute_select == 0: force slices to zero (w3)
        INACTIVE_SLICE_W3 = 17,
        // When precompute_select == 0: force round to zero
        INACTIVE_ROUND = 18,
        // When precompute_select == 0: force pc to zero
        INACTIVE_PC = 19,
        // First slice positive: s1hi_shift >= 2 at transitions
        FIRST_SLICE_POSITIVE = 20,
        // When precompute_select == 0: force point_transition to zero
        INACTIVE_POINT_TRANSITION = 21,
        // Precompute select shape: monotonically non-decreasing after first row
        PRECOMPUTE_SELECT_SHAPE = 22,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 23> SUBRELATION_PARTIAL_LENGTHS{ 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
                                                                         5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5 };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& /* unused */,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMWnafRelation = Relation<ECCVMWnafRelationImpl<FF>>;

} // namespace bb
