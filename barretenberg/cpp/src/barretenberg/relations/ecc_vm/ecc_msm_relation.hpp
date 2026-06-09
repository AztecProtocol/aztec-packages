// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

// Index of the final addition round in the Straus algorithm (rounds 0..LAST_ADDITION_ROUND are
// addition rounds; round LAST_ADDITION_ROUND + 1 is the skew round). Used both by the MSM
// relation (e.g. the round_minus_31_inv witness gate) and by the flavor's witness population.
inline constexpr size_t LAST_ADDITION_ROUND = 31;

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
        ADD_SLOPE_2 = 3,
        ADD_SLOPE_3 = 4,
        ADD_SLOPE_4 = 5,
        // Doubling round: accumulator update and slope constraint
        DOUBLE_ACC_X = 6,
        DOUBLE_ACC_Y = 7,
        DOUBLE_SLOPE_1 = 8,
        DOUBLE_SLOPE_2 = 9,
        DOUBLE_SLOPE_3 = 10,
        DOUBLE_SLOPE_4 = 11,
        // Skew round: accumulator update and slope constraint
        SKEW_ACC_X = 12,
        SKEW_ACC_Y = 13,
        SKEW_SLOPE_1 = 14,
        SKEW_SLOPE_2 = 15,
        SKEW_SLOPE_3 = 16,
        SKEW_SLOPE_4 = 17,
        // Collision checks: x-coordinate non-equality for point additions
        COLLISION_CHECK_1 = 18,
        COLLISION_CHECK_2 = 19,
        COLLISION_CHECK_3 = 20,
        COLLISION_CHECK_4 = 21,
        // Inactive slice zeroing: force slice_i = 0 when add_i = 0
        INACTIVE_SLICE_1 = 22,
        INACTIVE_SLICE_2 = 23,
        INACTIVE_SLICE_3 = 24,
        INACTIVE_SLICE_4 = 25,
        // Phase selector mutual exclusivity: at most one of q_add, q_double, q_skew active
        PHASE_SELECTOR_MUTUAL_EXCLUSIVITY = 26,
        // Round transition forces round_delta == 1
        ROUND_TRANSITION_FORCES_DELTA_ONE = 27,
        // Round transition with skew implies round == 31
        ROUND_TRANSITION_SKEW_IMPLIES_ROUND_31 = 28,
        // Round transition requires exactly one of double or skew on next row
        ROUND_TRANSITION_EXACTLY_ONE_DOUBLE_OR_SKEW = 29,
        // Round transition needs double or skew (cannot have neither)
        ROUND_TRANSITION_NEEDS_DOUBLE_OR_SKEW = 30,
        // Double implies next row is an add row
        DOUBLE_IMPLIES_NEXT_IS_ADD = 31,
        // Count shift must be zero when round changes
        COUNT_SHIFT_ZERO_ON_ROUND_CHANGE = 32,
        // Count increments within the same round by number of active adds
        COUNT_INCREMENT_WITHIN_ROUND = 33,
        // Count must be zero at round boundary or MSM transition
        COUNT_ZERO_AT_ROUND_BOUNDARY_OR_TRANSITION = 34,
        // MSM transition implies round = 0
        MSM_TRANSITION_ROUND_ZERO = 35,
        // MSM transition: pc = pc_shift + msm_size
        MSM_TRANSITION_PC = 36,
        // Addition continuity: add2 requires add1
        ADD_CONTINUITY_2 = 37,
        // Addition continuity: add3 requires add2
        ADD_CONTINUITY_3 = 38,
        // Addition continuity: add4 requires add3
        ADD_CONTINUITY_4 = 39,
        // Cross-row continuity: if add spans two rows, add4 must be 1
        ADD_CROSS_ROW_CONTINUITY = 40,
        // add1 = q_add + q_skew
        ADD1_DECOMPOSITION = 41,
        // q_skew persists until MSM transition: q_skew && !msm_transition_shift => q_skew_shift
        SKEW_PERSISTS_UNTIL_MSM_TRANSITION = 42,
        // q_skew implies round == 32
        SKEW_IMPLIES_ROUND_32 = 43,
        // Doubling requires a round change (round_delta must be 1 if q_double_shift)
        DOUBLE_REQUIRES_ROUND_CHANGE = 44,
        // Idle row: accumulator preserved when no phase selector is active
        IDLE_ROW_PRESERVES_ACC_X = 45,
        IDLE_ROW_PRESERVES_ACC_Y = 46,
        // If q_double_shift = 1, the current row cannot be the final addition round (round 31)
        DOUBLE_SHIFT_FORBIDS_ROUND_31 = 47,
        // MSM-start anchor: msm_transition must be 1 at the first row of every MSM block
        MSM_TRANSITION_AT_ACTIVE_START = 48,
        // msm_pc is constant on every active row within an MSM segment (not the last row, where
        // MSM_TRANSITION_PC pins the segment boundary). Without this, a malicious prover can
        // swap msm_pc between two same-base MSMs on a single interior ADD row; the WNAF and
        // point-table multisets still balance because both swapped tuples are valid writes, but
        // the resulting MSM accumulators are swapped between segments — letting an op queue that
        // should be rejected pass verification.
        MSM_PC_CONTINUITY = 49,
        // msm_pc is constant across consecutive SKEW rows of an MSM segment. MSM_PC_CONTINUITY
        // excludes q_skew (so it does not fire on the trace-final skew row, followed by idle rows
        // where msm_transition_shift = 0), which leaves interior skew rows — present once a segment
        // has >= 3 skew rows, i.e. msm_size >= 9 — pinned by neither MSM_PC_CONTINUITY nor
        // MSM_TRANSITION_PC. A symmetric swap of (msm_pc, slice, x, y) between two segments on such a
        // row balances the lookup multiset but swaps the segments' skew corrections. This term fires
        // only between two consecutive skew rows (q_skew * q_skew_shift = 1), never at the trailing
        // skew->idle boundary (where q_skew_shift = 0), so it closes the gap without the false
        // positive that motivated dropping q_skew from MSM_PC_CONTINUITY.
        MSM_PC_SKEW_CONTINUITY = 50,
        NUM_SUBRELATIONS,
    };

    static constexpr std::array<size_t, 51> SUBRELATION_PARTIAL_LENGTHS{ 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
                                                                         8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
                                                                         8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
                                                                         8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8 };
    static_assert(NUM_SUBRELATIONS == SUBRELATION_PARTIAL_LENGTHS.size());

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& /* unused */,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMMSMRelation = Relation<ECCVMMSMRelationImpl<FF>>;

} // namespace bb
