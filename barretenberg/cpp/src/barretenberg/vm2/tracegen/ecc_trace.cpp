#include "barretenberg/vm2/tracegen/ecc_trace.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::tracegen {

namespace {

FF compute_lambda(bool double_predicate, bool add_predicate, const AffinePoint& p, const AffinePoint& q)
{
    if (double_predicate) {
        return (p.x * p.x * 3) / (p.y * 2);
    }
    if (add_predicate) {
        return (q.y - p.y) / (q.x - p.x);
    }
    return 0;
}

} // namespace

void EccTraceBuilder::process_add(const simulation::EventEmitterInterface<simulation::EccAddEvent>::Container& events,
                                  TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        bool p_is_inf = event.p.is_point_at_infinity();
        bool q_is_inf = event.q.is_point_at_infinity();

        bool x_match = event.p.x == event.q.x;
        bool y_match = event.p.y == event.q.y;

        bool double_predicate = (x_match && y_match);
        bool add_predicate = (!x_match && !y_match);
        // If x match but the y's don't, the result is the infinity point when adding;
        bool infinity_predicate = (x_match && !y_match);
        // The result is also the infinity point if
        // (1) we hit the infinity predicate and neither p nor q are the infinity point
        // (2) or both p and q are the infinity point
        bool result_is_infinity = infinity_predicate && (!p_is_inf && !q_is_inf);
        result_is_infinity = result_is_infinity || (p_is_inf && q_is_inf);

        assert(result_is_infinity == event.result.is_point_at_infinity() && "Inconsistent infinity result assumption");

        FF lambda = compute_lambda(double_predicate, add_predicate, event.p, event.q);

        trace.set(row,
                  { {
                      { C::ecc_sel, 1 },
                      // Point P
                      { C::ecc_p_x, event.p.x },
                      { C::ecc_p_y, event.p.y },
                      { C::ecc_p_is_inf, p_is_inf },
                      // Point Q
                      { C::ecc_q_x, event.q.x },
                      { C::ecc_q_y, event.q.y },
                      { C::ecc_q_is_inf, q_is_inf },
                      // Resulting point
                      { C::ecc_r_x, event.result.x },
                      { C::ecc_r_y, event.result.y },
                      { C::ecc_r_is_inf, event.result.is_point_at_infinity() },

                      // Check coordinates to detect edge cases (double, add and infinity)
                      { C::ecc_x_match, x_match },
                      { C::ecc_inv_x_diff, x_match ? FF::zero() : (event.q.x - event.p.x).invert() },
                      { C::ecc_y_match, y_match },
                      { C::ecc_inv_y_diff, y_match ? FF::zero() : (event.q.y - event.p.y).invert() },

                      // Witness for doubling operation
                      { C::ecc_double_op, double_predicate },
                      { C::ecc_inv_2_p_y, double_predicate ? (event.p.y * 2).invert() : FF::zero() },

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

    uint32_t row = 0;
    for (const auto& event : events) {
        size_t num_intermediate_states = event.intermediate_states.size();
        AffinePoint p = event.point;

        for (size_t i = num_intermediate_states - 1; i >= 0; i--) {
            bool is_end = i == (num_intermediate_states - 1);

            simulation::ScalarMulIntermediateState state = event.intermediate_states[i];
            AffinePoint res = state.res;
            if (i == 0) {
                ASSERT(res == event.result);
            }
            AffinePoint temp = state.temp;
            bool bit = state.bit;

            trace.set(row,
                      { { { C::scalar_mul_sel, 1 },
                          { C::scalar_mul_scalar, event.scalar },
                          { C::scalar_mul_point_x, p.x },
                          { C::scalar_mul_point_y, p.y },
                          { C::scalar_mul_point_inf, p.is_point_at_infinity() },
                          { C::scalar_mul_res_x, res.x },
                          { C::scalar_mul_res_y, res.y },
                          { C::scalar_mul_res_inf, res.is_point_at_infinity() },
                          { C::scalar_mul_start, i == 0 },
                          { C::scalar_mul_end, is_end },
                          { C::scalar_mul_not_end, !is_end },
                          { C::scalar_mul_bit, bit },
                          { C::scalar_mul_bit_idx, i },
                          { C::scalar_mul_temp_x, temp.x },
                          { C::scalar_mul_temp_y, temp.y },
                          { C::scalar_mul_temp_inf, temp.is_point_at_infinity() },
                          {
                              C::scalar_mul_should_add,
                              (!is_end) && bit,
                          }

                      } });

            row++;
        }
    }
}

} // namespace bb::avm2::tracegen
