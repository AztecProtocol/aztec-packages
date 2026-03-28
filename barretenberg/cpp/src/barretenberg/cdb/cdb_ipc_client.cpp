#include "barretenberg/cdb/cdb_ipc_client.hpp"

#include <cstring>

namespace bb::cdb {

namespace {

// ---------------------------------------------------------------------------
// Wire ↔ domain conversion helpers (memcpy-based, same 32-byte layout)
// ---------------------------------------------------------------------------

inline Fr fr_to_wire(const bb::fr& d)
{
    Fr r;
    std::memcpy(r.data(), &d, 32);
    return r;
}

inline bb::fr fr_from_wire(const Fr& w)
{
    bb::fr r;
    std::memcpy(&r, w.data(), 32);
    return r;
}

inline avm2::PublicKeys public_keys_from_wire(const wire::PublicKeys& w)
{
    return avm2::PublicKeys{
        .nullifier_key = { fr_from_wire(w.masterNullifierPublicKey.x), fr_from_wire(w.masterNullifierPublicKey.y) },
        .incoming_viewing_key = { fr_from_wire(w.masterIncomingViewingPublicKey.x),
                                  fr_from_wire(w.masterIncomingViewingPublicKey.y) },
        .outgoing_viewing_key = { fr_from_wire(w.masterOutgoingViewingPublicKey.x),
                                  fr_from_wire(w.masterOutgoingViewingPublicKey.y) },
        .tagging_key = { fr_from_wire(w.masterTaggingPublicKey.x), fr_from_wire(w.masterTaggingPublicKey.y) },
    };
}

inline avm2::ContractInstance contract_instance_from_wire(const wire::ContractInstance& w)
{
    return avm2::ContractInstance{
        .salt = fr_from_wire(w.salt),
        .deployer = fr_from_wire(w.deployer),
        .current_contract_class_id = fr_from_wire(w.currentContractClassId),
        .original_contract_class_id = fr_from_wire(w.originalContractClassId),
        .initialization_hash = fr_from_wire(w.initializationHash),
        .public_keys = public_keys_from_wire(w.publicKeys),
    };
}

inline avm2::ContractClass contract_class_from_wire(const wire::ContractClass& w)
{
    return avm2::ContractClass{
        .id = fr_from_wire(w.id),
        .artifact_hash = fr_from_wire(w.artifactHash),
        .private_functions_root = fr_from_wire(w.privateFunctionsRoot),
        .packed_bytecode = w.packedBytecode,
    };
}

inline wire::ContractClassLogFields contract_class_log_fields_to_wire(const avm2::ContractClassLogFields& d)
{
    wire::ContractClassLogFields r;
    r.fields.reserve(d.fields.size());
    for (const auto& f : d.fields) {
        r.fields.push_back(fr_to_wire(f));
    }
    return r;
}

inline wire::ContractClassLog contract_class_log_to_wire(const avm2::ContractClassLog& d)
{
    return wire::ContractClassLog{
        .contractAddress = fr_to_wire(d.contract_address),
        .fields = contract_class_log_fields_to_wire(d.fields),
        .emittedLength = d.emitted_length,
    };
}

inline wire::PrivateLog private_log_to_wire(const avm2::PrivateLog& d)
{
    wire::PrivateLog r;
    r.fields.reserve(d.fields.size());
    for (const auto& f : d.fields) {
        r.fields.push_back(fr_to_wire(f));
    }
    r.emittedLength = d.emitted_length;
    return r;
}

inline wire::ContractDeploymentData contract_deployment_data_to_wire(const avm2::ContractDeploymentData& d)
{
    wire::ContractDeploymentData r;
    r.contractClassLogs.reserve(d.contract_class_logs.size());
    for (const auto& log : d.contract_class_logs) {
        r.contractClassLogs.push_back(contract_class_log_to_wire(log));
    }
    r.privateLogs.reserve(d.private_logs.size());
    for (const auto& log : d.private_logs) {
        r.privateLogs.push_back(private_log_to_wire(log));
    }
    return r;
}

} // anonymous namespace

CdbIpcContractDB::CdbIpcContractDB(const std::string& socket_path)
    : client_(std::make_unique<CdbIpcClient>(socket_path))
{}

CdbIpcContractDB::~CdbIpcContractDB() = default;

std::optional<avm2::ContractInstance> CdbIpcContractDB::get_contract_instance(const avm2::AztecAddress& address) const
{
    auto resp = client_->get_contract_instance(
        wire::CdbGetContractInstance{ .address = fr_to_wire(address), .forkId = fork_id_ });
    if (!resp.instance.has_value()) {
        return std::nullopt;
    }
    return contract_instance_from_wire(*resp.instance);
}

std::optional<avm2::ContractClass> CdbIpcContractDB::get_contract_class(const avm2::ContractClassId& class_id) const
{
    auto resp =
        client_->get_contract_class(wire::CdbGetContractClass{ .classId = fr_to_wire(class_id), .forkId = fork_id_ });
    if (!resp.contractClass.has_value()) {
        return std::nullopt;
    }
    return contract_class_from_wire(*resp.contractClass);
}

std::optional<avm2::FF> CdbIpcContractDB::get_bytecode_commitment(const avm2::ContractClassId& class_id) const
{
    auto resp = client_->get_bytecode_commitment(
        wire::CdbGetBytecodeCommitment{ .classId = fr_to_wire(class_id), .forkId = fork_id_ });
    if (!resp.commitment.has_value()) {
        return std::nullopt;
    }
    return fr_from_wire(*resp.commitment);
}

std::optional<std::string> CdbIpcContractDB::get_debug_function_name(const avm2::AztecAddress& address,
                                                                     const avm2::FunctionSelector& selector) const
{
    auto resp = client_->get_debug_function_name(wire::CdbGetDebugFunctionName{
        .address = fr_to_wire(address), .selector = fr_to_wire(selector), .forkId = fork_id_ });
    return resp.name;
}

void CdbIpcContractDB::add_contracts(const avm2::ContractDeploymentData& contract_deployment_data)
{
    client_->add_contracts(wire::CdbAddContracts{
        .contractDeploymentData = contract_deployment_data_to_wire(contract_deployment_data), .forkId = fork_id_ });
}

void CdbIpcContractDB::create_checkpoint()
{
    client_->create_checkpoint(wire::CdbCreateCheckpoint{ .forkId = fork_id_ });
}

void CdbIpcContractDB::commit_checkpoint()
{
    client_->commit_checkpoint(wire::CdbCommitCheckpoint{ .forkId = fork_id_ });
}

void CdbIpcContractDB::revert_checkpoint()
{
    client_->revert_checkpoint(wire::CdbRevertCheckpoint{ .forkId = fork_id_ });
}

} // namespace bb::cdb
