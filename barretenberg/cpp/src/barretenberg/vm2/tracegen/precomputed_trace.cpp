#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"

#include <array>
#include <cstdint>
#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/gas.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/simulation/gadgets/keccakf1600.hpp"
#include "barretenberg/vm2/tracegen/lib/get_contract_instance_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/get_env_var_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/phase_spec.hpp"

namespace bb::avm2::tracegen {

using C = Column;

/**
 * @brief Populate miscellaneous precomputed columns: first_row selector and idx (row index).
 * @details `precomputed_first_row` is 1 only at row 0. `precomputed_idx` holds the row index (0..num_rows-1)
 * and is used as the key for most precomputed lookups. `precomputed_zero` is intentionally left unset
 * (the trace container defaults to 0).
 */
void PrecomputedTraceBuilder::process_misc(TraceContainer& trace, const uint32_t num_rows)
{
    // First row.
    trace.set(C::precomputed_first_row, 0, 1);

    // Note: precomputed_zero is intentionally not populated.
    // The trace container defaults unset values to FF(0), which is the desired value.

    // Idx
    trace.reserve_column(C::precomputed_idx, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_idx, i, i);
    }
}

/**
 * @brief Populate the 8-bit bitwise lookup table (AND, OR, XOR).
 * @details Generates 256×256 = 65536 rows covering all pairs of 8-bit inputs (a, b).
 * Row index is derived as (a << 8) | b.
 */
void PrecomputedTraceBuilder::process_bitwise(TraceContainer& trace)
{
    // 256 per input (a and b), and 3 different bitwise ops
    constexpr auto num_rows = 256 * 256;
    static_assert(num_rows <= PRECOMPUTED_TRACE_SIZE);
    static_assert(num_rows == (1U << 16),
                  "bitwise table must span 2^16 rows for sel_range_16 to be a sound outer selector for "
                  "the committed sel_bitwise granular selector (see precomputed.pil)");
    trace.reserve_column(C::precomputed_bitwise_input_a, num_rows);
    trace.reserve_column(C::precomputed_bitwise_input_b, num_rows);
    trace.reserve_column(C::precomputed_bitwise_output_and, num_rows);
    trace.reserve_column(C::precomputed_bitwise_output_or, num_rows);
    trace.reserve_column(C::precomputed_bitwise_output_xor, num_rows);

    // row # is derived as:
    //     - input_b: bits 0...7 (0 being LSB)
    //     - input_a: bits 8...15
    for (uint32_t a = 0; a < 256; a++) {
        for (uint32_t b = 0; b < 256; b++) {
            trace.set((a << 8) | b,
                      { {
                          { C::precomputed_bitwise_input_a, FF(a) },
                          { C::precomputed_bitwise_input_b, FF(b) },
                          { C::precomputed_bitwise_output_and, FF(a & b) },
                          { C::precomputed_bitwise_output_or, FF(a | b) },
                          { C::precomputed_bitwise_output_xor, FF(a ^ b) },
                      } });
        }
    }
}

/**
 * @brief Generate a selector column that activates the first 2^8 (256) rows.
 * @details Enables 8-bit range checks: a value X is in [0, 255] iff sel_range_8 is 1
 * at the row where idx == X.
 */
void PrecomputedTraceBuilder::process_sel_range_8(TraceContainer& trace)
{
    constexpr auto num_rows = 1 << 8; // 256
    // Set this selector high for the first 2^8 rows
    // For these rows, idx will be 0...255
    trace.reserve_column(C::precomputed_sel_range_8, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_sel_range_8, i, 1);
    }
}

/**
 * @brief Generate a selector column that activates the first 2^16 (65536) rows.
 * @details Enables 16-bit range checks: a value X is in [0, 65535] iff sel_range_16 is 1
 * at the row where idx == X.
 */
void PrecomputedTraceBuilder::process_sel_range_16(TraceContainer& trace)
{
    constexpr auto num_rows = 1 << 16; // 2^16
    // Set this selector high for the first 2^16 rows
    // For these rows, idx will be 0...2^16-1
    trace.reserve_column(C::precomputed_sel_range_16, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_sel_range_16, i, 1);
    }
}

/**
 * @brief Generate a column where row i holds 2^i, for i in [0, 255], for the values of 254 and 255 the values are
 * modulo reduced by the field modulus (i.e. 2^254 and 2^255 mod p) since the trace operates over a finite field.
 */
void PrecomputedTraceBuilder::process_power_of_2(TraceContainer& trace)
{
    // This corresponds to the fact that sel_range_8 is used as the dst selector for lookups involving powers of 2.
    constexpr auto num_rows = 1 << 8; // 2^8 = 256
    trace.reserve_column(C::precomputed_power_of_2, num_rows);
    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_power_of_2, i, uint256_t(1) << uint256_t(i));
    }
}

/**
 * @brief Populate the 64 SHA-256 round constants (K_0 .. K_63) and their selector.
 * The sel_sha256_compression selector is set high on these rows.
 */
void PrecomputedTraceBuilder::process_sha256_round_constants(TraceContainer& trace)
{
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

/**
 * @brief Populate the memory tag parameters table (byte length, max bits, max value per tag).
 * @details One row per MemoryTag variant (FF=0, U1=1, U8=2, ..., U128=6).
 */
void PrecomputedTraceBuilder::process_tag_parameters(TraceContainer& trace)
{
    using bb::avm2::MemoryTag;

    constexpr uint32_t NUM_TAGS = static_cast<uint32_t>(MemoryTag::MAX) + 1;
    for (uint32_t i = 0; i < NUM_TAGS; i++) {
        const auto tag = static_cast<MemoryTag>(i);
        trace.set(i, // Column number corresponds to MemoryTag enum value.
                  { {
                      { C::precomputed_sel_tag_parameters, 1 },
                      { C::precomputed_tag_byte_length, get_tag_bytes(tag) },
                      { C::precomputed_tag_max_bits, get_tag_bits(tag) },
                      { C::precomputed_tag_max_value, get_tag_max_value(tag) },
                  } });
    }
}

/**
 * @brief Populate the wire-level instruction specification table.
 * @details One row per WireOpCode (0..67). Each row holds the operand decomposition selectors
 * (sel_op_dc_0..16), the corresponding ExecutionOpCode, instruction size in bytes, and tag
 * operand metadata. Rows beyond the last valid opcode are flagged with opcode_out_of_range.
 * Used by the instruction-fetch subtrace to decode bytecode.
 */
void PrecomputedTraceBuilder::process_wire_instruction_spec(TraceContainer& trace)
{
    const std::array<Column, NUM_OP_DC_SELECTORS> sel_op_dc_columns = {
        C::precomputed_sel_op_dc_0,  C::precomputed_sel_op_dc_1,  C::precomputed_sel_op_dc_2,
        C::precomputed_sel_op_dc_3,  C::precomputed_sel_op_dc_4,  C::precomputed_sel_op_dc_5,
        C::precomputed_sel_op_dc_6,  C::precomputed_sel_op_dc_7,  C::precomputed_sel_op_dc_8,
        C::precomputed_sel_op_dc_9,  C::precomputed_sel_op_dc_10, C::precomputed_sel_op_dc_11,
        C::precomputed_sel_op_dc_12, C::precomputed_sel_op_dc_13, C::precomputed_sel_op_dc_14,
        C::precomputed_sel_op_dc_15,
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
    for (const auto& [wire_opcode, wire_instruction_spec] : get_wire_instruction_spec()) {
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

/**
 * @brief Populate the execution-level instruction specification table.
 * @details One row per ExecutionOpCode (0..45). Each row holds gas costs (opcode L2, base DA,
 * dynamic L2, dynamic DA), register info (mem_op, rw, tag_check, expected_tag for each of 6
 * registers), operand-is-address flags, and subtrace dispatch info (subtrace_id,
 * subtrace_operation_id, dyn_gas_id). Used by the execution and gas subtraces.
 */
void PrecomputedTraceBuilder::process_exec_instruction_spec(TraceContainer& trace)
{
    constexpr std::array<Column, AVM_MAX_REGISTERS> MEM_OP_REG_COLUMNS = {
        Column::precomputed_sel_mem_op_reg_0_,
        Column::precomputed_sel_mem_op_reg_1_,
        Column::precomputed_sel_mem_op_reg_2_,
        Column::precomputed_sel_mem_op_reg_3_,
    };
    constexpr std::array<Column, AVM_MAX_REGISTERS> RW_COLUMNS = {
        Column::precomputed_rw_reg_0_,
        Column::precomputed_rw_reg_1_,
        Column::precomputed_rw_reg_2_,
        Column::precomputed_rw_reg_3_,
    };
    constexpr std::array<Column, AVM_MAX_REGISTERS> DO_TAG_CHECK_COLUMNS = {
        Column::precomputed_sel_tag_check_reg_0_,
        Column::precomputed_sel_tag_check_reg_1_,
        Column::precomputed_sel_tag_check_reg_2_,
        Column::precomputed_sel_tag_check_reg_3_,
    };
    constexpr std::array<Column, AVM_MAX_REGISTERS> EXPECTED_TAG_COLUMNS = {
        Column::precomputed_expected_tag_reg_0_,
        Column::precomputed_expected_tag_reg_1_,
        Column::precomputed_expected_tag_reg_2_,
        Column::precomputed_expected_tag_reg_3_,
    };

    constexpr std::array<Column, AVM_MAX_OPERANDS> SEL_OP_IS_ADDRESS_COLUMNS = {
        Column::precomputed_sel_op_is_address_0_,
        Column::precomputed_sel_op_is_address_1_,
        Column::precomputed_sel_op_is_address_2_,
        Column::precomputed_sel_op_is_address_3_,
        Column::precomputed_sel_op_is_address_4_
    };

    for (const auto& [exec_opcode, exec_instruction_spec] : get_exec_instruction_spec()) {
        // Basic information.
        trace.set(static_cast<uint32_t>(exec_opcode),
                  { {
                      { C::precomputed_sel_exec_spec, 1 },
                      { C::precomputed_exec_opcode_opcode_gas, exec_instruction_spec.gas_cost.opcode_gas },
                      { C::precomputed_exec_opcode_base_da_gas, exec_instruction_spec.gas_cost.base_da },
                      { C::precomputed_exec_opcode_dynamic_l2_gas, exec_instruction_spec.gas_cost.dyn_l2 },
                      { C::precomputed_exec_opcode_dynamic_da_gas, exec_instruction_spec.gas_cost.dyn_da },
                  } });

        // Register information.
        const auto& register_info = exec_instruction_spec.register_info;
        for (size_t i = 0; i < AVM_MAX_REGISTERS; i++) {
            trace.set(MEM_OP_REG_COLUMNS.at(i), static_cast<uint32_t>(exec_opcode), register_info.is_active(i) ? 1 : 0);
            trace.set(RW_COLUMNS.at(i), static_cast<uint32_t>(exec_opcode), register_info.is_write(i) ? 1 : 0);
            trace.set(DO_TAG_CHECK_COLUMNS.at(i),
                      static_cast<uint32_t>(exec_opcode),
                      register_info.need_tag_check(i) ? 1 : 0);
            trace.set(EXPECTED_TAG_COLUMNS.at(i),
                      static_cast<uint32_t>(exec_opcode),
                      static_cast<uint32_t>(register_info.expected_tag(i).value_or(static_cast<ValueTag>(0))));
        }

        // Whether an operand is an address
        for (size_t i = 0; i < AVM_MAX_OPERANDS; i++) {
            trace.set(SEL_OP_IS_ADDRESS_COLUMNS.at(i),
                      static_cast<uint32_t>(exec_opcode),
                      i < exec_instruction_spec.num_addresses ? 1 : 0);
        }

        // Gadget / Subtrace Selectors / Decomposable selectors
        auto dispatch_to_subtrace = get_subtrace_info_map().at(exec_opcode);
        trace.set(static_cast<uint32_t>(exec_opcode),
                  { { { C::precomputed_subtrace_id, get_subtrace_id(dispatch_to_subtrace.subtrace_selector) },
                      { C::precomputed_subtrace_operation_id, dispatch_to_subtrace.subtrace_operation_id },
                      { C::precomputed_dyn_gas_id, exec_instruction_spec.dyn_gas_id } } });
    }
}

/**
 * @brief Populate the TORADIXBE safe-limbs table (one row per radix 0..255).
 * @details For each radix r, stores the number of limbs needed to represent the BN254 scalar
 * field modulus p in base r, and the "safe limbs" count (num_limbs - 1). Radices 0 and 1 have
 * no valid decomposition and default to 0.
 */
void PrecomputedTraceBuilder::process_to_radix_safe_limbs(TraceContainer& trace)
{
    const auto& p_limbs_per_radix = get_p_limbs_per_radix();

    trace.reserve_column(C::precomputed_sel_to_radix_p_limb_counts, p_limbs_per_radix.size());
    trace.reserve_column(C::precomputed_to_radix_safe_limbs, p_limbs_per_radix.size());

    for (size_t i = 0; i < p_limbs_per_radix.size(); ++i) {
        size_t decomposition_len = p_limbs_per_radix[i].size();
        trace.set(C::precomputed_sel_to_radix_p_limb_counts, static_cast<uint32_t>(i), 1);
        // Use 0 as fallback when decomposition_len == 0 (i.e. p_limbs_per_radix[0] and p_limbs_per_radix[1])
        trace.set(C::precomputed_to_radix_safe_limbs,
                  static_cast<uint32_t>(i),
                  decomposition_len > 0 ? decomposition_len - 1 : 0);
        trace.set(C::precomputed_to_radix_num_limbs_for_p, static_cast<uint32_t>(i), decomposition_len);
    }
}

/**
 * @brief Populate the TORADIXBE p-decomposition table.
 * @details Stores the limb-by-limb decomposition of the BN254 field modulus p in every radix
 * r ∈ [2, 255]. Rows are laid out sequentially: all limbs for radix 2, then radix 3, etc.
 * Each row records (radix, limb_index, limb_value). Used to verify that TORADIXBE output
 * does not exceed p.
 */
void PrecomputedTraceBuilder::process_to_radix_p_decompositions(TraceContainer& trace)
{
    const auto& p_limbs_per_radix = get_p_limbs_per_radix();

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

/**
 * @brief Populate the memory tag out-of-range selector.
 * @details Flags rows where idx > MemoryTag::MAX (i.e., idx ∈ [7, 255]) with
 * sel_mem_tag_out_of_range = 1. Used to detect invalid memory tags via lookup.
 */
void PrecomputedTraceBuilder::process_memory_tag_range(TraceContainer& trace)
{
    constexpr uint32_t num_rows = 1 << 8; // 256

    for (uint32_t i = static_cast<uint32_t>(MemoryTag::MAX) + 1; i < num_rows; i++) {
        trace.set(C::precomputed_sel_mem_tag_out_of_range, i, 1);
    }
}

/**
 * @brief Populate the addressing-mode gas lookup table (65536 rows).
 * @details For every possible 16-bit addressing mode bitfield, precomputes the L2 gas cost
 * of address resolution (indirect dereferences + relative offsets).
 */
void PrecomputedTraceBuilder::process_addressing_gas(TraceContainer& trace)
{
    constexpr uint32_t num_rows = 1 << 16; // 65536

    static_assert(num_rows == (1U << 16),
                  "addressing-gas table must span 2^16 rows for sel_range_16 to be a sound outer selector for "
                  "the committed sel_addressing_gas granular selector (see precomputed.pil)");
    // sel_addressing_gas is committed and populated by the lookup builder (toggled on used rows), not here.
    trace.reserve_column(C::precomputed_addressing_gas, num_rows);

    for (uint32_t i = 0; i < num_rows; i++) {
        trace.set(C::precomputed_addressing_gas, i, compute_addressing_gas(static_cast<uint16_t>(i)));
    }
}

/**
 * @brief Populate the transaction phase specification table.
 * @details One row per TransactionPhase (0..11). Each row holds boolean flags
 * (is_public_call_request, is_teardown, is_revertible, etc.), public-input read offsets,
 * side-effect append selectors, and the next_phase_on_revert value. Used by the tx subtrace
 * via the #[READ_PHASE_SPEC] lookup.
 */
void PrecomputedTraceBuilder::process_phase_table(TraceContainer& trace)
{
    for (const auto& [phase_value, spec] : get_tx_phase_spec_map()) {

        const uint32_t row = static_cast<uint32_t>(phase_value);
        // Populate all columns that are part of the #[READ_PHASE_SPEC] lookup in tx.pil.
        std::vector<std::pair<Column, FF>> row_data = {
            { C::precomputed_sel_phase, 1 },
            { C::precomputed_is_public_call_request, spec.is_public_call_request ? 1 : 0 },
            { C::precomputed_is_teardown, spec.is_teardown ? 1 : 0 },
            { C::precomputed_is_collect_fee, spec.is_collect_fee ? 1 : 0 },
            { C::precomputed_is_tree_padding, spec.is_tree_padding ? 1 : 0 },
            { C::precomputed_is_cleanup, spec.is_cleanup ? 1 : 0 },
            { C::precomputed_is_revertible, spec.is_revertible ? 1 : 0 },
            { C::precomputed_read_pi_start_offset, spec.read_pi_start_offset },
            { C::precomputed_read_pi_length_offset, spec.read_pi_length_offset },
            { C::precomputed_sel_append_note_hash, spec.append_note_hash ? 1 : 0 },
            { C::precomputed_sel_append_nullifier, spec.append_nullifier ? 1 : 0 },
            { C::precomputed_sel_append_l2_l1_msg, spec.append_l2_l1_msg ? 1 : 0 },
            { C::precomputed_next_phase_on_revert, spec.next_phase_on_revert },
        };

        trace.set(row, row_data);
    }
}

/**
 * @brief Populate the 24 Keccak-f[1600] round constants and their selector.
 * Row 0 is intentionally left empty (round constants are 1-indexed in the Keccak subtrace).
 */
void PrecomputedTraceBuilder::process_keccak_round_constants(TraceContainer& trace)
{
    uint32_t row = 1;
    for (const auto& round_constant : simulation::keccak_round_constants) {
        trace.set(row,
                  { {
                      { C::precomputed_sel_keccak, 1 },
                      { C::precomputed_keccak_round_constant, round_constant },
                  } });
        row++;
    }
}

/**
 * @brief Populate the GETENVVAR lookup table.
 * @details One row per EnvironmentVariable enum value (0..11). Each row maps the variable to
 * its public-input column/row indices, type selectors (is_address, is_sender, etc.), and
 * output tag. Rows beyond the valid enum range are flagged with invalid_envvar_enum = 1.
 * See `opcodes/get_env_var.pil` for an ascii version of this table.
 */
void PrecomputedTraceBuilder::process_get_env_var_table(TraceContainer& trace)
{
    constexpr uint32_t NUM_ROWS = 1 << 8;

    constexpr uint8_t NUM_VALID_ENV_VARS = static_cast<uint8_t>(EnvironmentVariable::MAX) + 1;

    for (uint8_t enum_value = 0; enum_value < NUM_VALID_ENV_VARS; enum_value++) {
        const auto& envvar_spec = GetEnvVarSpec::get_table(enum_value);
        trace.set(static_cast<uint32_t>(enum_value),
                  { {
                      { C::precomputed_sel_envvar_pi_lookup_col0, envvar_spec.envvar_pi_lookup_col0 },
                      { C::precomputed_sel_envvar_pi_lookup_col1, envvar_spec.envvar_pi_lookup_col1 },
                      { C::precomputed_envvar_pi_row_idx, envvar_spec.envvar_pi_row_idx },
                      { C::precomputed_is_address, envvar_spec.is_address ? 1 : 0 },
                      { C::precomputed_is_sender, envvar_spec.is_sender ? 1 : 0 },
                      { C::precomputed_is_transactionfee, envvar_spec.is_transactionfee ? 1 : 0 },
                      { C::precomputed_is_isstaticcall, envvar_spec.is_isstaticcall ? 1 : 0 },
                      { C::precomputed_is_l2gasleft, envvar_spec.is_l2gasleft ? 1 : 0 },
                      { C::precomputed_is_dagasleft, envvar_spec.is_dagasleft ? 1 : 0 },
                      { C::precomputed_out_tag, envvar_spec.out_tag },
                  } });
    }

    // Flag invalid enum values (those beyond the valid range) as out-of-range.
    // Valid rows default to 0 (the trace container's default).
    for (uint32_t i = NUM_VALID_ENV_VARS; i < NUM_ROWS; i++) {
        trace.set(C::precomputed_invalid_envvar_enum, i, 1);
    }
}

/**
 * @brief Populate the GETCONTRACTINSTANCE lookup table.
 * @details One row per ContractInstanceMember enum value (DEPLOYER=0, CLASS_ID=1, INIT_HASH=2, IMMUTABLES_HASH=3).
 * Each row holds a validity flag and one-hot member selectors. See
 * `opcodes/get_contract_instance.pil` for an ascii version of this table.
 */
void PrecomputedTraceBuilder::process_get_contract_instance_table(TraceContainer& trace)
{
    // Set valid rows based on the precomputed table
    for (uint8_t enum_value = 0; enum_value <= static_cast<uint8_t>(ContractInstanceMember::MAX); enum_value++) {
        const auto& spec = GetContractInstanceSpec::get_table(enum_value);

        trace.set(static_cast<uint32_t>(enum_value),
                  { {
                      { C::precomputed_is_valid_member_enum, spec.is_valid_member_enum ? 1 : 0 },
                      { C::precomputed_is_deployer, spec.is_deployer ? 1 : 0 },
                      { C::precomputed_is_class_id, spec.is_class_id ? 1 : 0 },
                      { C::precomputed_is_init_hash, spec.is_init_hash ? 1 : 0 },
                      { C::precomputed_is_immutables_hash, spec.is_immutables_hash ? 1 : 0 },
                  } });
    }
}

} // namespace bb::avm2::tracegen
