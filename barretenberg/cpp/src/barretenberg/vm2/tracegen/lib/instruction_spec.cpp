#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"

#include <array>
#include <cstdint>
#include <unordered_map>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::tracegen {

const std::unordered_map<ExecutionOpCode, SubtraceInfo> SUBTRACE_INFO_MAP = {
    // Map each ExecutionOpcode to a SubtraceInfo
    { ExecutionOpCode::ADD,
      { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = AVM_EXEC_OP_ID_ALU_ADD } },
    { ExecutionOpCode::SUB,
      { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = AVM_EXEC_OP_ID_ALU_SUB } },
    { ExecutionOpCode::MUL,
      { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = AVM_EXEC_OP_ID_ALU_MUL } },
    { ExecutionOpCode::DIV,
      { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = AVM_EXEC_OP_ID_ALU_DIV } },
    { ExecutionOpCode::FDIV,
      { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = AVM_EXEC_OP_ID_ALU_FDIV } },
    { ExecutionOpCode::EQ, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = AVM_EXEC_OP_ID_ALU_EQ } },
    { ExecutionOpCode::LT, { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = AVM_EXEC_OP_ID_ALU_LT } },
    { ExecutionOpCode::LTE,
      { .subtrace_selector = SubtraceSel::ALU, .subtrace_operation_id = AVM_EXEC_OP_ID_ALU_LTE } },
    // Bitwise - note the bitwise subtrace operation id need to match the op id values in the bitwise precomputed table
    { ExecutionOpCode::AND,
      { .subtrace_selector = SubtraceSel::BITWISE, .subtrace_operation_id = AVM_BITWISE_AND_OP_ID } },
    { ExecutionOpCode::OR,
      { .subtrace_selector = SubtraceSel::BITWISE, .subtrace_operation_id = AVM_BITWISE_OR_OP_ID } },
    { ExecutionOpCode::XOR,
      { .subtrace_selector = SubtraceSel::BITWISE, .subtrace_operation_id = AVM_BITWISE_XOR_OP_ID } },
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
    { ExecutionOpCode::RETURNDATASIZE,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_RETURNDATASIZE } },
    { ExecutionOpCode::DEBUGLOG,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_DEBUGLOG } },
    // KeccakF1600
    { ExecutionOpCode::KECCAKF1600, { .subtrace_selector = SubtraceSel::KECCAKF1600, .subtrace_operation_id = 0 } },
    { ExecutionOpCode::SLOAD,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_SLOAD } },
    { ExecutionOpCode::SSTORE,
      { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = AVM_EXEC_OP_ID_SSTORE } },
};

FF get_subtrace_id(SubtraceSel subtrace_sel)
{
    switch (subtrace_sel) {
    case SubtraceSel::ALU:
        return AVM_SUBTRACE_ID_ALU;
    case SubtraceSel::BITWISE:
        return AVM_SUBTRACE_ID_BITWISE;
    case SubtraceSel::TORADIXBE:
        return AVM_SUBTRACE_ID_TO_RADIX;
    case SubtraceSel::POSEIDON2PERM:
        return AVM_SUBTRACE_ID_POSEIDON_PERM;
    case SubtraceSel::ECC:
        return AVM_SUBTRACE_ID_ECC;
    case SubtraceSel::DATACOPY:
        return AVM_SUBTRACE_ID_DATA_COPY;
    case SubtraceSel::EXECUTION:
        return AVM_SUBTRACE_ID_EXECUTION;
    case SubtraceSel::KECCAKF1600:
        return AVM_SUBTRACE_ID_KECCAKF1600;
    }

    // clangd will complain if we miss a case.
    // This is just to please gcc.
    __builtin_unreachable();
}

Column get_subtrace_selector(SubtraceSel subtrace_sel)
{
    using C = Column;

    switch (subtrace_sel) {
    case SubtraceSel::ALU:
        return C::execution_sel_alu;
    case SubtraceSel::BITWISE:
        return C::execution_sel_bitwise;
    case SubtraceSel::TORADIXBE:
        return C::execution_sel_to_radix;
    case SubtraceSel::POSEIDON2PERM:
        return C::execution_sel_poseidon2_perm;
    case SubtraceSel::ECC:
        return C::execution_sel_ecc_add;
    case SubtraceSel::DATACOPY:
        return C::execution_sel_data_copy;
    case SubtraceSel::EXECUTION:
        return C::execution_sel_execution;
    case SubtraceSel::KECCAKF1600:
        return C::execution_sel_keccakf1600;
    }

    // clangd will complain if we miss a case.
    // This is just to please gcc.
    __builtin_unreachable();
}

} // namespace bb::avm2::tracegen
