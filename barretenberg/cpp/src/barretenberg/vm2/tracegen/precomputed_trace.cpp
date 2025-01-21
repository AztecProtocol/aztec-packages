#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/common/constants.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

namespace bb::avm2::tracegen {

void PrecomputedTraceBuilder::process_misc(TraceContainer& trace)
{
    using C = Column;

    // First row.
    trace.set(C::precomputed_first_row, 0, 1);

    // Clk.
    // TODO: What a waste of 64MB. Can we elegantly have a flag for this?
    trace.reserve_column(C::precomputed_clk, CIRCUIT_SUBGROUP_SIZE);
    for (uint32_t i = 0; i < CIRCUIT_SUBGROUP_SIZE; i++) {
        trace.set(C::precomputed_clk, i, i);
    }
}

void PrecomputedTraceBuilder::process_bitwise(TraceContainer& trace)
{
    using C = Column;

    constexpr auto num_rows = 256 * 256 * 3;
    trace.reserve_column(C::precomputed_sel_bitwise, num_rows);
    trace.reserve_column(C::precomputed_bitwise_input_a, num_rows);
    trace.reserve_column(C::precomputed_bitwise_input_b, num_rows);
    trace.reserve_column(C::precomputed_bitwise_output, num_rows);

    auto row_from_inputs = [](uint32_t op_id, uint32_t input_a, uint32_t input_b) -> uint32_t {
        return (op_id << 16) | (input_a << 8) | input_b;
    };
    auto compute_operation = [](int op_id, uint32_t a, uint32_t b) -> uint32_t {
        switch (op_id) {
        case 0:
            return a & b;
        case 1:
            return a | b;
        case 2:
            return a ^ b;
        default:
            return 0;
        }
    };

    for (const auto op_id : { /*AND*/ 0, /*OR*/ 1, /*XOR*/ 2 }) {
        for (uint32_t a = 0; a < 256; a++) {
            for (uint32_t b = 0; b < 256; b++) {
                trace.set(row_from_inputs(static_cast<uint32_t>(op_id), a, b),
                          { {
                              { C::precomputed_sel_bitwise, 1 },
                              { C::precomputed_bitwise_op_id, op_id },
                              { C::precomputed_bitwise_input_a, FF(a) },
                              { C::precomputed_bitwise_input_b, FF(b) },
                              { C::precomputed_bitwise_output, FF(compute_operation(op_id, a, b)) },
                          } });
            }
        }
    }
}

} // namespace bb::avm2::tracegen