#include "barretenberg/vm2/tracegen/ecc_trace.hpp"

#include <cassert>
#include <memory>

#include "barretenberg/vm2/generated/relations/lookups_ecc_mem.hpp"
#include "barretenberg/vm2/generated/relations/lookups_scalar_mul.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

namespace {

/**
 * @brief Helper to calculate lambda for ECC add operations.
 * For operations not involving the point at infinity:
 * Add (add_predicate == true):
 *      lambda := (q_y - p_y) / (q_x - p_x)
 * Double (double_predicate == true):
 *      lambda := 3*p_x^2 / 2*p_y
 * @param double_predicate Whether we are doubling (p == q).
 * @param add_predicate Whether we are adding (p != q).
 * @param result_is_infinity Whether the result is infinity (p == -q, including p == q == infinity).
 * @param p The point p.
 * @param q The point q.
 * @return Computed lambda.
 */
FF compute_lambda(bool double_predicate,
                  bool add_predicate,
                  bool result_is_infinity,
                  const EmbeddedCurvePoint& p,
                  const EmbeddedCurvePoint& q)
{
    // If result_is_infinity && double_predicate, then we are doubling infinity (represented as (0, 0))
    // and must set lambda as zero, otherwise we'd be inverting zero here.
    if (!result_is_infinity && double_predicate) {
        return (p.x() * p.x() * 3) / (p.y() * 2);
    }
    if (add_predicate) {
        return (q.y() - p.y()) / (q.x() - p.x());
    }
    return 0;
}

/**
 * @brief Helper to compute the (re-formulated) Grumpkin curve equation: y^2 - (x^3 - 17).
 * @param p The point p.
 * @return The computed result (= 0 if p is on the curve).
 */
FF compute_curve_eqn_diff(const EmbeddedCurvePoint& p)
{
    if (p.on_curve()) {
        return FF::zero();
    }
    // The curve equation is y^2 = x^3 - 17
    const FF y2 = p.y() * p.y();
    const FF x3 = p.x() * p.x() * p.x();
    return y2 - (x3 - FF(17));
}

} // namespace

/**
 * @brief Process the ECC add events and populate the relevant columns in the trace.
 *  Corresponds to the non-memory aware subtrace ecc.pil.
 *
 * @param events The container of ECC add events to process.
 * @param trace The trace container.
 */
void EccTraceBuilder::process_add(const simulation::EventEmitterInterface<simulation::EccAddEvent>::Container& events,
                                  TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        // All points in an EccAddEvent are assumed to be on the curve and normalized.
        EmbeddedCurvePoint p = event.p;
        EmbeddedCurvePoint q = event.q;
        EmbeddedCurvePoint result = event.result;

        bool x_match = p.x() == q.x();
        bool y_match = p.y() == q.y();

        // Choose operation:

        // If both points are the same, double (double_op == 1).
        bool double_predicate = (x_match && y_match);
        // If both points differ and are NOT inverses, add (add_op == 1). This predicate is true when x-coordinates
        // differ (regardless of y-coordinates). PIL constraint: sel = double_op + add_op + INVERSE_PRED, where
        // INVERSE_PRED = x_match * (1 - y_match). When x_match=0: double_op=0, INVERSE_PRED=0, so add_op must be 1.
        bool add_predicate = !x_match;
        // If the points are inverses, the result is the infinity point when adding (INVERSE_PRED == 1).
        // This is implied when x-coordinates match but the y's don't.
        bool inverse_predicate = (x_match && !y_match);

        // Assign intermediate columns:

        // If our computation does not involve the point at infinity, use_computed_result == 1.
        bool use_computed_result = !inverse_predicate && (!p.is_infinity() && !q.is_infinity());
        // The result is the infinity point if:
        // (1) we hit the inverse predicate, p = -q (and neither p nor q are the infinity point)*
        // (2) or both p and q are the infinity point, p = q = O
        //  * Note: Technically, if p = q = point at infinity then p and q /are/ inverses (since p + q = p + -p =
        //  infinity), but we consider that case separately. This is because, being a SW curve, the infinity point does
        //  not have real coordinates (we represent it as (0,0)) and we treat it with edge cases.
        bool result_is_infinity = inverse_predicate && (!p.is_infinity() && !q.is_infinity());
        result_is_infinity = result_is_infinity || (p.is_infinity() && q.is_infinity());
        // Check corresponding to the #[INFINITY_RESULT] relation.
        BB_ASSERT_EQ(result_is_infinity, result.is_infinity(), "Inconsistent infinity result assumption");

        // Compute lambda:
        // For cases without infinity (use_computed_result == true) we have:
        //  result.x := lambda^2 - p.x - q.x (= COMPUTED_R_X)
        //  result.y := lambda * (p.x - result.x) - p.y (= COMPUTED_R_Y)
        // where lambda is the 'slope' between p & q.
        FF lambda = compute_lambda(double_predicate, add_predicate, result_is_infinity, p, q);

        trace.set(row,
                  { {
                      { C::ecc_sel, 1 },
                      // Point P
                      { C::ecc_p_x, p.x() },
                      { C::ecc_p_y, p.y() },
                      { C::ecc_p_is_inf, p.is_infinity() ? 1 : 0 },
                      // Point Q
                      { C::ecc_q_x, q.x() },
                      { C::ecc_q_y, q.y() },
                      { C::ecc_q_is_inf, q.is_infinity() ? 1 : 0 },
                      // Resulting point
                      { C::ecc_r_x, result.x() },
                      { C::ecc_r_y, result.y() },
                      { C::ecc_r_is_inf, result.is_infinity() ? 1 : 0 },

                      // Temporary result boolean to decrease relation degree
                      { C::ecc_use_computed_result, use_computed_result },

                      // Check coordinates to detect edge cases (double, add and infinity)
                      { C::ecc_x_match, x_match },
                      { C::ecc_inv_x_diff, q.x() - p.x() }, // Will be inverted in batch later
                      { C::ecc_y_match, y_match },
                      { C::ecc_inv_y_diff, q.y() - p.y() }, // Will be inverted in batch later

                      // Witness for doubling operation
                      { C::ecc_double_op, double_predicate },
                      { C::ecc_inv_2_p_y,
                        !result_is_infinity && double_predicate ? (p.y() * 2)
                                                                : FF::zero() }, // Will be inverted in batch later

                      // Witness for add operation
                      { C::ecc_add_op, add_predicate },
                      // This is a witness for the result(r) being the point at infinity
                      // It is used to constrain that ecc_r_is_inf is correctly set.
                      { C::ecc_result_infinity, result_is_infinity },
                      // The computed 'slope' between points P and Q.
                      { C::ecc_lambda, lambda },
                  } });

        row++;
    }

    // This subtrace requires 3 inverses:
    //  (1): For a standard equality check on the x coordinates (to assign x_match) /and/ as part of the lambda
    //       calculation when adding (denom = q.x - p.x)
    //  (2): For a standard equality check on the y coordinates (to assign y_match)
    //  (3): As part of the lambda calculation when doubling (denom = 2y)
    // Batch invert the columns.
    trace.invert_columns({ { C::ecc_inv_x_diff, C::ecc_inv_y_diff, C::ecc_inv_2_p_y } });
}

/**
 * @brief Process the ECC scalar multiplication events and populate the relevant columns in the trace.
 *  Corresponds to the subtrace scalar_mul.pil.
 *
 * @param events The container of ECC scalar mul events to process.
 * @param trace The trace container.
 */
void EccTraceBuilder::process_scalar_mul(
    const simulation::EventEmitterInterface<simulation::ScalarMulEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    // Each event corresponds to one scalar mul (s*P = R), and each event.intermediate_state corresponds to
    // a row in the trace, which is a single iteration of the double and add algorithm (see scalar_mul.pil).
    // This subtrace constrains the doubles/adds with the ecc subtrace (see process_add) via separate add events.

    // The computation has been completed in simulation, so here we simply assign the columns. The majority
    // of the work is to arrange the rows in reverse bit order.

    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.
    for (const auto& event : events) {
        // Note: the below should always be 254 (= FF bit size).
        size_t num_intermediate_states = event.intermediate_states.size();
        // The input point is assumed to be on the curve.
        EmbeddedCurvePoint point = event.point;

        for (size_t i = 0; i < num_intermediate_states; ++i) {
            // This trace uses reverse aggregation, so we need to process the bits in reverse.
            size_t intermediate_state_idx = num_intermediate_states - i - 1;
            simulation::ScalarMulIntermediateState state = event.intermediate_states[intermediate_state_idx];

            // Hence, the first bit processed is the end of the trace for the event...
            bool is_end = intermediate_state_idx == 0;
            // ...and the final bit processed is the start of the trace:
            bool is_start = i == 0;
            if (is_start) {
                BB_ASSERT_EQ(state.res, event.result, "Inconsistent result assumption");
            }

            EmbeddedCurvePoint res = state.res;
            EmbeddedCurvePoint temp = state.temp;
            bool bit = state.bit;

            trace.set(row,
                      { { { C::scalar_mul_sel, 1 },
                          // Static columns:
                          //    Scalar
                          { C::scalar_mul_scalar, event.scalar },
                          //    Point P
                          { C::scalar_mul_point_x, point.x() },
                          { C::scalar_mul_point_y, point.y() },
                          { C::scalar_mul_point_inf, point.is_infinity() ? 1 : 0 },
                          //    Constant (required for #[TO_RADIX] lookup)
                          { C::scalar_mul_const_two, 2 },
                          // Non static columns:
                          //    Point res
                          { C::scalar_mul_res_x, res.x() },
                          { C::scalar_mul_res_y, res.y() },
                          { C::scalar_mul_res_inf, res.is_infinity() ? 1 : 0 },
                          //    Flags
                          { C::scalar_mul_start, is_start },
                          { C::scalar_mul_end, is_end },
                          { C::scalar_mul_sel_not_end, !is_end },
                          //    Current bit and its index
                          { C::scalar_mul_bit, bit },
                          { C::scalar_mul_bit_idx, intermediate_state_idx },
                          //    Point temp
                          { C::scalar_mul_temp_x, temp.x() },
                          { C::scalar_mul_temp_y, temp.y() },
                          { C::scalar_mul_temp_inf, temp.is_infinity() ? 1 : 0 },
                          //    Should add flag
                          {
                              C::scalar_mul_should_add,
                              (!is_end) && bit,
                          } } });

            row++;
        }
    }
}

/**
 * @brief Process the ECC add memory events and populate the relevant columns in the trace.
 *  Corresponds to the memory aware subtrace ecc_mem.pil.
 *
 * @param events The container of ECC add memory events to process.
 * @param trace The trace container.
 */
void EccTraceBuilder::process_add_with_memory(
    const simulation::EventEmitterInterface<simulation::EccAddMemoryEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;

    // Each event corresponds to one memory aware add operation (P + Q = R). Using a single row, it constrains the
    // memory writes of the result point R and handles errors:
    // 1) Write out of bounds (dst_out_of_range_err)
    // 2) Point P not on the curve (p_not_on_curve_err)
    // 3) Point Q not on the curve (q_not_on_curve_err)

    // If there is no error, the trace constrains the correctness of the add result R with the ecc subtrace (see
    // process_add) via separate add events and the memory reads of the input points with the execution trace's
    // #[DISPATCH_TO_ECC_ADD]. The writes are handled in the trace with a permutation to memory (see #[WRITE_MEM_i]
    // and interactions perm_ecc_mem_write_mem_i for i = 0, 1, 2).

    // If there is an error, the event has an empty result point (0, 0, false), the add/write lookups/permutations are
    // skipped, and the error flag is set to 1. This flag is checked against sel_opcode_error in #[DISPATCH_TO_ECC_ADD].
    for (const auto& event : events) {
        // Address cast to uint64_t to capture possible overflow.
        uint64_t dst_addr = static_cast<uint64_t>(event.dst_address);

        // Error handling, check if the destination address is out of range.
        // The max write address is dst_addr + 2, since we write 3 values for R (x, y, is_inf).
        bool dst_out_of_range_err = dst_addr + 2 > AVM_HIGHEST_MEM_ADDRESS;

        // Error handling, check if the points are on the curve.
        // We do not use batch inversions as we do not need to invert in the happy path.
        bool p_is_on_curve = event.p.on_curve();
        FF p_is_on_curve_eqn = compute_curve_eqn_diff(event.p);
        FF p_is_on_curve_eqn_inv = p_is_on_curve ? FF::zero() : p_is_on_curve_eqn.invert();

        bool q_is_on_curve = event.q.on_curve();
        FF q_is_on_curve_eqn = compute_curve_eqn_diff(event.q);
        FF q_is_on_curve_eqn_inv = q_is_on_curve ? FF::zero() : q_is_on_curve_eqn.invert();

        bool error = dst_out_of_range_err || !p_is_on_curve || !q_is_on_curve;

        // Normalized points, ensures that input infinity points are represented by (0, 0) in the ecc subtrace.
        EmbeddedCurvePoint p_n = event.p.is_infinity() ? EmbeddedCurvePoint::infinity() : event.p;
        EmbeddedCurvePoint q_n = event.q.is_infinity() ? EmbeddedCurvePoint::infinity() : event.q;

        trace.set(row,
                  { {
                      { C::ecc_add_mem_sel, 1 },
                      { C::ecc_add_mem_execution_clk, event.execution_clk },
                      { C::ecc_add_mem_space_id, event.space_id },
                      // Error handling - dst out of range
                      { C::ecc_add_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
                      { C::ecc_add_mem_sel_dst_out_of_range_err, dst_out_of_range_err ? 1 : 0 },
                      // Error handling - p is not on curve
                      { C::ecc_add_mem_sel_p_not_on_curve_err, !p_is_on_curve ? 1 : 0 },
                      { C::ecc_add_mem_p_is_on_curve_eqn, p_is_on_curve_eqn },
                      { C::ecc_add_mem_p_is_on_curve_eqn_inv, p_is_on_curve_eqn_inv },
                      // Error handling - q is not on curve
                      { C::ecc_add_mem_sel_q_not_on_curve_err, !q_is_on_curve ? 1 : 0 },
                      { C::ecc_add_mem_q_is_on_curve_eqn, q_is_on_curve_eqn },
                      { C::ecc_add_mem_q_is_on_curve_eqn_inv, q_is_on_curve_eqn_inv },
                      // Consolidated error
                      { C::ecc_add_mem_err, error ? 1 : 0 },
                      // Memory Writes
                      { C::ecc_add_mem_dst_addr_0_, dst_addr },
                      { C::ecc_add_mem_dst_addr_1_, dst_addr + 1 },
                      { C::ecc_add_mem_dst_addr_2_, dst_addr + 2 },
                      // Input - Point P
                      { C::ecc_add_mem_p_x, event.p.x() },
                      { C::ecc_add_mem_p_y, event.p.y() },
                      { C::ecc_add_mem_p_is_inf, event.p.is_infinity() ? 1 : 0 },
                      // Input - Point Q
                      { C::ecc_add_mem_q_x, event.q.x() },
                      { C::ecc_add_mem_q_y, event.q.y() },
                      { C::ecc_add_mem_q_is_inf, event.q.is_infinity() ? 1 : 0 },
                      // Normalized input - Point P
                      { C::ecc_add_mem_p_x_n, p_n.x() },
                      { C::ecc_add_mem_p_y_n, p_n.y() },
                      // Normalized input - Point Q
                      { C::ecc_add_mem_q_x_n, q_n.x() },
                      { C::ecc_add_mem_q_y_n, q_n.y() },
                      // Output
                      { C::ecc_add_mem_sel_should_exec, error ? 0 : 1 },
                      { C::ecc_add_mem_res_x, event.result.x() },
                      { C::ecc_add_mem_res_y, event.result.y() },
                      { C::ecc_add_mem_res_is_inf, event.result.is_infinity() ? 1 : 0 },
                  } });

        row++;
    }
}

const InteractionDefinition EccTraceBuilder::interactions =
    InteractionDefinition()
        // Scalar Mul Interactions
        .add<lookup_scalar_mul_double_settings, InteractionType::LookupGeneric>()
        .add<lookup_scalar_mul_add_settings, InteractionType::LookupGeneric>()
        .add<lookup_scalar_mul_to_radix_settings, InteractionType::LookupGeneric>()
        // Memory Aware Interactions
        // Comparison
        .add<lookup_ecc_mem_check_dst_addr_in_range_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        // Lookup into ECC Add Subtrace
        .add<lookup_ecc_mem_input_output_ecc_add_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
