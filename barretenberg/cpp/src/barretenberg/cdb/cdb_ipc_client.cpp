#include "barretenberg/cdb/cdb_ipc_client.hpp"

namespace bb::cdb {

CdbIpcContractDB::CdbIpcContractDB(const std::string& socket_path)
    : client_(std::make_unique<CdbIpcClient>(socket_path))
{}

CdbIpcContractDB::~CdbIpcContractDB() = default;

std::optional<avm2::ContractInstance> CdbIpcContractDB::get_contract_instance(const avm2::AztecAddress& address) const
{
    auto resp = client_->get_contract_instance(CdbGetContractInstance{ .address = address, .forkId = fork_id_ });
    return resp.instance;
}

std::optional<avm2::ContractClass> CdbIpcContractDB::get_contract_class(const avm2::ContractClassId& class_id) const
{
    auto resp = client_->get_contract_class(CdbGetContractClass{ .classId = class_id, .forkId = fork_id_ });
    return resp.contractClass;
}

std::optional<avm2::FF> CdbIpcContractDB::get_bytecode_commitment(const avm2::ContractClassId& class_id) const
{
    auto resp = client_->get_bytecode_commitment(CdbGetBytecodeCommitment{ .classId = class_id, .forkId = fork_id_ });
    return resp.commitment;
}

std::optional<std::string> CdbIpcContractDB::get_debug_function_name(const avm2::AztecAddress& address,
                                                                     const avm2::FunctionSelector& selector) const
{
    auto resp = client_->get_debug_function_name(
        CdbGetDebugFunctionName{ .address = address, .selector = selector, .forkId = fork_id_ });
    return resp.name;
}

void CdbIpcContractDB::add_contracts(const avm2::ContractDeploymentData& contract_deployment_data)
{
    client_->add_contracts(CdbAddContracts{ .contractDeploymentData = contract_deployment_data, .forkId = fork_id_ });
}

void CdbIpcContractDB::create_checkpoint()
{
    client_->create_checkpoint(CdbCreateCheckpoint{ .forkId = fork_id_ });
}

void CdbIpcContractDB::commit_checkpoint()
{
    client_->commit_checkpoint(CdbCommitCheckpoint{ .forkId = fork_id_ });
}

void CdbIpcContractDB::revert_checkpoint()
{
    client_->revert_checkpoint(CdbRevertCheckpoint{ .forkId = fork_id_ });
}

} // namespace bb::cdb
