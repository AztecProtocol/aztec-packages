#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"

#include <array>
#include <cstdint>
#include <unordered_map>
#include <vector>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::tracegen {

namespace {

const uint16_t read_encoding = 0b01;
const uint16_t write_encoding = 0b11;

} // namespace

RegisterMemInfo& RegisterMemInfo::has_inputs(uint16_t num_inputs)
{
    for (uint16_t i = 0; i < num_inputs; ++i) {
        encoded_register_info |= (read_encoding << (i * 2));
    }
    write_index = num_inputs;
    return *this;
}

RegisterMemInfo& RegisterMemInfo::has_outputs(uint16_t num_outputs)
{
    for (uint16_t i = 0; i < num_outputs; ++i) {
        encoded_register_info |= (write_encoding << (write_index * 2));
        write_index++;
    }
    return *this;
}

bool RegisterMemInfo::is_active(size_t index) const
{
    return ((encoded_register_info >> (2 * static_cast<uint8_t>(index))) & 1) == 1;
}

bool RegisterMemInfo::is_write(size_t index) const
{
    return ((encoded_register_info >> (2 * static_cast<uint8_t>(index) + 1)) & 1) == 1;
}

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
    { ExecutionOpCode::SET, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 1 } },
    { ExecutionOpCode::MOV, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 2 } },
    { ExecutionOpCode::JUMP, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 3 } },
    { ExecutionOpCode::JUMPI, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 4 } },
    { ExecutionOpCode::CALL, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 5 } },
    { ExecutionOpCode::STATICCALL, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 6 } },
    { ExecutionOpCode::INTERNALCALL, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 7 } },
    { ExecutionOpCode::INTERNALRETURN, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 8 } },
    { ExecutionOpCode::RETURN, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 9 } },
    { ExecutionOpCode::REVERT, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 10 } },
    { ExecutionOpCode::SUCCESSCOPY, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 11 } },
    { ExecutionOpCode::RETURNDATASIZE, { .subtrace_selector = SubtraceSel::EXECUTION, .subtrace_operation_id = 12 } },
    { ExecutionOpCode::KECCAKF1600, { .subtrace_selector = SubtraceSel::KECCAKF1600, .subtrace_operation_id = 0 } },
};

// Maps Execution opcodes to their register + memory accesses
// TODO: This will need to revisited, we will only be sure of the access patterns when we do the opcodes
const std::unordered_map<ExecutionOpCode, RegisterMemInfo> REGISTER_INFO_MAP = { {
    { ExecutionOpCode::ADD, RegisterMemInfo().has_inputs(2).has_outputs(1) },
    { ExecutionOpCode::SET, RegisterMemInfo().has_inputs(0).has_outputs(1) },
    { ExecutionOpCode::MOV, RegisterMemInfo().has_inputs(1).has_outputs(1) },
    { ExecutionOpCode::CALL, RegisterMemInfo().has_inputs(4) },
    { ExecutionOpCode::RETURN, RegisterMemInfo().has_inputs(1) },
    { ExecutionOpCode::REVERT, RegisterMemInfo().has_inputs(1) },
    { ExecutionOpCode::JUMP, RegisterMemInfo() },
    { ExecutionOpCode::JUMPI, RegisterMemInfo().has_inputs(1) },
    { ExecutionOpCode::CALLDATACOPY, RegisterMemInfo().has_inputs(2) },
    { ExecutionOpCode::RETURNDATACOPY, RegisterMemInfo().has_inputs(2) },
    { ExecutionOpCode::INTERNALCALL, RegisterMemInfo() },
    { ExecutionOpCode::INTERNALRETURN, RegisterMemInfo() },
    { ExecutionOpCode::KECCAKF1600, RegisterMemInfo() },
} };

} // namespace bb::avm2::tracegen
