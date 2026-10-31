// This file stands in for the host (ipc_runtime_host_call below).
#define IPC_CODEGEN_HOST_CALL_DEFINED
#include "barretenberg/avm/generated/avm_ffi.hpp"
#include "barretenberg/avm/minimal_tx_fixture.hpp"
#include "barretenberg/cdb/generated/cdb_types.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2_wsdb/generated/ipc_codegen/host_call_backend.hpp"
#include "barretenberg/vm2_wsdb/wsdb_ipc_client.hpp"
#include "barretenberg/vm2_wsdb/wsdb_wire.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>

// wsdb-ref's FFI entry, linked into the tests as the world state Simulate reaches through host_call.
extern "C" void wsdb_ipc_ffi_entry(const uint8_t* input, size_t input_len, uint8_t** output, size_t* output_len);
extern "C" void wsdb_ipc_ffi_free(void* ptr);

using namespace bb;
using namespace bb::avm;

namespace {

const std::vector<uint8_t> MINIMAL_TX(std::begin(MINIMAL_TX_FIXTURE), std::end(MINIMAL_TX_FIXTURE));

/** A decoded response frame: its tag, and the payload (or the service's error message). */
struct Response {
    std::string tag;
    std::vector<uint8_t> result;
    std::string error;
};

/** Call the service through the generated in-process FFI entry: the path the wasm transport takes. */
Response call_ffi(const char* name, const auto& cmd)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(name));
    pk.pack(cmd);

    uint8_t* output = nullptr;
    size_t output_len = 0;
    avm_ipc_ffi_entry(reinterpret_cast<const uint8_t*>(buf.data()), buf.size(), &output, &output_len);
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(output), output_len);
    avm_ipc_ffi_free(output);

    auto obj = unpacked.get();
    Response response{ .tag = std::string(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size) };
    if (response.tag == "AvmErrorResponse") {
        wire::AvmErrorResponse error;
        obj.via.array.ptr[1].convert(error);
        response.error = error.message;
    } else {
        // AvmSimulateResponse and AvmSimulateWithHintsResponse share their shape.
        wire::AvmSimulateWithHintsResponse ok;
        obj.via.array.ptr[1].convert(ok);
        response.result = ok.result;
    }
    return response;
}

template <typename T> std::vector<uint8_t> pack(const T& value)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, value);
    return { buf.data(), buf.data() + buf.size() };
}

/** One response frame as the generated dispatch writes it: [tag, payload]. */
template <typename T> std::vector<uint8_t> response_frame(const std::string& tag, const T& payload)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(2);
    pk.pack(tag);
    pk.pack(payload);
    return { buf.data(), buf.data() + buf.size() };
}

/**
 * A contract DB serving the fixture's contracts, over the cdb wire contract: what the host binds to "cdb". It records
 * the commands it answers and the fork ids they carry.
 */
struct FixtureContractDB {
    std::map<avm2::AztecAddress, avm2::ContractInstance> instances;
    std::map<avm2::ContractClassId, avm2::ContractClass> classes;
    std::map<avm2::ContractClassId, avm2::FF> commitments;
    std::vector<std::string> commands;
    std::vector<uint64_t> fork_ids;

    explicit FixtureContractDB(const avm2::ExecutionHints& hints)
    {
        for (const auto& hint : hints.contract_instances) {
            const auto& keys = hint.public_keys;
            instances.try_emplace(hint.address,
                                  avm2::ContractInstance{
                                      .salt = hint.salt,
                                      .deployer = hint.deployer,
                                      .current_contract_class_id = hint.current_contract_class_id,
                                      .original_contract_class_id = hint.original_contract_class_id,
                                      .initialization_hash = hint.initialization_hash,
                                      .immutables_hash = hint.immutables_hash,
                                      .public_keys = { .nullifier_key_hash = keys.npk_m_hash,
                                                       .incoming_viewing_key = keys.ivpk_m,
                                                       .outgoing_viewing_key_hash = keys.ovpk_m_hash,
                                                       .tagging_key_hash = keys.tpk_m_hash,
                                                       .message_signing_key_hash = keys.mspk_m_hash,
                                                       .fallback_key_hash = keys.fbpk_m_hash },
                                  });
        }
        for (const auto& hint : hints.contract_classes) {
            classes.try_emplace(hint.class_id,
                                avm2::ContractClass{ .id = hint.class_id,
                                                     .artifact_hash = hint.artifact_hash,
                                                     .private_functions_root = hint.private_functions_root,
                                                     .packed_bytecode = hint.packed_bytecode });
        }
        for (const auto& hint : hints.bytecode_commitments) {
            commitments.try_emplace(hint.class_id, hint.commitment);
        }
    }

    static avm2::FF field(const std::array<uint8_t, 32>& wire) { return avm2::FF::serialize_from_buffer(wire.data()); }

    std::vector<uint8_t> handle(std::span<const uint8_t> request)
    {
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(request.data()), request.size());
        const auto& command = unpacked.get().via.array.ptr[0];
        std::string name(command.via.array.ptr[0].via.str.ptr, command.via.array.ptr[0].via.str.size);
        const auto& payload = command.via.array.ptr[1];
        commands.push_back(name);

        using namespace cdb::wire;
        if (name == "CdbGetContractInstance") {
            auto cmd = payload.as<CdbGetContractInstance>();
            fork_ids.push_back(cmd.forkId);
            auto it = instances.find(field(cmd.address));
            return response_frame("CdbGetContractInstanceResponse",
                                  CdbGetContractInstanceResponse{ .instance = it == instances.end()
                                                                                  ? std::nullopt
                                                                                  : std::optional(pack(it->second)) });
        }
        if (name == "CdbGetContractClass") {
            auto cmd = payload.as<CdbGetContractClass>();
            fork_ids.push_back(cmd.forkId);
            auto it = classes.find(field(cmd.classId));
            return response_frame(
                "CdbGetContractClassResponse",
                CdbGetContractClassResponse{ .contractClass = it == classes.end() ? std::nullopt
                                                                                  : std::optional(pack(it->second)) });
        }
        if (name == "CdbGetBytecodeCommitment") {
            auto cmd = payload.as<CdbGetBytecodeCommitment>();
            fork_ids.push_back(cmd.forkId);
            CdbGetBytecodeCommitmentResponse response;
            if (auto it = commitments.find(field(cmd.classId)); it != commitments.end()) {
                std::array<uint8_t, 32> wire{};
                avm2::FF::serialize_to_buffer(it->second, wire.data());
                response.commitment = wire;
            }
            return response_frame("CdbGetBytecodeCommitmentResponse", response);
        }
        if (name == "CdbGetDebugFunctionName") {
            return response_frame("CdbGetDebugFunctionNameResponse", CdbGetDebugFunctionNameResponse{});
        }
        // AddContracts and the checkpoint commands answer with an empty payload.
        return response_frame(name + "Response", std::map<std::string, int>{});
    }
};

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
FixtureContractDB* g_contract_db = nullptr;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
size_t g_wsdb_calls = 0;

} // namespace

/**
 * The host for these tests, in place of ipc-runtime's: "wsdb" is wsdb-ref's FFI entry, linked in, and "cdb" the
 * fixture's contract DB. In wasm this definition stands in for the module's import.
 */
extern "C" int32_t ipc_runtime_host_call(const uint8_t* target,
                                         size_t target_len,
                                         const uint8_t* request,
                                         size_t request_len,
                                         uint8_t** response,
                                         size_t* response_len)
{
    std::string name(reinterpret_cast<const char*>(target), target_len);
    std::vector<uint8_t> bytes;
    int32_t status = 0;
    if (name == "wsdb") {
        ++g_wsdb_calls;
        uint8_t* out = nullptr;
        size_t out_len = 0;
        wsdb_ipc_ffi_entry(request, request_len, &out, &out_len);
        bytes.assign(out, out + out_len);
        wsdb_ipc_ffi_free(out);
    } else if (name == "cdb" && g_contract_db != nullptr) {
        bytes = g_contract_db->handle({ request, request_len });
    } else {
        static constexpr char message[] = "no such target";
        bytes.assign(message, message + sizeof(message) - 1);
        status = 1;
    }
    // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
    *response = static_cast<uint8_t*>(std::malloc(bytes.size() == 0 ? 1 : bytes.size()));
    std::memcpy(*response, bytes.data(), bytes.size());
    *response_len = bytes.size();
    return status;
}

// The fixture carries the public inputs the transaction produced, so the simulation's outputs can be checked against
// them. A build where a wider type narrows (size_t is 32-bit on wasm32) gets them wrong.
TEST(AvmFfi, SimulateWithHintsMatchesTheFixturesPublicInputs)
{
    auto response = call_ffi("AvmSimulateWithHints", wire::AvmSimulateWithHints{ .inputs = MINIMAL_TX });
    ASSERT_EQ(response.tag, "AvmSimulateWithHintsResponse") << response.error;

    avm2::TxSimulationResult result;
    msgpack::unpack(reinterpret_cast<const char*>(response.result.data()), response.result.size())
        .get()
        .convert(result);
    auto expected = avm2::AvmProvingInputs::from(MINIMAL_TX).public_inputs;
    EXPECT_EQ(result.revert_code == avm2::RevertCode::OK, !expected.reverted);
    EXPECT_EQ(result.gas_used.total_gas, expected.end_gas_used);
    EXPECT_EQ(result.public_tx_effect.transaction_fee, expected.transaction_fee);
    EXPECT_EQ(result.public_tx_effect.note_hashes.size(), expected.accumulated_data_array_lengths.note_hashes);
    EXPECT_EQ(result.public_tx_effect.nullifiers.size(), expected.accumulated_data_array_lengths.nullifiers);
    EXPECT_EQ(result.public_tx_effect.public_data_writes.size(),
              expected.accumulated_data_array_lengths.public_data_writes);
}

// The exceptions the simulator signals exceptional halts with are caught where it expects, including in wasm.
TEST(AvmFfi, SimulatorExceptionsAreCaught)
{
    EXPECT_THROW(avm2::TaggedValue::from<uint8_t>(1) + avm2::TaggedValue::from<uint16_t>(1),
                 avm2::TagMismatchException);
}

// Inputs that fail to decode throw inside the simulator, and the entry answers with an error rather than ending the
// module, so the next call still succeeds.
TEST(AvmFfi, MalformedInputsGetAnErrorAndTheEntryKeepsAnswering)
{
    auto bad = call_ffi("AvmSimulateWithHints", wire::AvmSimulateWithHints{ .inputs = { 1, 2, 3 } });
    EXPECT_EQ(bad.tag, "AvmErrorResponse");
    EXPECT_FALSE(bad.error.empty());

    auto good = call_ffi("AvmSimulateWithHints", wire::AvmSimulateWithHints{ .inputs = MINIMAL_TX });
    EXPECT_EQ(good.tag, "AvmSimulateWithHintsResponse") << good.error;
}

// Simulate reads and writes its world state and contract DB through the host: the fixture's transaction, simulated on a
// fork of wsdb-ref's genesis with the fixture's contracts, reaches both and leaves its effects on that fork.
TEST(AvmFfi, SimulateReachesTheWorldStateAndContractDBThroughTheHost)
{
    auto proving_inputs = avm2::AvmProvingInputs::from(MINIMAL_TX);
    const auto& hints = proving_inputs.hints;
    FixtureContractDB contract_db(hints);
    g_contract_db = &contract_db;

    wsdb::WsdbIpcClient wsdb(ipc_codegen::AnyBackend(ipc_codegen::HostCallBackend("wsdb")));
    uint64_t fork_id = wsdb.create_fork(wsdb::WsdbCreateFork{ .latest = true, .blockNumber = 0 }).forkId;
    // The fork as it stands, uncommitted leaves included: what the simulation reads and writes.
    world_state::WorldStateRevision fork{ .forkId = fork_id,
                                          .blockNumber = world_state::WorldStateRevision::LATEST,
                                          .includeUncommitted = true };
    auto nullifier_tree = [&] {
        return wsdb.get_tree_info(wsdb::WsdbGetTreeInfo{
            .treeId = wsdb::to_wire(world_state::MerkleTreeId::NULLIFIER_TREE), .revision = wsdb::to_wire(fork) });
    };
    auto nullifiers_before = nullifier_tree().size;
    size_t wsdb_calls_before = g_wsdb_calls;

    avm2::AvmFastSimulationInputs inputs{
        .ws_revision = fork,
        .config = { .skip_fee_enforcement = true },
        .tx = hints.tx,
        .global_variables = hints.global_variables,
        .protocol_contracts = hints.protocol_contracts,
    };
    auto response = call_ffi("AvmSimulate", wire::AvmSimulate{ .inputs = pack(inputs) });
    g_contract_db = nullptr;
    ASSERT_EQ(response.tag, "AvmSimulateResponse") << response.error;

    avm2::TxSimulationResult result;
    msgpack::unpack(reinterpret_cast<const char*>(response.result.data()), response.result.size())
        .get()
        .convert(result);
    EXPECT_GT(g_wsdb_calls, wsdb_calls_before);
    EXPECT_NE(std::find(contract_db.commands.begin(), contract_db.commands.end(), "CdbGetContractInstance"),
              contract_db.commands.end());
    for (uint64_t id : contract_db.fork_ids) {
        EXPECT_EQ(id, fork_id);
    }
    // The transaction's nullifiers are on the fork, so the simulation wrote through the host too.
    EXPECT_GT(result.public_tx_effect.nullifiers.size(), 0U);
    EXPECT_GT(nullifier_tree().size, nullifiers_before);
}

// A target the host does not bind fails the call that reaches for it, and the entry keeps answering.
TEST(AvmFfi, AnUnboundTargetFailsTheCall)
{
    ipc_codegen::HostCallBackend backend("nothing");
    EXPECT_THROW(backend.call(std::vector<uint8_t>{ 0x90 }), std::runtime_error);

    auto good = call_ffi("AvmSimulateWithHints", wire::AvmSimulateWithHints{ .inputs = MINIMAL_TX });
    EXPECT_EQ(good.tag, "AvmSimulateWithHintsResponse") << good.error;
}

// wasm does not find main() in gtest_main (see ecc_tests' secp256r1.test.cpp).
#ifdef __wasm__
GTEST_API_ int main(int argc, char** argv)
{
    testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
#endif
