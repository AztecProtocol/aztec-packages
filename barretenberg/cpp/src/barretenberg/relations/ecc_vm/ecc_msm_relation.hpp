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

    // Named subrelation indices — matches SUBRELATION_PARTIAL_LENGTHS ordering.
    // Grouped by logical function within the Strauss MSM algorithm.
    enum SubrelationIndex : size_t {
        // Addition round: accumulator update and slope constraints
        ADD_ACC_X = 0,
        ADD_ACC_Y = 1,
        ADD_SLOPE_1 = 2,
        // Skew round: accumulator update and slope constraint
        SKEW_ACC_X = 3,
        SKEW_ACC_Y = 4,
        SKEW_SLOPE_1 = 5,
        // Collision checks: x-coordinate non-equality for point additions
        COLLISION_CHECK_1 = 6,
        COLLISION_CHECK_2 = 7,
        COLLISION_CHECK_3 = 8,
        COLLISION_CHECK_4 = 9,
        // Doubling round: accumulator update and slope constraint
        DOUBLE_ACC_X = 10,
        DOUBLE_ACC_Y = 11,
        DOUBLE_SLOPE_1 = 12,
        // Inactive slice zeroing: force slice_i = 0 when add_i = 0
        INACTIVE_SLICE_1 = 13,
        INACTIVE_SLICE_2 = 14,
        INACTIVE_SLICE_3 = 15,
        INACTIVE_SLICE_4 = 16,
        // Selector mutual exclusivity: at most one of q_add, q_double, q_skew active
        SELECTOR_EXCLUSIVITY = 17,
        // Round transition: round_delta is boolean (when not at MSM transition)
        ROUND_TRANSITION_BOOL = 18,
        // Round transition -> skew: if round transition and skew_shift, then round == 31
        ROUND_TRANSITION_SKEW = 19,
        // Round transition -> double or skew: exactly one must be active
        ROUND_TRANSITION_DOUBLE_OR_SKEW = 20,
        // Round transition: if neither double nor skew shift, round_delta must be 0
        ROUND_TRANSITION_NO_OP = 21,
        // Double implies next row is add
        DOUBLE_THEN_ADD = 22,
        // Count reset on round change
        COUNT_ZERO_ON_ROUND_CHANGE = 23,
        // Count update within same round
        COUNT_UPDATE = 24,
        // Count shift must be zero at round boundary or MSM transition
        COUNT_SHIFT_ZERO = 25,
        // MSM transition implies round = 0
        MSM_TRANSITION_ROUND_ZERO = 26,
        // MSM transition: pc = pc_shift + msm_size
        MSM_TRANSITION_PC = 27,
        // Addition continuity: add2 requires add1
        ADD_CONTINUITY_2 = 28,
        // Addition continuity: add3 requires add2
        ADD_CONTINUITY_3 = 29,
        // Addition continuity: add4 requires add3
        ADD_CONTINUITY_4 = 30,
        // Cross-row continuity: if add spans two rows, add4 must be 1
        ADD_CROSS_ROW_CONTINUITY = 31,
        // add1 = q_add + q_skew
        ADD1_DECOMPOSITION = 32,
        // q_skew propagation: if not at MSM transition, q_skew implies q_skew_shift
        SKEW_PROPAGATION = 33,
        // q_skew implies round == 32
        SKEW_ROUND_CHECK = 34,
        // If round_delta == 0, then q_double_shift == 0
        NO_ROUND_CHANGE_NO_DOUBLE = 35,
        // Additional addition slope constraints (split to prevent cancellation)
        ADD_SLOPE_2 = 36,
        ADD_SLOPE_3 = 37,
        ADD_SLOPE_4 = 38,
        // Additional doubling slope constraints (split to prevent cancellation)
        DOUBLE_SLOPE_2 = 39,
        DOUBLE_SLOPE_3 = 40,
        DOUBLE_SLOPE_4 = 41,
        // Additional skew slope constraints (split to prevent cancellation)
        SKEW_SLOPE_2 = 42,
        SKEW_SLOPE_3 = 43,
        SKEW_SLOPE_4 = 44,
        // No-op row: accumulator preservation when no selector is active
        NO_OP_ACC_X = 45,
        NO_OP_ACC_Y = 46,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 47> SUBRELATION_PARTIAL_LENGTHS{ 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
                                                                         8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
                                                                         8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8 };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& /* unused */,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMMSMRelation = Relation<ECCVMMSMRelationImpl<FF>>;

} // namespace bb