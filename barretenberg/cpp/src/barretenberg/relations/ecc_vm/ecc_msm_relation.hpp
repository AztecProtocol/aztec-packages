// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief MSM relations that evaluate the Strauss multiscalar multiplication algorithm.
 *
 * @details
 * The Strauss algorithm for a size-k MSM takes scalars/points (a_i, [P_i]) for i = 0 to k-1.
 * The specific algoritm we use is the following:
 *
 * PHASE 1: Precomputation (performed in ecc_wnaf_relation.hpp, ecc_point_table_relation.hpp)
 * Each scalar a_i is split into 4-bit WNAF slices s_{j, i} for j = 0 to 31, and a skew bool skew_i
 * For each point [P_i] a size-16 lookup table of points, T_i, is computed { [-15 P_i], [-13 P_i], ..., [15 P_i] }
 *
 * PHASE 2: MSM evaluation
 * MSM evaluation is split into 32 rounds that operate on an accumulator point [Acc]
 * The first 31 rounds are composed of an ADDITION round and a DOUBLE round.
 * The final 32nd round is composed of an ADDITION round and a SKEW round.
 *
 * ADDITION round (round = j):
 * [Acc] = [Acc] + T_i[a_{i, j}] for all i in [0, ... k-1]
 *
 * DOUBLE round:
 * [Acc] = 16 * [Acc] (four point doublings)
 *
 * SKEW round:
 * If skew_i == 1, [Acc] = [Acc] - [P_i] for all i in [0, ..., k - 1]
 *
 * The relations in ECCVMMSMRelationImpl constrain the ADDITION, DOUBLE and SKEW rounds
 * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Accumulator edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF_> class ECCVMMSMRelationImpl {
  public:
    using FF = FF_;
    // 67 subrelations. Max partial length = 12 (for the acc output after 8 chained additions).
    // The degree of y_t8 is 10 (degree doubles through chaining: first_add gives deg 3 y, then each subsequent
    // add increments by ~1). With q_add gating, the final degree is 12 (rounded up for safety).
    // Most subrelations remain degree <= 8. The new addition-chain subrelations (47-50, 51-54) have higher degree.
    // All subrelations use partial length 12 because the View type (used for all wire reads)
    // is Univariate<FF, 12> (derived from the max-degree subrelation in this relation).
    // The 8-chained addition/skew outputs reach degree ~10 at the accumulator output (indices 0,1,4).
    static constexpr std::array<size_t, 67> SUBRELATION_PARTIAL_LENGTHS{
        12, 12, 12, 12, 12, 12,         // 0-5
        12, 12, 12, 12, 12, 12,         // 6-11
        12, 12, 12, 12, 12, 12,         // 12-17
        12, 12, 12, 12, 12, 12, 12,     // 18-24
        12, 12, 12, 12, 12, 12, 12,     // 25-31
        12, 12, 12, 12, 12, 12, 12, 12, // 32-39
        12, 12, 12, 12, 12, 12, 12,     // 40-46
        12, 12, 12, 12,                 // 47-50: ADD slopes 5-8
        12, 12, 12, 12,                 // 51-54: SKEW slopes 5-8
        12, 12, 12, 12,                 // 55-58: collision 5-8
        12, 12, 12, 12,                 // 59-62: slice-zero 5-8
        12, 12, 12, 12                  // 63-66: continuity add5-8
    };

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& /* unused */,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMMSMRelation = Relation<ECCVMMSMRelationImpl<FF>>;

} // namespace bb