#include "barretenberg/vm2/tracegen/ecc_trace.hpp"

#include <cassert>
#include <memory>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_ecc_mem.hpp"
#include "barretenberg/vm2/generated/relations/lookups_scalar_mul.hpp"
#include "barretenberg/vm2/generated/relations/perms_ecc_mem.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

namespace {

FF compute_lambda(bool double_predicate,
                  bool add_predicate,
                  bool result_is_infinity,
                  const EmbeddedCurvePoint& p,
                  const EmbeddedCurvePoint& q)
{
    // When doubling infinity lambda must be zero
    // If not, we'd be inverting zero here
    if (!result_is_infinity && double_predicate) {
        return (p.x() * p.x() * 3) / (p.y() * 2);
    }
    if (add_predicate) {
        return (q.y() - p.y()) / (q.x() - p.x());
    }
    return 0;
}

// Helper to compute the (re-formulated) Grumpkin curve equation: y^2 - (x^3 - 17)
FF compute_curve_eqn_diff(const EmbeddedCurvePoint& p)
{
    if (p.is_infinity()) {
        // We consider the curve equation to be trivially satisfied for the infinity point.
        return FF::zero();
    }
    // The curve equation is y^2 = x^3 - 17
    const FF y2 = p.y() * p.y();
    const FF x3 = p.x() * p.x() * p.x();
    return y2 - (x3 - FF(17));
}

} // namespace

void EccTraceBuilder::process_add(const simulation::EventEmitterInterface<simulation::EccAddEvent>::Container& events,
                                  TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        EmbeddedCurvePoint p = event.p;
        EmbeddedCurvePoint q = event.q;
        EmbeddedCurvePoint result = event.result;

        bool x_match = p.x() == q.x();
        bool y_match = p.y() == q.y();

        bool double_predicate = (x_match && y_match);
        bool add_predicate = (!x_match && !y_match);
        // If x match but the y's don't, the result is the infinity point when adding;
        bool infinity_predicate = (x_match && !y_match);
        // The result is also the infinity point if
        // (1) we hit the infinity predicate and neither p nor q are the infinity point
        // (2) or both p and q are the infinity point
        bool result_is_infinity = infinity_predicate && (!p.is_infinity() && !q.is_infinity());
        result_is_infinity = result_is_infinity || (p.is_infinity() && q.is_infinity());

        bool use_computed_result = !infinity_predicate && (!p.is_infinity() && !q.is_infinity());

        assert(result_is_infinity == result.is_infinity() && "Inconsistent infinity result assumption");

        FF lambda = compute_lambda(double_predicate, add_predicate, result_is_infinity, p, q);

        trace.set(row,
                  { {
                      { C::ecc_sel, 1 },
                      // Point P
                      { C::ecc_p_x, p.x() },
                      { C::ecc_p_y, p.y() },
                      { C::ecc_p_is_inf, p.is_infinity() },
                      // Point Q
                      { C::ecc_q_x, q.x() },
                      { C::ecc_q_y, q.y() },
                      { C::ecc_q_is_inf, q.is_infinity() },
                      // Resulting point
                      { C::ecc_r_x, result.x() },
                      { C::ecc_r_y, result.y() },
                      { C::ecc_r_is_inf, result.is_infinity() },

                      // Temporary result boolean to decrease relation degree
                      { C::ecc_use_computed_result, use_computed_result },

                      // Check coordinates to detect edge cases (double, add and infinity)
                      { C::ecc_x_match, x_match },
                      { C::ecc_inv_x_diff, x_match ? FF::zero() : (q.x() - p.x()).invert() },
                      { C::ecc_y_match, y_match },
                      { C::ecc_inv_y_diff, y_match ? FF::zero() : (q.y() - p.y()).invert() },

                      // Witness for doubling operation
                      { C::ecc_double_op, double_predicate },
                      { C::ecc_inv_2_p_y, !result_is_infinity && double_predicate ? (p.y() * 2).invert() : FF::zero() },

                      // Witness for add operation
                      { C::ecc_add_op, add_predicate },
                      // This is a witness for the result(r) being the point at infinity
                      // It is used to constrain that ecc_r_is_inf is correctly set.
                      { C::ecc_result_infinity, result_is_infinity },

                      { C::ecc_lambda, lambda },
                  } });

        row++;
    }
}

void EccTraceBuilder::process_scalar_mul(
    const simulation::EventEmitterInterface<simulation::ScalarMulEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 1; // We start from row 1 because this trace contains shifted columns.
    for (const auto& event : events) {
        size_t num_intermediate_states = event.intermediate_states.size();
        EmbeddedCurvePoint point = event.point;

        for (size_t i = 0; i < num_intermediate_states; ++i) {
            // This trace uses reverse aggregation, so we need to process the bits in reverse
            size_t intermediate_state_idx = num_intermediate_states - i - 1;

            // The first bit processed is the end of the trace for the event
            bool is_start = i == 0;

            bool is_end = intermediate_state_idx == 0;

            simulation::ScalarMulIntermediateState state = event.intermediate_states[intermediate_state_idx];
            if (is_start) {
                assert(state.res == event.result);
            }
            EmbeddedCurvePoint res = state.res;

            EmbeddedCurvePoint temp = state.temp;
            bool bit = state.bit;

            trace.set(row,
                      { { { C::scalar_mul_sel, 1 },
                          { C::scalar_mul_scalar, event.scalar },
                          { C::scalar_mul_point_x, point.x() },
                          { C::scalar_mul_point_y, point.y() },
                          { C::scalar_mul_point_inf, point.is_infinity() },
                          { C::scalar_mul_res_x, res.x() },
                          { C::scalar_mul_res_y, res.y() },
                          { C::scalar_mul_res_inf, res.is_infinity() },
                          { C::scalar_mul_start, is_start },
                          { C::scalar_mul_end, is_end },
                          { C::scalar_mul_not_end, !is_end },
                          { C::scalar_mul_bit, bit },
                          { C::scalar_mul_bit_idx, intermediate_state_idx },
                          { C::scalar_mul_temp_x, temp.x() },
                          { C::scalar_mul_temp_y, temp.y() },
                          { C::scalar_mul_temp_inf, temp.is_infinity() },
                          {
                              C::scalar_mul_should_add,
                              (!is_end) && bit,
                          },
                          { C::scalar_mul_bit_radix, 2 } } });

            row++;
        }
    }
}

void EccTraceBuilder::process_add_with_memory(
    const simulation::EventEmitterInterface<simulation::EccAddMemoryEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        uint64_t dst_addr = static_cast<uint64_t>(event.dst_address);

        // Error handling, check if the destination address is out of range.
        // The max write address is dst_addr + 2, since we write 3 values (x, y, is_inf).
        bool dst_out_of_range_err = dst_addr + 2 > AVM_HIGHEST_MEM_ADDRESS;

        // Error handling, check if the points are on the curve.
        bool p_is_on_curve = event.p.on_curve();
        FF p_is_on_curve_eqn = compute_curve_eqn_diff(event.p);
        FF p_is_on_curve_eqn_inv = p_is_on_curve ? FF::zero() : p_is_on_curve_eqn.invert();

        bool q_is_on_curve = event.q.on_curve();
        FF q_is_on_curve_eqn = compute_curve_eqn_diff(event.q);
        FF q_is_on_curve_eqn_inv = q_is_on_curve ? FF::zero() : q_is_on_curve_eqn.invert();

        bool error = dst_out_of_range_err || !p_is_on_curve || !q_is_on_curve;

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
                      // Output
                      { C::ecc_add_mem_sel_should_exec, error ? 0 : 1 },
                      { C::ecc_add_mem_res_x, event.result.x() },
                      { C::ecc_add_mem_res_y, event.result.y() },
                      { C::ecc_add_mem_res_is_inf, event.result.is_infinity() },
                  } });

        row++;
    }
}

const InteractionDefinition EccTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_scalar_mul_double_settings, InteractionType::LookupGeneric>()
        .add<lookup_scalar_mul_add_settings, InteractionType::LookupGeneric>()
        .add<lookup_scalar_mul_to_radix_settings, InteractionType::LookupGeneric>()
        // Memory Aware Interactions
        // Comparison
        .add<lookup_ecc_mem_check_dst_addr_in_range_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        // Lookup into ECC Add Subtrace
        .add<lookup_ecc_mem_input_output_ecc_add_settings, InteractionType::LookupGeneric>()
        // Dispatch Permutation
        .add<perm_ecc_mem_dispatch_exec_ecc_add_settings, InteractionType::Permutation>();

} // namespace bb::avm2::tracegen
