#pragma once

#include <vector>

#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::testing {

std::vector<FF> random_fields(size_t n);

// WARNING: Cryptographically insecure randomness routines for testing purposes only.
std::vector<uint8_t> random_bytes(size_t n);

std::vector<ScopedL2ToL1Message> random_l2_to_l1_messages(size_t n);
std::vector<EnqueuedCallHint> random_enqueued_calls(size_t n);

simulation::Operand random_operand(simulation::OperandType operand_type);

// This generates a random instruction for a given wire opcode. The output will conform to
// the wire format specified in WireOpCode_WIRE_FORMAT. The format specifies a vector of
// OperandType and we generate a random value for each operand conforming to the OperandType.
// For OperandTypes:
// INDIRECT8, UINT8: single random byte
// INDIRECT16, UINT16: 2 random bytes
// UINTXX: random bytes conforming to the size in bytes of the operand
// FF: random field
// TAG: random tag within the enum MemoryTag range
// We do not provide any guarantee beyond the above static format restrictions.
// For instance, next pc destination in JUMP might overflow the bytecode, etc, ....
// Also, immediate operands which correspond to an enum value might fall outside
// the prescribed range (for instance: GETENVVAR_16 and GETCONTRACTINSTANCE).
// Note that indirect value might have toggled bits which are not relevant to the
// wire opcode. It is in principle not an issue as these bits are ignored during
// address resolution.
simulation::Instruction random_instruction(WireOpCode w_opcode);
tracegen::TestTraceContainer empty_trace();
ContractInstance random_contract_instance();

// A routine which provides a minimal trace and public inputs which should provide
// a good coverage over the different sub-traces but yet as short as necessary.
// TODO: Enhance trace with values in other sub-traces. At the moment, only
// alu contains non-zero values.
std::pair<tracegen::TraceContainer, PublicInputs> get_minimal_trace_with_pi();

/**
 * @brief Check if slow tests should be skipped
 * @return true if AVM_SLOW_TESTS environment variable is not set, false otherwise
 */
bool skip_slow_tests();

} // namespace bb::avm2::testing
