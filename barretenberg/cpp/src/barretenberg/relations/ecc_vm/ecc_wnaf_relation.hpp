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
 * Each WNAF slice is represented via two 2-bit columns (precompute_s1hi, ..., precompute_s8lo)
 * One 128-bit scalar multiplier is processed across 4 rows (8 digits/row), indexed by a round variable.
 * The following table describes the structure for one scalar.
 *
 * | point_transition | round | slices                          | skew   | scalar_sum                        |
 * | ---------------- | ----- | ------------------------------- | ------ | --------------------------------- |
 * | 0                | 0     | s0,s1,s2,s3,s4,s5,s6,s7        | 0      | 0                                 |
 * | 0                | 1     | s8,s9,s10,s11,s12,s13,s14,s15   | 0      | \sum_{i=0}^7 16^i * s_{7 - i}     |
 * | 0                | 2     | s16,s17,s18,s19,s20,s21,s22,s23 | 0      | \sum_{i=0}^15 16^i * s_{15 - i}   |
 * | 1                | 3     | s24,s25,s26,s27,s28,s29,s30,s31 | s_skew | \sum_{i=0}^23 16^i * s_{23 - i}   |
 *
 * The value of the input scalar is equal to the following:
 *
 * scalar = 2^32 * scalar_sum + 2^28*s24 + ... + s31 - s_skew
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

    // 35 subrelations:
    // 0-7:   range checks for slices 0-7 (degree 5)
    // 8:     scalar sum consistency (degree 5)
    // 9-12:  round/PC transition logic (degree 5)
    // 13:    skew validation (degree 5)
    // 14-17: slice-zero checks for w0-w3 (degree 5)
    // 18-19: round/pc zero when inactive (degree 5)
    // 20:    s1hi MSB positive at transitions (degree 5)
    // 21:    q_transition zero when inactive (degree 5)
    // 22:    precompute_select monotonicity (degree 5)
    // 23-30: range checks for slices 8-15 (degree 5)
    // 31-34: slice-zero checks for w4-w7 (degree 5)
    static constexpr std::array<size_t, 35> SUBRELATION_PARTIAL_LENGTHS{
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    };

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& /* unused */,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMWnafRelation = Relation<ECCVMWnafRelationImpl<FF>>;

} // namespace bb
