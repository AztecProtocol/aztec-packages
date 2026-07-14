// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "ecc_msm_relation.hpp"

namespace bb {

/**
 * @brief MSM relations that evaluate the Strauss multiscalar multiplication algorithm.
 *
 * @details
 * The Straus algorithm for a size-k MSM takes scalars/points (a_i, [P_i]) for i = 0 to k-1.
 * The specific algorithm we use may be found [here](../../eccvm/README.md). We briefly reprise the
 * algorithm nonetheless.
 *
 * PHASE 1: Precomputation (performed in ecc_wnaf_relation.hpp, ecc_point_table_relation.hpp)
 * Each scalar a_i is split into 4-bit WNAF slices a_{j, i} for j = 0 to 31, and a skew bool skew_i
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
 * @param accumulator transformed to `accumulator + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Accumulator edges.
 * @param parameters contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void ECCVMMSMRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                          const AllEntities& in,
                                          const Parameters& /*unused*/,
                                          const FF& scaling_factor)
{
    using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
    using View = typename Accumulator::View;

    const auto& x1 = View(in.msm_x1);
    const auto& y1 = View(in.msm_y1);
    const auto& x2 = View(in.msm_x2);
    const auto& y2 = View(in.msm_y2);
    const auto& x3 = View(in.msm_x3);
    const auto& y3 = View(in.msm_y3);
    const auto& x4 = View(in.msm_x4);
    const auto& y4 = View(in.msm_y4);
    const auto& collision_inverse1 = View(in.msm_collision_x1);
    const auto& collision_inverse2 = View(in.msm_collision_x2);
    const auto& collision_inverse3 = View(in.msm_collision_x3);
    const auto& collision_inverse4 = View(in.msm_collision_x4);
    const auto& lambda1 = View(in.msm_lambda1);
    const auto& lambda2 = View(in.msm_lambda2);
    const auto& lambda3 = View(in.msm_lambda3);
    const auto& lambda4 = View(in.msm_lambda4);
    const auto& lagrange_first = View(in.lagrange_first);
    const auto& add1 = View(in.msm_add1);
    const auto& add1_shift = View(in.msm_add1_shift);
    const auto& add2 = View(in.msm_add2);
    const auto& add3 = View(in.msm_add3);
    const auto& add4 = View(in.msm_add4);
    const auto& acc_x = View(in.msm_accumulator_x);
    const auto& acc_y = View(in.msm_accumulator_y);
    const auto& acc_x_shift = View(in.msm_accumulator_x_shift);
    const auto& acc_y_shift = View(in.msm_accumulator_y_shift);
    const auto& slice1 = View(in.msm_slice1);
    const auto& slice2 = View(in.msm_slice2);
    const auto& slice3 = View(in.msm_slice3);
    const auto& slice4 = View(in.msm_slice4);
    const auto& msm_transition = View(in.msm_transition);
    const auto& msm_transition_shift = View(in.msm_transition_shift);
    const auto& round = View(in.msm_round);
    const auto& round_shift = View(in.msm_round_shift);
    const auto& round_minus_31_inv = View(in.msm_round_minus_31_inv);
    const auto& q_add = View(in.msm_add); // is 1 iff we are at an ADD row in Straus algorithm
    const auto& q_add_shift = View(in.msm_add_shift);
    const auto& q_skew = View(in.msm_skew);
    const auto& q_skew_shift = View(in.msm_skew_shift);
    const auto& q_double = View(in.msm_double); // is 1 iff we are at an DOUBLE row in Straus algorithm
    const auto& q_double_shift = View(in.msm_double_shift);
    const auto& msm_size = View(in.msm_size_of_msm);
    const auto& pc = View(in.msm_pc); // pc stands for `point-counter`.
    const auto& pc_shift = View(in.msm_pc_shift);
    const auto& count = View(in.msm_count);
    const auto& count_shift = View(in.msm_count_shift);
    auto is_not_first_row = (-lagrange_first + 1);

    /**
     * @brief Evaluating ADDITION rounds
     *
     * This comment describes the algorithm we want the Prover to perform.
     * The relations we constrain are supposed to make an honest Prover compute witnesses consistent with the following:
     *
     * For an MSM of size-k...
     *
     * Algorithm to determine if round at shifted row is an ADDITION round:
     *     1. count_shift < msm_size
     *     2. round != 32
     *
     * Algorithm to process MSM ADDITION round:
     * 1. If `round == 0` set `count = 0`
     * 2. For j = pc + count, perform the following:
     * 2a.      If j + 3 < k: [P_{j + 3}] = T_{j+ 3}[slice_{j + 3}]
     * 2b.      If j + 2 < k: [P_{j + 2}] = T_{j+ 2}[slice_{j + 2}]
     * 2c.      If j + 1 < k: [P_{j + 1}] = T_{j+ 1}[slice_{j + 1}]
     * 2d.                    [P_{j}]     = T_{j}[slice_{j}]
     * 2e.      If j + 3 < k: [Acc_shift] = [Acc] + [P_j] + [P_{j+1}] + [P_{j+2}] + [P_{j+3}]
     * 2f. Else If j + 2 < k: [Acc_shift] = [Acc] + [P_j] + [P_{j+1}] + [P_{j+2}]
     * 2g. Else IF j + 1 < k: [Acc_shift] = [Acc] + [P_j] + [P_{j+1}]
     * 2h. Else             : [Acc_shift] = [Acc] + [P_j]
     * 3. `count_shift = count + 1 + (j + 1 < k) + (j + 2 < k) + (j + 3 < k)`
     */

    /**
     * @brief Constraining addition rounds via a multiset-equality check
     *
     * @details
     * The boolean column q_add describes whether a round is an ADDITION round.
     * The values of q_add are Prover-defined. We need to ensure they set q_add correctly. We will do this via a
     * multiset-equality check (formerly called a "strict lookup"), which allows the various tables to "communicate".
     * On a high level, this table "reads" (pc, round, wnaf_slice), another table (Precomputed) "writes"
     * a potentially different set of (pc, round, wnaf_slice), and we demand that the reads match the writes.
     * Alternatively said, the MSM columns spawn a multiset of tuples of the form (pc, round, wnaf_slice), the
     * Precomputed Table columns spawn a potentially different multiset of tuples of the form (pc, round, wnaf_slice),
     * and we _check_ that these two multisets match.
     *
     * The above description does not reference how we will _prove_ that the two multisets are equal. As usual, we use a
     * grand product argument. A happy byproduct of this is that we can use the grand product technique, which is
     * powerful enough to allow our multiset equality testing to support _conditional adds_; this means that we only add
     * a tuple if some particular condition occurs.
     *
     * This (pc, round, wnaf_slice) multiset equality testing is made more difficult by the fact that the values of
     * `precomputed_pc` are _not the same_ as the values of `msm_pc`. The former indexes over every (non-trivial, 128
     * bit) scalar multiplication, while the latter jumps values and is constant on MSM rows corresponding to a fixed
     * MSM. However, the transition values should match.
     *
     * Given a row of the MSM table, we have four selectors q_add1, q_add2, q_add3, q_add4, as well as a q_skew
     * selector. For the MSM side of the multiset corresponding to (pc, round, wnaf_slice), we add:
     *
     *      1. (msm_pc - msm_count, round, wnaf_slice_{count}) when q_add1 = 1
     *      2. (msm_pc - msm_count - 1, round, wnaf_slice_{count + 1}) when q_add2 = 1
     *      3. (msm_pc - msm_count - 2, round, wnaf_slice_{count + 2}) when q_add3 = 1
     *      4. (msm_pc - msm_count - 3, round, wnaf_slice_{count + 3}) when q_add4 = 1
     *
     * That this is "what we want" comes from the following facts: msm_pc is the number of (non-trivial, 128-bit) Point
     * multiplications we have done _until the start of_ the current MSM, and `msm_count` is the number of Point * wNAF
     * slice multiplications/lookups we have done _in this round_. (Recall that a round corresponds to a wNAF digit.) In
     * particular, `msm_count` updates by the appropriate amount (usually 4, more accurately q_add1 + q_add2 + q_add3 +
     * q_add4) per row of the MSM table.
     *
     * On the other side, given a row of the Precomputed columns, if `precompute_select == 1`, we add
     *      1. (precompute_pc, 4 * precompute_round, w_1)
     *      2. (precompute_pc, 4 * precompute_round + 1, w_2)
     *      3. (precompute_pc, 4 * precompute_round + 2, w_3)
     *      4. (precompute_pc, 4 * precompute_round + 3, w_4)
     * Additionally, if `precompute_point_transition == 1`, we add
     *      5. (precompute_pc, 4 * precompute_round + 4, precompute_skew)
     *
     * ELSE `precompute_select == 0` and we add:
     *      1. (0, 0, 0)
     *
     * Here, w_K is the compressed wNAF slices corresponding to `precompute_sKhi` and `precompute_sKlo`, for K ∈ {1, 2,
     * 3, 4} and precompute_skew ∈ {0, 7}.
     *
     * SKETCH OF PROOF: We now argue that, under the following assumptions, if the multiset equality holds, then the
     * `q_addK` and also `q_add` are all correctly constrained for K ∈ {1, 2, 3, 4}.
     *      1. The Precomputed table is correctly constrained; in particular, the values `precompute_pc`,
     *      `precompute_round`, `precompute_skew`, `precompute_select`, and `wK` are all correctly constrained.
     *      2. `round` monotonically increases from 0 to 32 before reseting back to 0. `round_shift - round == 1`
     *      precisely when `q_double == 1`.
     *      3. `pc` is monotonic and only updates when there is an `msm_transition`. Here, it updates by `msm_size`,
     *      which must be constrained somewhere else by a multiset argument. We detail this below.
     *      4. `q_add`, `q_skew`, and `q_double` are pairwise mutually exclusive.
     *      5. `q_add1 == 1` iff either `q_add == 1` OR `q_skew == 1`.
     *      6. The lookup table is implemented correctly.
     *
     * First of all, note the asymmetry: we do not explicitly add tuples corresponding to skew on the MSM side of the
     * table. Indeeed, this is implicit with `msm_round == 32`. Now, the point is that the pair (pc, round) uniquely
     * specifies the point + wNAF digit that we are processing (and adding to the accumulator) and both `pc` and `round`
     * are directly constrained to be monotonic.
     *
     * Suppose the Prover sets `q_addK = 0` when an honest Prover would set `q_addK == 1`. Then there would be some (pc,
     * round, wnaf_slice) that the Precomputed table added to its multiset that the prover did not add. The Prover can
     * _never_ "compensate" for this, as `pc` is locally constrained to be monotonic and `round` is constrained to be
     * periodic; this means that the Prover has "lost their chance" to add this element to the multiset and hence the
     * multiset equality check will fail.
     *
     * Conversely, if the Prover sets `q_addK = 1` when it should be set to 0, there are several options: either
     * we are at the end of a `round` (so e.g. `q_add4 ` _should_ be 0), or we are at a double row, or we are at a row
     * that should be all 0s. In the first two cases, as long as the Precomputed table is correctly constrained, again
     * we would be adding a tuple to the multiset that can never be hit by the Precomputed table due to `precompute_pc`
     * monotonicty and `precompute_round` periodicity (enforced in the precomputed columns.). In the final case, the
     * only way we don't break the multiset check is if `wnaf_slice == 0` for the corresponding `q_addK` that is on. But
     * then the lookup argument will fail, as there is no corresponding point when `pc = 0`. (Here it is helpful to
     * remember that `pc` stands for _point-counter_.) Note that this requires that `precompute_pc` is well-formed.
     *
     *
     * We apply consistency/continuity checks to q_add1/q_add2/q_add3/q_add4:
     * 1. If q_add2 = 1, require q_add1 = 1
     * 2. If q_add3 = 1, require q_add2 = 1
     * 3. If q_add4 = 1, require q_add3 = 1
     * 4. If q_add1_shift = 1 AND round does not update between rows, require q_add4 = 1
     *
     */

    /**
     * @brief Constrain msm_size and output of MSM computation via multiset equality
     *
     * @details
     * As explained in the section on constraining the addition wire values, to make everything work we also need to
     * constrain `msm_size`, something directly computed in the Transcript columns. We also need to "send" the final
     * output value of an MSM from the MSM table to the transcript table so it can continue its processing. (Send here
     * is a euphemism for constrain.) We do this via a multiset equality check of the form:
     *                      (pc, P.x, P.y, msm-size)
     * From the perspective of the MSM table, we add such a tuple only when `msm_transition_shift == 1` (i.e., the next
     * row begins a new MSM, meaning the current row is the last row of the just-completed MSM). The terms P.x and P.y
     * refer to the output values of the MSM just computed by the MSM table. `msm_size` is the size of the _just
     * completed_ MSM.
     *
     *
     */

    /**
     * @brief Looking up the slice-point products {-15[P], -13[P], ..., 13[P], 15[P]}
     *
     * @details
     * In the Point Table, for every point [P] that occurs in the MSM table, we compute the list of points: {-15[P],
     * -13[P], ..., 13[P], 15[P]}. (Note that these never vanish, as we only send a point to each table if they are
     * non-zero.) We then constrain the "slice products" that occur here via a lookup argument. For completeness, we
     * briefly sketch this.
     *
     * The PointTable will "write"  the following row to the lookup table: (pc, slice, x, y), where if `pc` corresponds
     * to an elliptic curve point [P] (`pc` is a decreasing counter of the non-zero points that occur in our
     * computation), slice ∈ {0, ..., 15}, and (x, y) are the affine coordinates of (2 * slice - 15)[P].
     *
     * The MSM table will then read a row of the same form. This constrains the MSM table to have correctly used the
     * wNAF * point in the Straus algorithm.
     *
     */

    /**
     * @brief Addition relation
     *
     * All addition operations in ECCVMMSMRelationImpl are conditional additions, as we sometimes want to add values and
     * other times simply want to propagate values (consider, e.g., when `q_add2 == 0`).
     *
     * This method returns three Accumulators: (x_out, y_out, slope_relation)
     * - x_out, y_out: Output point coordinates. Either an addition of inputs (if `selector == 1`), or xa/ya (if
     *   `selector == 0`).
     * - slope_relation: Constraint enforcing that lambda is computed correctly (lambda = 0 if selector = 0, else
     *   lambda = (yb - ya) / (xb - xa))
     *
     * The `collision_relation` parameter tracks a subrelation that validates xb != xa. This collision check means that
     * our system is only statistically complete, not perfectly complete. (See the `offset_generator` and the
     * `first_add` method for details.)
     *
     * Repeated calls to this method will increase the max degree of the Accumulator output: deg(x_out) = 1 +
     * max(deg(xa), deg(xb)), deg(y_out) = max(1 + deg(x_out), 1 + deg(ya)). In our application, we chain together 4 of
     * these with the pattern in such a way that the final x_out will have degree 5 and the final y_out will have
     * degree 6.
     */
    auto add = [&](auto& xb, auto& yb, auto& xa, auto& ya, auto& lambda, auto& selector, auto& collision_relation) {
        // computation of lambda is valid: if q == 1, then L == (yb - ya) / (xb - xa)
        // if q == 0, then L == 0. combining these into a single constraint yields:
        // q * (L * (xb - xa - 1) - (yb - ya)) + L = 0
        auto slope_relation = selector * (lambda * (xb - xa - 1) - (yb - ya)) + lambda;
        collision_relation += selector * (xb - xa);
        // x_out = L.L + (-xb - xa) * q + (1 - q) xa
        // deg L = 1, deg q = 1, min(deg(xa), deg(xb))≥ 1.
        // hence deg(x_out) = 1 + max(deg(xa), deg(xb))
        auto x_out = lambda.sqr() + (-xb - xa - xa) * selector + xa;

        // y_out = L . (xa - x_out) - ya * q + (1 - q) ya
        // hence deg(y_out) = max(1 + deg(x_out), 1 + deg(ya))
        auto y_out = lambda * (xa - x_out) + (-ya - ya) * selector + ya;
        return std::array<Accumulator, 3>{ x_out, y_out, slope_relation };
    };

    /**
     * @brief First Addition relation - handles the first addition in each row with inhomogeneous base point selection
     *
     * @details The first add operation per row is treated inhomogeneously based on whether we are starting a new MSM
     * or continuing an existing one across multiple rows.
     *
     * This method returns three Accumulators: (x_out, y_out, slope_relation), computed as follows:
     *
     * **Case 1: Continuing MSM (selector == 0, i.e., msm_transition == 0)**
     * - Add point (xa, ya) to the accumulator (xb, yb) from the previous row
     * - Example: In an MSM of size 9 spanning 3 rows, rows 2 and 3 use selector=0 to continue with their respective
     *   accumulators
     *
     * **Case 2: Starting new MSM (selector == 1, i.e., msm_transition == 1)**
     * - Add point (xa, ya) to the fixed "offset generator" point (xo, yo)
     * - The offset generator serves two purposes for honest Provers:
     *   (a) Ensures no intermediate MSM computations produce points at infinity
     *   (b) Eliminates branch logic for the EC ops
     * - Example: In an MSM of size 9, only row 1 has msm_transition=1 and uses the offset generator
     *
     * **Soundness via collision check:**
     * We enforce soundness by constraining that the x-coordinates of the two input points must differ (xa != xb or
     * xa != xo). This prevents the Prover from exploiting incomplete addition formula edge cases (point doubling or
     * adding inverses). The collision_relation accumulator tracks this constraint, which is later verified via an
     * inverse check.
     *
     * **Statistical completeness:**
     * Note that this technique is only *statistically* complete. There exist valid MSM computations where an honest
     * Prover would encounter x-coordinate collisions (xa == xb or xa == xo), causing the constraints to become
     * unsatisfiable. However, the probability of such a collision is negligible—equivalent to solving the discrete
     * logarithm problem.
     */
    auto first_add =
        [&](auto& xb, auto& yb, auto& xa, auto& ya, auto& lambda, auto& selector, auto& collision_relation) {
            // N.B. this is brittle - should be curve agnostic but we don't propagate the curve parameter into
            // relations!
            constexpr auto offset_generator = get_precomputed_generators<g1, "ECCVM_OFFSET_GENERATOR", 1>()[0];
            constexpr uint256_t oxu = offset_generator.x;
            constexpr uint256_t oyu = offset_generator.y;
            const Accumulator xo(oxu);
            const Accumulator yo(oyu);
            // set (x, y) to be either accumulator if `selector == 0` or OFFSET if `selector == 1`.
            auto x = xo * selector + xb * (-selector + 1);
            auto y = yo * selector + yb * (-selector + 1);
            auto slope_relation = lambda * (x - xa) - (y - ya); // degree 3
            collision_relation += (xa - x);
            auto x_out = lambda * lambda + (-x - xa);
            auto y_out = lambda * (xa - x_out) - ya;
            return std::array<Accumulator, 3>{ x_out, y_out, slope_relation };
        };

    // ADD operations (if row represents ADD round, not SKEW or DOUBLE)
    Accumulator x1_collision_relation(0);
    Accumulator x2_collision_relation(0);
    Accumulator x3_collision_relation(0);
    Accumulator x4_collision_relation(0);
    // If `msm_transition == 1`, we have started a new MSM. We need to treat the current value of [Acc] as the point at
    // infinity!
    auto [x_t1, y_t1, add_slope_relation1] =
        first_add(acc_x, acc_y, x1, y1, lambda1, msm_transition, x1_collision_relation); // [deg 2, deg 3]
    auto [x_t2, y_t2, add_slope_relation2] =
        add(x2, y2, x_t1, y_t1, lambda2, add2, x2_collision_relation); // [deg 3, deg 4]
    auto [x_t3, y_t3, add_slope_relation3] =
        add(x3, y3, x_t2, y_t2, lambda3, add3, x3_collision_relation); // [deg 4, deg 5]
    auto [x_t4, y_t4, add_slope_relation4] =
        add(x4, y4, x_t3, y_t3, lambda4, add4, x4_collision_relation); // [deg 5, deg 6]

    // Validate accumulator output matches ADD output if q_add = 1
    std::get<ADD_ACC_X>(accumulator) += q_add * (acc_x_shift - x_t4) * scaling_factor;
    std::get<ADD_ACC_Y>(accumulator) += q_add * (acc_y_shift - y_t4) * scaling_factor;
    // Validate slope relations for each addition separately to prevent cancellation attacks
    std::get<ADD_SLOPE_1>(accumulator) += q_add * add_slope_relation1 * scaling_factor;
    std::get<ADD_SLOPE_2>(accumulator) += q_add * add_slope_relation2 * scaling_factor;
    std::get<ADD_SLOPE_3>(accumulator) += q_add * add_slope_relation3 * scaling_factor;
    std::get<ADD_SLOPE_4>(accumulator) += q_add * add_slope_relation4 * scaling_factor;

    /**
     * @brief doubles a point.
     *
     * Degree of x_out = 2
     * Degree of y_out = 3
     * Degree of relation = 4
     */
    auto dbl = [&](auto& x, auto& y, auto& lambda) {
        auto two_x = x + x;
        auto slope_relation = lambda * (y + y) - (two_x + x) * x;
        auto x_out = lambda.sqr() - two_x;
        auto y_out = lambda * (x - x_out) - y;
        return std::array<Accumulator, 3>{ x_out, y_out, slope_relation };
    };

    /**
     * @brief
     *
     * Algorithm to determine if round is a DOUBLE round:
     *    1. count_shift >= msm_size
     *    2. round != 32
     *
     * Algorithm to process MSM DOUBLE round:
     * [Acc_shift] = ((([Acc].double()).double()).double()).double()
     *
     * As with additions, the column q_double describes whether row is a double round. It is Prover-defined.
     * The value of `msm_round` can only update when `q_double = 1` and we use this to ensure Prover correctly sets
     * `q_double`. The reason for this is that `msm_round` witnesses the wNAF digit we are processing, and we only
     * perform the four doublings when we are done processing a wNAF digit. See round transition relations further down.
     */
    auto [x_d1, y_d1, double_slope_relation1] = dbl(acc_x, acc_y, lambda1);
    auto [x_d2, y_d2, double_slope_relation2] = dbl(x_d1, y_d1, lambda2);
    auto [x_d3, y_d3, double_slope_relation3] = dbl(x_d2, y_d2, lambda3);
    auto [x_d4, y_d4, double_slope_relation4] = dbl(x_d3, y_d3, lambda4);
    std::get<DOUBLE_ACC_X>(accumulator) += q_double * (acc_x_shift - x_d4) * scaling_factor;
    std::get<DOUBLE_ACC_Y>(accumulator) += q_double * (acc_y_shift - y_d4) * scaling_factor;
    // Validate slope relations for each doubling separately to prevent cancellation attacks
    std::get<DOUBLE_SLOPE_1>(accumulator) += q_double * double_slope_relation1 * scaling_factor;
    std::get<DOUBLE_SLOPE_2>(accumulator) += q_double * double_slope_relation2 * scaling_factor;
    std::get<DOUBLE_SLOPE_3>(accumulator) += q_double * double_slope_relation3 * scaling_factor;
    std::get<DOUBLE_SLOPE_4>(accumulator) += q_double * double_slope_relation4 * scaling_factor;

    /**
     * @brief SKEW operations
     * When computing x * [P], if x is even we must subtract [P] from accumulator
     * (this is because our windowed non-adjacent-form can only represent odd numbers)
     * Round 32 represents "skew" round.
     * If scalar slice == 7, we add into accumulator (point_table[7] maps to -[P])
     * If scalar slice == 0, we do not add into accumulator
     * i.e. for the skew round we can use the slice values as our "selector" when doing conditional point adds
     *
     * As with addition and doubling, the column q_skew is prover-defined. It is precisely turned on when the round
     * is 32. We implement this constraint slightly differently. For more details, see the round transition relations
     * below.
     */
    static FF inverse_seven = FF(7).invert();
    auto skew1_select = slice1 * inverse_seven;
    auto skew2_select = slice2 * inverse_seven;
    auto skew3_select = slice3 * inverse_seven;
    auto skew4_select = slice4 * inverse_seven;
    Accumulator x1_skew_collision_relation(0);
    Accumulator x2_skew_collision_relation(0);
    Accumulator x3_skew_collision_relation(0);
    Accumulator x4_skew_collision_relation(0);
    // add skew points iff row is a SKEW row AND slice = 7 (point_table[7] maps to -[P])
    // N.B. while it would be nice to have one `add` relation for both ADD and SKEW rounds,
    // this would increase degree of sumcheck identity vs evaluating them separately.
    // This is because, for add rounds, the result of adding [P1], [Acc] is [P1 + Acc] or [P1]
    //             but for skew rounds, the result of adding [P1], [Acc] is [P1 + Acc] or [Acc]
    auto [x_s1, y_s1, skew_slope_relation1] =
        add(x1, y1, acc_x, acc_y, lambda1, skew1_select, x1_skew_collision_relation);
    auto [x_s2, y_s2, skew_slope_relation2] =
        add(x2, y2, x_s1, y_s1, lambda2, skew2_select, x2_skew_collision_relation);
    auto [x_s3, y_s3, skew_slope_relation3] =
        add(x3, y3, x_s2, y_s2, lambda3, skew3_select, x3_skew_collision_relation);
    auto [x_s4, y_s4, skew_slope_relation4] =
        add(x4, y4, x_s3, y_s3, lambda4, skew4_select, x4_skew_collision_relation);

    // Validate accumulator output matches SKEW output if q_skew = 1
    std::get<SKEW_ACC_X>(accumulator) += q_skew * (acc_x_shift - x_s4) * scaling_factor;
    std::get<SKEW_ACC_Y>(accumulator) += q_skew * (acc_y_shift - y_s4) * scaling_factor;
    // Validate slope relations for each skew addition separately to prevent cancellation attacks
    std::get<SKEW_SLOPE_1>(accumulator) += q_skew * skew_slope_relation1 * scaling_factor;
    std::get<SKEW_SLOPE_2>(accumulator) += q_skew * skew_slope_relation2 * scaling_factor;
    std::get<SKEW_SLOPE_3>(accumulator) += q_skew * skew_slope_relation3 * scaling_factor;
    std::get<SKEW_SLOPE_4>(accumulator) += q_skew * skew_slope_relation4 * scaling_factor;

    // Check x-coordinates do not collide if row is an ADD row or a SKEW row
    // if either q_add or q_skew = 1, an inverse should exist for each computed relation
    // Step 1: construct boolean selectors that describe whether we added a point at the current row
    const auto add_first_point = add1 * q_add + q_skew * skew1_select;
    const auto add_second_point = add2 * q_add + q_skew * skew2_select;
    const auto add_third_point = add3 * q_add + q_skew * skew3_select;
    const auto add_fourth_point = add4 * q_add + q_skew * skew4_select;
    // Step 2: construct the difference a.k.a. delta between x-coordinates for each point add (depending on if row is
    // ADD or SKEW)
    const auto x1_delta = x1_skew_collision_relation * q_skew + x1_collision_relation * q_add;
    const auto x2_delta = x2_skew_collision_relation * q_skew + x2_collision_relation * q_add;
    const auto x3_delta = x3_skew_collision_relation * q_skew + x3_collision_relation * q_add;
    const auto x4_delta = x4_skew_collision_relation * q_skew + x4_collision_relation * q_add;
    // Step 3: x_delta * inverse - 1 = 0 if we performed a point addition (else x_delta * inverse = 0)
    std::get<COLLISION_CHECK_1>(accumulator) += (x1_delta * collision_inverse1 - add_first_point) * scaling_factor;
    std::get<COLLISION_CHECK_2>(accumulator) += (x2_delta * collision_inverse2 - add_second_point) * scaling_factor;
    std::get<COLLISION_CHECK_3>(accumulator) += (x3_delta * collision_inverse3 - add_third_point) * scaling_factor;
    std::get<COLLISION_CHECK_4>(accumulator) += (x4_delta * collision_inverse4 - add_fourth_point) * scaling_factor;

    // When add_i = 0, force slice_i to ALSO be 0
    std::get<INACTIVE_SLICE_1>(accumulator) += (-add1 + 1) * slice1 * scaling_factor;
    std::get<INACTIVE_SLICE_2>(accumulator) += (-add2 + 1) * slice2 * scaling_factor;
    std::get<INACTIVE_SLICE_3>(accumulator) += (-add3 + 1) * slice3 * scaling_factor;
    std::get<INACTIVE_SLICE_4>(accumulator) += (-add4 + 1) * slice4 * scaling_factor;

    // SELECTORS ARE MUTUALLY EXCLUSIVE
    // at most one of q_skew, q_double, q_add can be nonzero.
    // note that as we can expect our table to be zero padded, we _do not_ insist that q_add + q_double + q_skew == 1.
    std::get<PHASE_SELECTOR_MUTUAL_EXCLUSIVITY>(accumulator) +=
        (q_add * q_double + q_add * q_skew + q_double * q_skew) * scaling_factor;

    // ACCUMULATOR PRESERVATION ON NO-OP ROWS
    // If no phase selector is active (q_add = q_double = q_skew = 0), the accumulator must not change.
    // Without this constraint, a malicious prover could insert no-op rows between active rows and
    // set arbitrary accumulator values on the next row, because the accumulator-update constraints
    // are all gated by their respective phase selectors.
    // We exclude two boundary cases:
    //   - msm_transition = 1 on the current row: msm_transition marks the first row of a new MSM
    //     (where q_add is also 1), but the final row of the entire MSM trace ALSO has msm_transition = 1
    //     with ALL phase selectors off. On that row, acc holds the MSM output and acc_shift need not
    //     be preserved. This is safe because the set relation constrains (pc, acc_x, acc_y, msm_size)
    //     at transitions. (NOTE: this is a design choice specified by the builder; we could equivalently propagate the
    //     accumulator one past the last MSM row and then not turn off the constraint when `msm_transition == 1`.)
    //   - lagrange_first = 1 (row TRACE_OFFSET): the first active row of the trace is zero-padded and the next row
    //     starts a fresh MSM whose accumulator is initialized via first_add, not by continuity.
    auto no_op_selector =
        (-q_add + 1) * (-q_double + 1) * (-q_skew + 1) * (-msm_transition + 1) * (-lagrange_first + 1); // degree 5
    std::get<IDLE_ROW_PRESERVES_ACC_X>(accumulator) +=
        no_op_selector * (acc_x_shift - acc_x) * scaling_factor; // degree 6
    std::get<IDLE_ROW_PRESERVES_ACC_Y>(accumulator) +=
        no_op_selector * (acc_y_shift - acc_y) * scaling_factor; // degree 6

    // MSM-START ANCHOR: the first row of every MSM block must have msm_transition = 1.
    //
    // `first_add` is gated on `msm_transition`: when msm_transition = 1 the chain begins from
    // offset_generator, when msm_transition = 0 the chain begins from the row's witness (acc_x, acc_y).
    // Without an anchor, the prover can flip msm_transition to 0 at the first row of an MSM and
    // open the chain from any point A, shifting the user-visible MSM result by (A - offset_generator).
    //
    // We force msm_transition_shift = 1 whenever the current row is not actively computing an MSM phase
    // (lagrange_first, idle padding, or the synthetic-final sentinel of the previous MSM) and the next
    // row activates a phase. q_add/q_double/q_skew are mutually exclusive booleans, so q_add_shift + q_double_shift +
    // q_skew_shift is itself boolean.
    auto curr_not_phase = (-q_add + 1) * (-q_double + 1) * (-q_skew + 1); // degree 3
    auto next_phase = q_add_shift + q_double_shift + q_skew_shift;        // degree 1
    std::get<MSM_TRANSITION_AT_ACTIVE_START>(accumulator) +=
        curr_not_phase * next_phase * (msm_transition_shift - 1) * scaling_factor; // degree 5

    // Validate that if q_add = 1 or q_skew = 1, add1 also is 1
    // NOTE(#2222): could just get rid of add1 as a column, as it is a linear combination.
    std::get<ADD1_DECOMPOSITION>(accumulator) += (add1 - q_add - q_skew) * scaling_factor;

    // ROUND TRANSITION LOGIC
    // `round_transition` describes whether we are transitioning between "rounds" of the MSM according to the Straus
    // algorithm. In particular, the `round` corresponds to the wNAF digit we are currently processing.

    const auto round_delta = round_shift - round;
    // If `msm_transition == 0` (next row) then `round_delta` is boolean; the round is internal to a given MSM and
    // represents the wNAF digit currently being processed. `round_delta == 0` means that the current and next steps of
    // the Straus algorithm are processing the same wNAF digit place.

    // `round_transition == 0` if `round_delta == 0` or the next row is an MSM transition.
    // if `round_transition != 0`, then `round_transition == round_delta == 1` by the following constraint.
    // in particular, `round_transition` is boolean. (`round_delta` is not boolean precisely one step before an MSM
    // transition, but that does not concern us here.)
    const auto round_transition = round_delta * (-msm_transition_shift + 1);
    std::get<ROUND_TRANSITION_FORCES_DELTA_ONE>(accumulator) += round_transition * (round_delta - 1) * scaling_factor;

    // If `round_transition == 1`, then `round_delta == 1` and `msm_transition_shift == 0`. Therefore, we wish to
    // constrain next row in the VM to either be a double (if `round != 31`) or skew (if `round == 31`). In either case,
    // the point is that we have finished processing a wNAF digit place and need to either perform the doublings to move
    // on to the next place _or_ we are at the last place and need to perform the skew computation to finish. These are
    // equationally represented as:
    //      round_transition * skew_shift * (round - 31) = 0 (if round tx and skew, then round == 31);
    //      round_transition * (skew_shift + double_shift - 1) = 0 (if round tx, then skew XOR double = 1).
    //      (-round_delta + 1) * q_double_shift = 1 (if q_double_shift == 1, then round_transition = 1)
    // together, these have the following implications: if round tx and round != 31, then double_shift = 1.
    // conversely, if round tx and double_shift == 0, then `q_skew_shift == 1` (which then forces `round == 31`).
    // similarly, if q_double_shift == 1, then round_transition == 0,
    // the fact that a round_transition occurs at the first time skew_shift == 1 follows from the fact that skew == 1
    // implies round == 32 and the above three relations, together with the _definition_ of round_transition.
    std::get<ROUND_TRANSITION_SKEW_IMPLIES_ROUND_31>(accumulator) +=
        round_transition * q_skew_shift * (round - LAST_ADDITION_ROUND) * scaling_factor;
    std::get<ROUND_TRANSITION_EXACTLY_ONE_DOUBLE_OR_SKEW>(accumulator) +=
        round_transition * (q_skew_shift + q_double_shift - 1) * scaling_factor;
    std::get<DOUBLE_REQUIRES_ROUND_CHANGE>(accumulator) += (-round_delta + 1) * q_double_shift * scaling_factor;
    // `round_minus_31_inv` is intentionally zero when round == 31, because (round - 31)^-1 is undefined there.
    // On every other active MSM row, it stores the canonical inverse (round - 31)^-1. Therefore, if q_double_shift
    // is active, the prover must witness that round != 31.
    std::get<DOUBLE_SHIFT_FORBIDS_ROUND_31>(accumulator) +=
        q_double_shift * (FF(1) - (round - FF(LAST_ADDITION_ROUND)) * round_minus_31_inv) * scaling_factor;
    // if the next is neither double nor skew, and we are not at an msm_transition, then round_delta = 0 and the next
    // "row" of our VM is processing the same wNAF digit place.
    std::get<ROUND_TRANSITION_NEEDS_DOUBLE_OR_SKEW>(accumulator) +=
        round_transition * (-q_double_shift + 1) * (-q_skew_shift + 1) * scaling_factor;

    // CONSTRAINING Q_DOUBLE AND Q_SKEW
    // NOTE: we have already constrained q_add, q_skew, and q_double to be mutually exclusive.

    // if double, next add = 1. As q_double, q_add, and q_skew are mutually exclusive, this suffices to force
    // q_double_shift == q_skew_shift == 0.
    std::get<DOUBLE_IMPLIES_NEXT_IS_ADD>(accumulator) += q_double * (-q_add_shift + 1) * scaling_factor;
    // if the current row has q_skew == 1 and the next row is _not_ an MSM transition, then q_skew_shift = 1.
    // this forces q_skew to precisely correspond to the rows where `round == 32`. Indeed, note that the first q_skew
    // bit is set correctly:
    //      round == 31, round_transition == 1 ==> q_skew_shift == 1. (if, to the contrary, q_double_shift == 1, then
    //      the q_add_shift_shift == 1, but we assume that we have correctly constrained the q_adds via the multiset
    //      argument. this means that q_double_shift == 0, which forces q_skew_shift == 1 because round_transition
    //      == 1.)
    // this means that the first row with `round == 32` has q_skew == 1. then all subsequent q_skew entries must be 1,
    // _until_ we start our new MSM.
    std::get<SKEW_PERSISTS_UNTIL_MSM_TRANSITION>(accumulator) +=
        (-msm_transition_shift + 1) * q_skew * (-q_skew_shift + 1) * scaling_factor;
    // if q_skew == 1, then round == 32. This is almost certainly redundant but psychologically useful to "constrain
    // both ends".
    std::get<SKEW_IMPLIES_ROUND_32>(accumulator) += q_skew * (-round + 32) * scaling_factor;

    // UPDATING THE COUNT

    // if we are changing the `round` (i.e., starting to process a new wNAF digit or at an msm transition), the
    // count_shift must be 0.
    std::get<COUNT_SHIFT_ZERO_ON_ROUND_CHANGE>(accumulator) += round_delta * count_shift * scaling_factor;
    // if msm_transition_shift = 0 and round_delta = 0, then the next "row" of the VM is processing the same wNAF digit.
    // this means that the count must increase: count_shift = count + add1 + add2 + add3 + add4
    std::get<COUNT_INCREMENT_WITHIN_ROUND>(accumulator) += (-msm_transition_shift + 1) * (-round_delta + 1) *
                                                           (count_shift - count - add1 - add2 - add3 - add4) *
                                                           scaling_factor;

    // at least one of the following must be true:
    //      the next step is an MSM transition;
    //      the next count is zero (meaning we are starting the processing of a new wNAF digit)
    //      the next step is processing the same wNAF digit (i.e., round_delta == 0)
    // (note that at the start of a new MSM, the count is also zero, so the above are not mutually exclusive.)
    std::get<COUNT_ZERO_AT_ROUND_BOUNDARY_OR_TRANSITION>(accumulator) +=
        is_not_first_row * (-msm_transition_shift + 1) * round_delta * count_shift * scaling_factor;

    // if msm_transition = 1, then round = 0.
    std::get<MSM_TRANSITION_ROUND_ZERO>(accumulator) += msm_transition * round * scaling_factor;

    // if msm_transition_shift = 1, pc = pc_shift + msm_size
    // NB: `ecc_set_relation` ensures `msm_size` maps to `transcript.msm_count` for the current value of `pc`
    std::get<MSM_TRANSITION_PC>(accumulator) +=
        is_not_first_row * msm_transition_shift * (msm_size + pc_shift - pc) * scaling_factor;

    // Pin `msm_pc` constant within an MSM segment. On every ADD or DOUBLE row that is not the last
    // row of its segment, `pc_shift = pc`. Without this, the multiset arguments alone do not force
    // per-row consistency of `msm_pc` — a swap of `(msm_pc, slice, x, y, lambda, collision_x)`
    // between two same-base MSMs at the same interior round still balances both the WNAF and
    // lookup multisets, but produces swapped final accumulators. The constraint fires at the row
    // immediately preceding any ADD or SKEW swap (always a DOUBLE for an interior swap, or the
    // round-31 ADD for a SKEW swap), so q_skew is intentionally excluded from `active_phase` —
    // including it would also fire at the last skew row of the entire MSM trace, which is followed
    // by trailing idle rows where msm_transition_shift = 0. Requires `msm_pc` to be populated on
    // DOUBLE rows (see `msm_builder.hpp`).
    const auto active_phase = q_add + q_double;
    std::get<MSM_PC_CONTINUITY>(accumulator) +=
        is_not_first_row * active_phase * (-msm_transition_shift + 1) * (pc_shift - pc) * scaling_factor;

    // Pin `msm_pc` across consecutive SKEW rows of a segment. The skew round spans `ceil(msm_size/4)`
    // rows; for msm_size >= 9 it has interior skew rows that `MSM_PC_CONTINUITY` leaves free (its
    // `active_phase` excludes q_skew, and `MSM_TRANSITION_PC` only pins the last skew row).
    std::get<MSM_PC_SKEW_CONTINUITY>(accumulator) += q_skew * q_skew_shift * (pc_shift - pc) * scaling_factor;

    // Addition continuity checks
    // We want to RULE OUT the following scenarios:
    // Case 1: add2 = 1, add1 = 0
    // Case 2: add3 = 1, add2 = 0
    // Case 3: add4 = 1, add3 = 0
    // These checks ensure that the current row does not skip points (for both ADD and SKEW ops)
    // This is part of a wider set of checks we use to ensure that all point data is used in the assigned
    // multiscalar multiplication operation (and not in a different MSM operation).
    std::get<ADD_CONTINUITY_2>(accumulator) += add2 * (-add1 + 1) * scaling_factor;
    std::get<ADD_CONTINUITY_3>(accumulator) += add3 * (-add2 + 1) * scaling_factor;
    std::get<ADD_CONTINUITY_4>(accumulator) += add4 * (-add3 + 1) * scaling_factor;

    // Final continuity check.
    // If an addition spans two rows, we need to make sure that the following scenario is RULED OUT:
    //   add4 = 0 on the CURRENT row, add1 = 1 on the NEXT row
    // We must apply the above for the two cases:
    // Case 1: q_add = 1 on the CURRENT row, q_add = 1 on the NEXT row
    // Case 2: q_skew = 1 on the CURRENT row, q_skew = 1 on the NEXT row
    // (i.e. if q_skew = 1, q_add_shift = 1 this implies an MSM transition so we skip this continuity check)
    std::get<ADD_CROSS_ROW_CONTINUITY>(accumulator) +=
        (q_add * q_add_shift + q_skew * q_skew_shift) * (-add4 + 1) * add1_shift * scaling_factor;

    // remaining checks (done in ecc_set_relation.hpp, ecc_lookup_relation.hpp)
    // when transition occurs, perform set membership lookup on (accumulator / pc / msm_size)
    // perform set membership lookups on add_i * (pc / round / slice_i)
    // perform lookups on (pc / slice_i / x / y)

    // We look up wnaf slices by mapping round + pc -> slice
    // We use an exact set membership check to validate that
    // wnafs written in wnaf_relation == wnafs read in msm relation
    // We use `add1/add2/add3/add4` to flag whether we are performing a wnaf read op
    // We can set these to be Prover-defined as the set membership check implicitly ensures that the correct reads
    // have occurred.
}

} // namespace bb
