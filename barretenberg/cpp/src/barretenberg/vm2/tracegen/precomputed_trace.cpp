#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"

namespace bb::avm2::tracegen {

void PrecomputedTraceBuilder::process_misc(TraceContainer& trace, const uint32_t num_rows)
{
    using C = Column;

    // First row.
    trace.set(C::precomputed_first_row, 0, 1);

    // Clk
    // TODO: What a waste of 64MB. Can we elegantly have a flag for this?
    trace.reserve_column(C::precomputed_clk, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
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

        assert(false && "This should not happen");
        return 0; // Should never happen. To please the compiler.
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
    trace.reserve_column(C::precomputed_sel_sha256_compression, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(i,
                  { { { C::precomputed_sel_sha256_compression, 1 },
                      { C::precomputed_sha256_compression_round_constant, round_constants[i] } } });
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

void PrecomputedTraceBuilder::process_wire_instruction_spec(TraceContainer& trace)
{
    using C = Column;
    const std::array<Column, NUM_OP_DC_SELECTORS> sel_op_dc_columns = {
        C::precomputed_sel_op_dc_0,  C::precomputed_sel_op_dc_1,  C::precomputed_sel_op_dc_2,
        C::precomputed_sel_op_dc_3,  C::precomputed_sel_op_dc_4,  C::precomputed_sel_op_dc_5,
        C::precomputed_sel_op_dc_6,  C::precomputed_sel_op_dc_7,  C::precomputed_sel_op_dc_8,
        C::precomputed_sel_op_dc_9,  C::precomputed_sel_op_dc_10, C::precomputed_sel_op_dc_11,
        C::precomputed_sel_op_dc_12, C::precomputed_sel_op_dc_13, C::precomputed_sel_op_dc_14,
        C::precomputed_sel_op_dc_15, C::precomputed_sel_op_dc_16, C::precomputed_sel_op_dc_17,
    };

    // First set the selector for this table lookup.
    constexpr uint32_t num_rows = 1 << 8; // 256
    constexpr uint32_t num_opcodes = static_cast<uint32_t>(WireOpCode::LAST_OPCODE_SENTINEL);
    trace.reserve_column(C::precomputed_opcode_out_of_range, num_rows - num_opcodes);
    for (uint32_t i = num_opcodes; i < num_rows; i++) {
        trace.set(C::precomputed_opcode_out_of_range, i, 1);
    }

    for (size_t i = 0; i < NUM_OP_DC_SELECTORS; i++) {
        trace.reserve_column(sel_op_dc_columns.at(i), num_opcodes);
    }
    trace.reserve_column(C::precomputed_exec_opcode, num_opcodes);
    trace.reserve_column(C::precomputed_instr_size, num_opcodes);

    // Fill the lookup tables with the operand decomposition selectors.
    for (const auto& [wire_opcode, wire_instruction_spec] : WIRE_INSTRUCTION_SPEC) {
        for (size_t i = 0; i < NUM_OP_DC_SELECTORS; i++) {
            trace.set(sel_op_dc_columns.at(i),
                      static_cast<uint32_t>(wire_opcode),
                      wire_instruction_spec.op_dc_selectors.at(i));
        }
        trace.set(C::precomputed_exec_opcode,
                  static_cast<uint32_t>(wire_opcode),
                  static_cast<uint32_t>(wire_instruction_spec.exec_opcode));
        trace.set(C::precomputed_instr_size, static_cast<uint32_t>(wire_opcode), wire_instruction_spec.size_in_bytes);

        if (wire_instruction_spec.tag_operand_idx.has_value()) {
            trace.set(C::precomputed_sel_has_tag, static_cast<uint32_t>(wire_opcode), 1);

            if (wire_instruction_spec.tag_operand_idx.value() == 2) {
                trace.set(C::precomputed_sel_tag_is_op2, static_cast<uint32_t>(wire_opcode), 1);
            }
        }
    }
}

void PrecomputedTraceBuilder::process_to_radix_safe_limbs(TraceContainer& trace)
{
    using C = Column;

    auto p_limbs_per_radix = get_p_limbs_per_radix();

    trace.reserve_column(C::precomputed_sel_to_radix_safe_limbs, p_limbs_per_radix.size());
    trace.reserve_column(C::precomputed_to_radix_safe_limbs, p_limbs_per_radix.size());

    for (size_t i = 0; i < p_limbs_per_radix.size(); ++i) {
        size_t decomposition_len = p_limbs_per_radix[i].size();
        if (decomposition_len > 0) {
            trace.set(C::precomputed_sel_to_radix_safe_limbs, static_cast<uint32_t>(i), 1);
            trace.set(C::precomputed_to_radix_safe_limbs, static_cast<uint32_t>(i), decomposition_len - 1);
        }
    }
}

void PrecomputedTraceBuilder::process_to_radix_p_decompositions(TraceContainer& trace)
{
    using C = Column;

    auto p_limbs_per_radix = get_p_limbs_per_radix();

    uint32_t row = 0;
    for (size_t i = 0; i < p_limbs_per_radix.size(); ++i) {
        size_t decomposition_len = p_limbs_per_radix[i].size();
        for (size_t j = 0; j < decomposition_len; ++j) {
            trace.set(C::precomputed_sel_p_decomposition, row, 1);
            trace.set(C::precomputed_p_decomposition_radix, row, i);
            trace.set(C::precomputed_p_decomposition_limb_index, row, j);
            trace.set(C::precomputed_p_decomposition_limb, row, p_limbs_per_radix[i][j]);
            row++;
        }
    }
}

void PrecomputedTraceBuilder::process_memory_tag_range(TraceContainer& trace)
{
    using C = Column;

    constexpr uint32_t num_rows = 1 << 8; // 256

    for (uint32_t i = static_cast<uint32_t>(MemoryTag::MAX) + 1; i < num_rows; i++) {
        trace.set(C::precomputed_sel_mem_tag_out_of_range, i, 1);
    }
}

} // namespace bb::avm2::tracegen
