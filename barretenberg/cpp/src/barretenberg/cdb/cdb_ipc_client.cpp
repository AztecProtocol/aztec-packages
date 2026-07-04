#include "barretenberg/cdb/cdb_ipc_client.hpp"

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

namespace bb::cdb {

namespace {

template <typename T> std::vector<uint8_t> serialize_to_msgpack(const T& value)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, value);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

template <typename T> T deserialize_from_msgpack(const std::vector<uint8_t>& bytes)
{
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(bytes.data()), bytes.size());
    T value;
    unpacked.get().convert(value);
    return value;
}

template <typename Alias> Alias field_to_wire(const avm2::FF& field)
{
    Alias wire{};
    avm2::FF::serialize_to_buffer(field, wire.data());
    return wire;
}

template <typename Alias> avm2::FF field_from_wire(const Alias& wire)
{
    return avm2::FF::serialize_from_buffer(wire.data());
}

template <typename T> std::optional<T> decode_optional_msgpack(const std::optional<std::vector<uint8_t>>& bytes)
{
    if (!bytes.has_value()) {
        return std::nullopt;
    }
    return deserialize_from_msgpack<T>(*bytes);
}

} // namespace

CdbIpcContractDB::CdbIpcContractDB(const std::string& ipc_path)
    : client_(std::make_unique<CdbIpcClient>(ipc_path))
{}

CdbIpcContractDB::~CdbIpcContractDB() = default;

std::optional<avm2::ContractInstance> CdbIpcContractDB::get_contract_instance(const avm2::AztecAddress& address) const
{
    auto resp = client_->get_contract_instance(
        CdbGetContractInstance{ .address = field_to_wire<AztecAddress>(address), .forkId = fork_id_ });
    return decode_optional_msgpack<avm2::ContractInstance>(resp.instance);
}

std::optional<avm2::ContractClass> CdbIpcContractDB::get_contract_class(const avm2::ContractClassId& class_id) const
{
    auto resp = client_->get_contract_class(
        CdbGetContractClass{ .classId = field_to_wire<ContractClassId>(class_id), .forkId = fork_id_ });
    return decode_optional_msgpack<avm2::ContractClass>(resp.contractClass);
}

std::optional<avm2::FF> CdbIpcContractDB::get_bytecode_commitment(const avm2::ContractClassId& class_id) const
{
    auto resp = client_->get_bytecode_commitment(
        CdbGetBytecodeCommitment{ .classId = field_to_wire<ContractClassId>(class_id), .forkId = fork_id_ });
    return resp.commitment.has_value() ? std::optional<avm2::FF>(field_from_wire(*resp.commitment)) : std::nullopt;
}

std::optional<std::string> CdbIpcContractDB::get_debug_function_name(const avm2::AztecAddress& address,
                                                                     const avm2::FunctionSelector& selector) const
{
    auto resp =
        client_->get_debug_function_name(CdbGetDebugFunctionName{ .address = field_to_wire<AztecAddress>(address),
                                                                  .selector = field_to_wire<FunctionSelector>(selector),
                                                                  .forkId = fork_id_ });
    return resp.name;
}

void CdbIpcContractDB::add_contracts(const avm2::ContractDeploymentData& contract_deployment_data)
{
    client_->add_contracts(CdbAddContracts{ .contractDeploymentData = serialize_to_msgpack(contract_deployment_data),
                                            .forkId = fork_id_ });
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
