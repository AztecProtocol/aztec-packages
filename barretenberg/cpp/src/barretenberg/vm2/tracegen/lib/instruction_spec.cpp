#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"

#include <array>
#include <cstdint>
#include <unordered_map>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::tracegen {

const std::unordered_map<ExecutionOpCode, SubtraceInfo> SUBTRACE_INFO_MAP = {
    // Map each ExecutionOpcode to a SubtraceInfo
    { ExecutionOpCode::ADD, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = 0 } },
    { ExecutionOpCode::SUB, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = 1 } },
    { ExecutionOpCode::MUL, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = 2 } },
    { ExecutionOpCode::DIV, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = 3 } },
    { ExecutionOpCode::FDIV, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = 4 } },
    { ExecutionOpCode::EQ, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = 5 } },
    { ExecutionOpCode::LT, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = 6 } },
    { ExecutionOpCode::LTE, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = 7 } },
    // Bitwise
    { ExecutionOpCode::AND, { .subtrace_selector = SubtraceSel::BITWISE, .subtrace_operation_id = 0 } },
    { ExecutionOpCode::OR, { .subtrace_selector = SubtraceSel::BITWISE, .subtrace_operation_id = 1 } },
    { ExecutionOpCode::XOR, { .subtrace_selector = SubtraceSel::BITWISE, .subtrace_operation_id = 2 } },
    // Toradixbe
    { ExecutionOpCode::TORADIXBE, { .subtrace_selector = SubtraceSel::TORADIXBE, .subtrace_operation_id = 0 } },
    // ECC
    { ExecutionOpCode::ECADD, { .subtrace_selector = SubtraceSel::ECC, .subtrace_operation_id = 0 } },
    // Data Copy
    { ExecutionOpCode::CALLDATACOPY, { .subtrace_selector = SubtraceSel::DATACOPY, .subtrace_operation_id = 0 } },
    { ExecutionOpCode::RETURNDATACOPY, { .subtrace_selector = SubtraceSel::DATACOPY, .subtrace_operation_id = 1 } },
    // Poseidon2Perm
    { ExecutionOpCode::POSEIDON2PERM, { .subtrace_selector = SubtraceSel::POSEIDON2PERM, .subtrace_operation_id = 0 } },
    // Execution
    { ExecutionOpCode::GETENVVAR,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_GETENVVAR } },
    { ExecutionOpCode::SET,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_SET } },
    { ExecutionOpCode::MOV,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_MOV } },
    { ExecutionOpCode::JUMP,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_JUMP } },
    { ExecutionOpCode::JUMPI,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_JUMPI } },
    { ExecutionOpCode::CALL,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_CALL } },
    { ExecutionOpCode::STATICCALL,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_STATICCALL } },
    { ExecutionOpCode::INTERNALCALL,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_INTERNALCALL } },
    { ExecutionOpCode::INTERNALRETURN,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_INTERNALRETURN } },
    { ExecutionOpCode::RETURN,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_RETURN } },
    { ExecutionOpCode::REVERT,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_REVERT } },
    { ExecutionOpCode::SUCCESSCOPY,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_SUCCESSCOPY } },
    // KeccakF1600
    { ExecutionOpCode::KECCAKF1600, { .subtrace_selector = SubtraceSel::KECCAKF1600, .subtrace_operation_id = 0 } },
};

} // namespace bb::avm2::tracegen
