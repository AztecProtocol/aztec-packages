#include "barretenberg/avm/host_call_contract_db.hpp"

#include "barretenberg/cdb/generated/cdb_types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "ipc_codegen/msgpack_adaptor.hpp"

#include <cstdlib>
#include <stdexcept>
#include <vector>

namespace bb::avm {

using namespace bb::cdb;       // field aliases: AztecAddress, ContractClassId, FunctionSelector
using namespace bb::cdb::wire; // command/response types: CdbGetContractInstance, ...

namespace {

// The AVM host's target id for the contracts-DB service; the host-side router
// maps it to the CDB handler. The AVM host has a single reverse service today,
// so 0 (the wasm oracle convention) suffices; the field exists to support N.
constexpr uint32_t CDB_TARGET = 0;

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

HostCallContractDB::HostCallContractDB(avm_host_call_fn host_call)
    : host_call_(host_call)
{}

HostCallContractDB::~HostCallContractDB() = default;

template <typename Cmd, typename Resp> Resp HostCallContractDB::send(Cmd&& cmd) const
{
    // Serialize as [[CommandName, {payload}]] — identical framing to the generated CdbIpcClient, so the
    // host routes it straight to the same CDB dispatch (handleRequest).
    msgpack::sbuffer send_buffer;
    msgpack::packer<msgpack::sbuffer> pk(send_buffer);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(Cmd::MSGPACK_SCHEMA_NAME));
    pk.pack(std::forward<Cmd>(cmd));

    uint8_t* resp_ptr = nullptr;
    size_t resp_len = 0;
    host_call_(
        CDB_TARGET, reinterpret_cast<const uint8_t*>(send_buffer.data()), send_buffer.size(), &resp_ptr, &resp_len);
    if (resp_ptr == nullptr) {
        throw std::runtime_error("host_call returned no response");
    }
    std::vector<uint8_t> response_bytes(resp_ptr, resp_ptr + resp_len);
    std::free(resp_ptr);

    // Parse response: [ResponseName, {payload}]
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(response_bytes.data()), response_bytes.size());
    auto obj = unpacked.get();
    if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2 ||
        obj.via.array.ptr[0].type != msgpack::type::STR) {
        throw std::runtime_error("Invalid response format from host_call");
    }
    std::string resp_name(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
    if (resp_name == "CdbErrorResponse") {
        throw std::runtime_error("host_call CDB error");
    }
    if (resp_name != Resp::MSGPACK_SCHEMA_NAME) {
        throw std::runtime_error("Expected response '" + std::string(Resp::MSGPACK_SCHEMA_NAME) + "' but got '" +
                                 resp_name + "'");
    }
    Resp result;
    obj.via.array.ptr[1].convert(result);
    return result;
}

std::optional<avm2::ContractInstance> HostCallContractDB::get_contract_instance(const avm2::AztecAddress& address) const
{
    auto resp = send<CdbGetContractInstance, CdbGetContractInstanceResponse>(
        CdbGetContractInstance{ .address = field_to_wire<AztecAddress>(address), .forkId = fork_id_ });
    return decode_optional_msgpack<avm2::ContractInstance>(resp.instance);
}

std::optional<avm2::ContractClass> HostCallContractDB::get_contract_class(const avm2::ContractClassId& class_id) const
{
    auto resp = send<CdbGetContractClass, CdbGetContractClassResponse>(
        CdbGetContractClass{ .classId = field_to_wire<ContractClassId>(class_id), .forkId = fork_id_ });
    return decode_optional_msgpack<avm2::ContractClass>(resp.contractClass);
}

std::optional<avm2::FF> HostCallContractDB::get_bytecode_commitment(const avm2::ContractClassId& class_id) const
{
    auto resp = send<CdbGetBytecodeCommitment, CdbGetBytecodeCommitmentResponse>(
        CdbGetBytecodeCommitment{ .classId = field_to_wire<ContractClassId>(class_id), .forkId = fork_id_ });
    return resp.commitment.has_value() ? std::optional<avm2::FF>(field_from_wire(*resp.commitment)) : std::nullopt;
}

std::optional<std::string> HostCallContractDB::get_debug_function_name(const avm2::AztecAddress& address,
                                                                       const avm2::FunctionSelector& selector) const
{
    auto resp = send<CdbGetDebugFunctionName, CdbGetDebugFunctionNameResponse>(
        CdbGetDebugFunctionName{ .address = field_to_wire<AztecAddress>(address),
                                 .selector = field_to_wire<FunctionSelector>(selector),
                                 .forkId = fork_id_ });
    return resp.name;
}

void HostCallContractDB::add_contracts(const avm2::ContractDeploymentData& contract_deployment_data)
{
    send<CdbAddContracts, CdbAddContractsResponse>(CdbAddContracts{
        .contractDeploymentData = serialize_to_msgpack(contract_deployment_data), .forkId = fork_id_ });
}

void HostCallContractDB::create_checkpoint()
{
    send<CdbCreateCheckpoint, CdbCreateCheckpointResponse>(CdbCreateCheckpoint{ .forkId = fork_id_ });
}

void HostCallContractDB::commit_checkpoint()
{
    send<CdbCommitCheckpoint, CdbCommitCheckpointResponse>(CdbCommitCheckpoint{ .forkId = fork_id_ });
}

void HostCallContractDB::revert_checkpoint()
{
    send<CdbRevertCheckpoint, CdbRevertCheckpointResponse>(CdbRevertCheckpoint{ .forkId = fork_id_ });
}

} // namespace bb::avm
