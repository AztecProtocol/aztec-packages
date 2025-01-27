#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
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
    auto row_from_inputs = [](BitwiseOperation op_id, uint32_t input_a, uint32_t input_b) -> uint32_t {
        return (static_cast<uint32_t>(op_id) << 16) | (input_a << 8) | input_b;
    };
    auto compute_operation = [](BitwiseOperation op_id, uint32_t a, uint32_t b) -> uint32_t {
        switch (op_id) {
        case BitwiseOperation::AND:
            return a & b;
        case BitwiseOperation::OR:
            return a | b;
        case BitwiseOperation::XOR:
            return a ^ b;
        }
    };

    for (const auto op_id : { BitwiseOperation::AND, BitwiseOperation::OR, BitwiseOperation::XOR }) {
        for (uint32_t a = 0; a < 256; a++) {
            for (uint32_t b = 0; b < 256; b++) {
                trace.set(row_from_inputs(op_id, a, b),
                          { {
                              { C::precomputed_sel_bitwise, 1 },
                              { C::precomputed_bitwise_op_id, static_cast<uint8_t>(op_id) },
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

void PrecomputedTraceBuilder::process_unary(TraceContainer& trace)
{
    using C = Column;

    constexpr auto num_rows = 64;
    trace.reserve_column(C::precomputed_sel_unary, num_rows);
    trace.reserve_column(C::precomputed_as_unary, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_sel_unary, i, 1);
        uint64_t value = (static_cast<uint64_t>(1) << i) - 1;
        trace.set(C::precomputed_as_unary, i, value);
    }
}

void PrecomputedTraceBuilder::process_sha256_round_constants(TraceContainer& trace)
{
    using C = Column;

    constexpr std::array<uint32_t, 64> round_constants{
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    };
    constexpr auto num_rows = round_constants.size();
    trace.reserve_column(C::precomputed_sha256_compression_round_constant, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_sha256_compression_round_constant, i, round_constants[i]);
    }
}

void PrecomputedTraceBuilder::process_integral_tag_length(TraceContainer& trace)
{
    using C = Column;
    using bb::avm2::MemoryTag;

    // Column number corresponds to MemoryTag enum value.
    const auto integral_tags = { MemoryTag::U1,  MemoryTag::U8,  MemoryTag::U16,
                                 MemoryTag::U32, MemoryTag::U64, MemoryTag::U128 };

    for (const auto& tag : integral_tags) {
        trace.set(static_cast<uint32_t>(tag),
                  { { { C::precomputed_sel_integral_tag, 1 },
                      { C::precomputed_integral_tag_length, integral_tag_length(tag) } } });
    }
}

} // namespace bb::avm2::tracegen
