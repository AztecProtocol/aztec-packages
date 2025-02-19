#include "barretenberg/vm/avm/trace/fixed_gas.hpp"
#include "barretenberg/vm/avm/trace/opcode.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include <unordered_map>

namespace bb::avm_trace {

namespace {

constexpr auto make_cost(uint16_t l2_base, uint16_t da_base, uint16_t l2_dyn, uint16_t da_dyn)
{
    return FixedGasTable::GasRow{
        .base_l2_gas_fixed_table = l2_base,
        .base_da_gas_fixed_table = da_base,
        .dyn_l2_gas_fixed_table = l2_dyn,
        .dyn_da_gas_fixed_table = da_dyn,
    };
}

const std::unordered_map<OpCode, FixedGasTable::GasRow> GAS_COST_TABLE = {
    { OpCode::ADD_8, make_cost(AVM_ADD_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::ADD_16, make_cost(AVM_ADD_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SUB_8, make_cost(AVM_SUB_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SUB_16, make_cost(AVM_SUB_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::MUL_8, make_cost(AVM_MUL_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::MUL_16, make_cost(AVM_MUL_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::DIV_8, make_cost(AVM_DIV_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::DIV_16, make_cost(AVM_DIV_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::FDIV_8, make_cost(AVM_FDIV_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::FDIV_16, make_cost(AVM_FDIV_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::EQ_8, make_cost(AVM_EQ_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::EQ_16, make_cost(AVM_EQ_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::LT_8, make_cost(AVM_LT_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::LT_16, make_cost(AVM_LT_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::LTE_8, make_cost(AVM_LTE_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::LTE_16, make_cost(AVM_LTE_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::AND_8, make_cost(AVM_AND_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::AND_16, make_cost(AVM_AND_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::OR_8, make_cost(AVM_OR_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::OR_16, make_cost(AVM_OR_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::XOR_8, make_cost(AVM_XOR_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::XOR_16, make_cost(AVM_XOR_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::NOT_8, make_cost(AVM_NOT_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::NOT_16, make_cost(AVM_NOT_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SHL_8, make_cost(AVM_SHL_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SHL_16, make_cost(AVM_SHL_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SHR_8, make_cost(AVM_SHR_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SHR_16, make_cost(AVM_SHR_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::CAST_8, make_cost(AVM_CAST_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::CAST_16, make_cost(AVM_CAST_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::GETENVVAR_16, make_cost(AVM_GETENVVAR_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::CALLDATACOPY, make_cost(AVM_CALLDATACOPY_BASE_L2_GAS, 0, AVM_CALLDATACOPY_DYN_L2_GAS, 0) },
    { OpCode::RETURNDATASIZE, make_cost(AVM_RETURNDATASIZE_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::RETURNDATACOPY, make_cost(AVM_RETURNDATACOPY_BASE_L2_GAS, 0, AVM_RETURNDATACOPY_DYN_L2_GAS, 0) },
    { OpCode::JUMP_32, make_cost(AVM_JUMP_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::JUMPI_32, make_cost(AVM_JUMPI_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::INTERNALCALL, make_cost(AVM_INTERNALCALL_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::INTERNALRETURN, make_cost(AVM_INTERNALRETURN_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SET_8, make_cost(AVM_SET_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SET_16, make_cost(AVM_SET_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SET_32, make_cost(AVM_SET_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SET_64, make_cost(AVM_SET_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SET_128, make_cost(AVM_SET_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SET_FF, make_cost(AVM_SET_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::MOV_8, make_cost(AVM_MOV_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::MOV_16, make_cost(AVM_MOV_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SLOAD, make_cost(AVM_SLOAD_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SSTORE, make_cost(AVM_SSTORE_BASE_L2_GAS, AVM_SSTORE_BASE_DA_GAS, 0, 0) },
    { OpCode::NOTEHASHEXISTS, make_cost(AVM_NOTEHASHEXISTS_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::EMITNOTEHASH, make_cost(AVM_EMITNOTEHASH_BASE_L2_GAS, AVM_EMITNOTEHASH_BASE_DA_GAS, 0, 0) },
    { OpCode::NULLIFIEREXISTS, make_cost(AVM_NULLIFIEREXISTS_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::EMITNULLIFIER, make_cost(AVM_EMITNULLIFIER_BASE_L2_GAS, AVM_EMITNULLIFIER_BASE_DA_GAS, 0, 0) },
    { OpCode::L1TOL2MSGEXISTS, make_cost(AVM_L1TOL2MSGEXISTS_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::GETCONTRACTINSTANCE, make_cost(AVM_GETCONTRACTINSTANCE_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::EMITUNENCRYPTEDLOG,
      make_cost(AVM_EMITUNENCRYPTEDLOG_BASE_L2_GAS,
                0,
                AVM_EMITUNENCRYPTEDLOG_DYN_L2_GAS,
                AVM_EMITUNENCRYPTEDLOG_DYN_DA_GAS) },
    { OpCode::SENDL2TOL1MSG, make_cost(AVM_SENDL2TOL1MSG_BASE_L2_GAS, AVM_SENDL2TOL1MSG_BASE_DA_GAS, 0, 0) },
    { OpCode::CALL, make_cost(AVM_CALL_BASE_L2_GAS, 0, AVM_CALL_DYN_L2_GAS, 0) },
    { OpCode::STATICCALL, make_cost(AVM_STATICCALL_BASE_L2_GAS, 0, AVM_STATICCALL_DYN_L2_GAS, 0) },
    { OpCode::RETURN, make_cost(AVM_RETURN_BASE_L2_GAS, 0, AVM_RETURN_DYN_L2_GAS, 0) },
    { OpCode::REVERT_8, make_cost(AVM_REVERT_BASE_L2_GAS, 0, AVM_REVERT_DYN_L2_GAS, 0) },
    { OpCode::REVERT_16, make_cost(AVM_REVERT_BASE_L2_GAS, 0, AVM_REVERT_DYN_L2_GAS, 0) },
    { OpCode::DEBUGLOG, make_cost(AVM_DEBUGLOG_BASE_L2_GAS, 0, AVM_DEBUGLOG_DYN_L2_GAS, 0) },
    { OpCode::POSEIDON2PERM, make_cost(AVM_POSEIDON2_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::SHA256COMPRESSION, make_cost(AVM_SHA256COMPRESSION_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::KECCAKF1600, make_cost(AVM_KECCAKF1600_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::ECADD, make_cost(AVM_ECADD_BASE_L2_GAS, 0, 0, 0) },
    { OpCode::MSM, make_cost(AVM_MSM_BASE_L2_GAS, 0, AVM_MSM_DYN_L2_GAS, 0) },
    { OpCode::TORADIXBE, make_cost(AVM_TORADIXBE_BASE_L2_GAS, 0, AVM_TORADIXBE_DYN_L2_GAS, 0) },
};

} // namespace

size_t FixedGasTable::size() const
{
    return GAS_COST_TABLE.size();
}

const FixedGasTable::GasRow& FixedGasTable::at(OpCode o) const
{
    return GAS_COST_TABLE.at(o);
}

// Singleton.
const FixedGasTable& FixedGasTable::get()
{
    static FixedGasTable table;
    return table;
}

} // namespace bb::avm_trace
