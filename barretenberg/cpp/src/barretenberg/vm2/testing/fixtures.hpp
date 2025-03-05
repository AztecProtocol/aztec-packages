#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::testing {
using simulation::Instruction;
using simulation::Operand;
using simulation::OperandType;

std::vector<FF> random_fields(size_t n);

// WARNING: Cryptographically insecure randomness routines for testing purposes only.
std::vector<uint8_t> random_bytes(size_t n);
Operand random_operand(OperandType operand_type);
Instruction random_instruction(WireOpCode w_opcode);
tracegen::TestTraceContainer empty_trace();

} // namespace bb::avm2::testing
