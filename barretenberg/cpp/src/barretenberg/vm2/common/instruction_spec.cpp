#include "barretenberg/vm2/common/instruction_spec.hpp"

#include "barretenberg/vm/aztec_constants.hpp" // Move over.
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2 {

const std::unordered_map<ExecutionOpCode, InstructionSpec> INSTRUCTION_SPEC = {
    { ExecutionOpCode::ADD,
      { .num_addresses = 3, .gas_cost = { .base_l2 = AVM_ADD_BASE_L2_GAS, .base_da = 0, .dyn_l2 = 0, .dyn_da = 0 } } },
    { ExecutionOpCode::SET,
      { .num_addresses = 1, .gas_cost = { .base_l2 = AVM_SET_BASE_L2_GAS, .base_da = 0, .dyn_l2 = 0, .dyn_da = 0 } } },
    { ExecutionOpCode::MOV,
      { .num_addresses = 2, .gas_cost = { .base_l2 = AVM_MOV_BASE_L2_GAS, .base_da = 0, .dyn_l2 = 0, .dyn_da = 0 } } },
    { ExecutionOpCode::CALL,
      { .num_addresses = 5,
        .gas_cost = { .base_l2 = AVM_CALL_BASE_L2_GAS, .base_da = 0, .dyn_l2 = AVM_CALL_DYN_L2_GAS, .dyn_da = 0 } } },
    { ExecutionOpCode::RETURN,
      { .num_addresses = 2,
        .gas_cost = { .base_l2 = AVM_RETURN_BASE_L2_GAS,
                      .base_da = 0,
                      .dyn_l2 = AVM_RETURN_DYN_L2_GAS,
                      .dyn_da = 0 } } },
    { ExecutionOpCode::JUMP,
      { .num_addresses = 0, .gas_cost = { .base_l2 = AVM_JUMP_BASE_L2_GAS, .base_da = 0, .dyn_l2 = 0, .dyn_da = 0 } } },
    { ExecutionOpCode::JUMPI,
      { .num_addresses = 1,
        .gas_cost = { .base_l2 = AVM_JUMPI_BASE_L2_GAS, .base_da = 0, .dyn_l2 = 0, .dyn_da = 0 } } },
};

const std::unordered_map<WireOpCode, ExecutionOpCode> OPCODE_MAP = {
    { WireOpCode::ADD_8, ExecutionOpCode::ADD },    { WireOpCode::ADD_16, ExecutionOpCode::ADD },
    { WireOpCode::CALL, ExecutionOpCode::CALL },    { WireOpCode::RETURN, ExecutionOpCode::RETURN },
    { WireOpCode::JUMP_32, ExecutionOpCode::JUMP }, { WireOpCode::JUMPI_32, ExecutionOpCode::JUMPI },
    { WireOpCode::SET_8, ExecutionOpCode::SET },    { WireOpCode::SET_16, ExecutionOpCode::SET },
    { WireOpCode::SET_32, ExecutionOpCode::SET },   { WireOpCode::SET_64, ExecutionOpCode::SET },
    { WireOpCode::SET_128, ExecutionOpCode::SET },  { WireOpCode::SET_FF, ExecutionOpCode::SET },
    { WireOpCode::MOV_8, ExecutionOpCode::MOV },    { WireOpCode::MOV_16, ExecutionOpCode::MOV },
};

} // namespace bb::avm2