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

    // 256 per input (a and b), and 3 different bitwise ops
    constexpr auto num_rows = 256 * 256 * 3;
    trace.reserve_column(C::precomputed_sel_bitwise, num_rows);
    trace.reserve_column(C::precomputed_bitwise_input_a, num_rows);
    trace.reserve_column(C::precomputed_bitwise_input_b, num_rows);
    trace.reserve_column(C::precomputed_bitwise_output, num_rows);

    // row # is derived as:
    //     - input_b: bits 0...7 (0 being LSB)
    //     - input_a: bits 8...15
    //     - op_id: bits 16...
    // In other words, the first 256*256 rows are for op_id 0. Next are for op_id 1, followed by op_id 2.
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

/**
 * Generate a selector column that activates the first 2^8 (256) rows.
 * We can enforce that a value X is <= 8 bits via a lookup that checks
 * whether the selector (sel_range_8) is high at the corresponding
 * clk's row (X==clk).
 */
void PrecomputedTraceBuilder::process_sel_range_8(TraceContainer& trace)
{
    using C = Column;

    constexpr auto num_rows = 1 << 8; // 256
    // Set this selector high for the first 2^8 rows
    // For these rows, clk will be 0...255
    trace.reserve_column(C::precomputed_sel_range_8, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_sel_range_8, i, 1);
    }
}

/**
 * Generate a selector column that activates the first 2^16 rows.
 * We can enforce that a value X is <= 16 bits via a lookup that checks
 * whether the selector (sel_range_16) is high at the corresponding
 * clk's row (X==clk).
 */
void PrecomputedTraceBuilder::process_sel_range_16(TraceContainer& trace)
{
    using C = Column;

    constexpr auto num_rows = 1 << 16; // 2^16
    // Set this selector high for the first 2^16 rows
    // For these rows, clk will be 0...2^16-1
    trace.reserve_column(C::precomputed_sel_range_16, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_sel_range_16, i, 1);
    }
}

/**
 * Generate a column where each row is a power of 2 (2^clk).
 * Populate the first 256 rows.
 */
void PrecomputedTraceBuilder::process_power_of_2(TraceContainer& trace)
{
    using C = Column;

    constexpr auto num_rows = 1 << 8; // 2^8 = 256
    trace.reserve_column(C::precomputed_power_of_2, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_power_of_2, i, 1 << i);
    }
}

} // namespace bb::avm2::tracegen
