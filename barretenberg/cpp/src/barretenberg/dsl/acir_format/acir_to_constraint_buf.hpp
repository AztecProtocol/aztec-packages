#pragma once
#include "acir_format.hpp"
#include "serde/index.hpp"

namespace acir_format {

/**
 * @brief Construct a poly_tuple for a standard width-3 arithmetic gate from its acir representation
 *
 * @param arg acir representation of an 3-wire arithmetic operation
 * @return poly_triple
 * @note In principle Program::Expression can accommodate arbitrarily many quadratic and linear terms but in practice
 * the ones processed here have a max of 1 and 3 respectively, in accordance with the standard width-3 arithmetic gate.
 */
poly_triple serialize_arithmetic_gate(Program::Expression const& arg);

mul_quad_<bb::fr> serialize_mul_quad_gate(Program::Expression const& arg);

void handle_arithmetic(Program::Opcode::AssertZero const& arg, AcirFormat& af);

void handle_blackbox_func_call(Program::Opcode::BlackBoxFuncCall const& arg, AcirFormat& af);

BlockConstraint handle_memory_init(Program::Opcode::MemoryInit const& mem_init);

bool is_rom(Program::MemOp const& mem_op);

void handle_memory_op(Program::Opcode::MemoryOp const& mem_op, BlockConstraint& block);

AcirFormat circuit_serde_to_acir_format(Program::Circuit const& circuit);

AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t> const& buf);

/**
 * @brief Converts from the ACIR-native `WitnessMap` format to Barretenberg's internal `WitnessVector` format.
 *
 * @param witness_map ACIR-native `WitnessMap` deserialized from a buffer
 * @return A `WitnessVector` equivalent to the passed `WitnessMap`.
 * @note This transformation results in all unassigned witnesses within the `WitnessMap` being assigned the value 0.
 *       Converting the `WitnessVector` back to a `WitnessMap` is unlikely to return the exact same `WitnessMap`.
 */
WitnessVector witness_map_to_witness_vector(WitnessStack::WitnessMap const& witness_map);

/**
 * @brief Converts from the ACIR-native `WitnessMap` format to Barretenberg's internal `WitnessVector` format.
 *
 * @param buf Serialized representation of a `WitnessMap`.
 * @return A `WitnessVector` equivalent to the passed `WitnessMap`.
 * @note This transformation results in all unassigned witnesses within the `WitnessMap` being assigned the value 0.
 *       Converting the `WitnessVector` back to a `WitnessMap` is unlikely to return the exact same `WitnessMap`.
 */
WitnessVector witness_buf_to_witness_data(std::vector<uint8_t> const& buf);

std::vector<AcirFormat> program_buf_to_acir_format(std::vector<uint8_t> const& buf);

WitnessVectorStack witness_buf_to_witness_stack(std::vector<uint8_t> const& buf);

AcirProgramStack get_acir_program_stack(std::string const& bytecode_path, std::string const& witness_path);

} // namespace acir_format