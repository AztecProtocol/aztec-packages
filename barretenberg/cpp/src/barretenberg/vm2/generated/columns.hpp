#pragma once

#include <array>
#include <optional>

namespace bb::avm2 {

// The entities that will be used in the flavor.
// clang-format off
#define AVM2_PRECOMPUTED_ENTITIES precomputed_bitwise_input_a, precomputed_bitwise_input_b, precomputed_bitwise_op_id, precomputed_bitwise_output, precomputed_clk, precomputed_first_row, precomputed_sel_bitwise
#define AVM2_WIRE_ENTITIES execution_input, alu_dst_addr, alu_ia, alu_ia_addr, alu_ib, alu_ib_addr, alu_ic, alu_op, alu_sel_op_add, execution_addressing_error_idx, execution_addressing_error_kind, execution_base_address_tag, execution_base_address_val, execution_bytecode_id, execution_clk, execution_ex_opcode, execution_indirect, execution_last, execution_op1, execution_op1_after_relative, execution_op2, execution_op2_after_relative, execution_op3, execution_op3_after_relative, execution_op4, execution_op4_after_relative, execution_pc, execution_rop1, execution_rop2, execution_rop3, execution_rop4, execution_sel, execution_sel_addressing_error, execution_sel_op1_is_address, execution_sel_op2_is_address, execution_sel_op3_is_address, execution_sel_op4_is_address, lookup_dummy_precomputed_counts, lookup_dummy_dynamic_counts
#define AVM2_DERIVED_WITNESS_ENTITIES perm_dummy_dynamic_inv, lookup_dummy_precomputed_inv, lookup_dummy_dynamic_inv
#define AVM2_SHIFTED_ENTITIES execution_sel_shift
#define AVM2_TO_BE_SHIFTED(e) e.execution_sel
#define AVM2_ALL_ENTITIES AVM2_PRECOMPUTED_ENTITIES, AVM2_WIRE_ENTITIES, AVM2_DERIVED_WITNESS_ENTITIES, AVM2_SHIFTED_ENTITIES
#define AVM2_UNSHIFTED_ENTITIES AVM2_PRECOMPUTED_ENTITIES, AVM2_WIRE_ENTITIES, AVM2_DERIVED_WITNESS_ENTITIES

#define AVM2_TO_BE_SHIFTED_COLUMNS Column::execution_sel
#define AVM2_SHIFTED_COLUMNS ColumnAndShifts::execution_sel_shift
// clang-format on

// All columns minus shifts.
enum class Column { AVM2_UNSHIFTED_ENTITIES };

// C++ doesn't allow enum extension, so we'll have to cast.
enum class ColumnAndShifts {
    AVM2_ALL_ENTITIES,
    // Sentinel.
    NUM_COLUMNS,
};

constexpr auto TO_BE_SHIFTED_COLUMNS_ARRAY = []() { return std::array{ AVM2_TO_BE_SHIFTED_COLUMNS }; }();
constexpr auto SHIFTED_COLUMNS_ARRAY = []() { return std::array{ AVM2_SHIFTED_COLUMNS }; }();
static_assert(TO_BE_SHIFTED_COLUMNS_ARRAY.size() == SHIFTED_COLUMNS_ARRAY.size());

} // namespace bb::avm2