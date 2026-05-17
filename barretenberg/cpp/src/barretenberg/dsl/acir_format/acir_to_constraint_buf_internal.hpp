#pragma once

#include "acir_to_constraint_buf.hpp"
#include "serde/index.hpp"

#include <cstddef>
#include <map>

namespace acir_format {

WitnessOrConstant<bb::fr> parse_input(const Acir::FunctionInput& input);

uint32_t get_witness_from_function_input(const Acir::FunctionInput& input);

void update_max_witness_index_from_expression(Acir::Expression const& expr, AcirFormat& af);

void update_max_witness_index_from_opcode(Acir::Opcode const& opcode, AcirFormat& af);

AcirFormat circuit_serde_to_acir_format(Acir::Circuit const& circuit);

WitnessVector witness_map_to_witness_vector(Witnesses::WitnessMap const& witness_map);

std::map<uint32_t, bb::fr> process_linear_terms(Acir::Expression const& expr);

bool is_single_arithmetic_gate(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms);

std::vector<mul_quad_<fr>> split_into_mul_quad_gates(Acir::Expression const& arg,
                                                     std::map<uint32_t, bb::fr>& linear_terms);

void assert_zero_to_quad_constraints(Acir::Opcode::AssertZero const& arg, AcirFormat& af, size_t opcode_index);

BlockConstraint memory_init_to_block_constraint(Acir::Opcode::MemoryInit const& mem_init);

void add_memory_op_to_block_constraint(Acir::Opcode::MemoryOp const& mem_op, BlockConstraint& block);

void add_blackbox_func_call_to_acir_format(Acir::Opcode::BlackBoxFuncCall const& arg,
                                           AcirFormat& af,
                                           size_t opcode_index);

} // namespace acir_format
