/**
 * @brief Wire-format compatibility tests for WSDB IPC protocol.
 *
 * These tests serialize WSDB commands and responses to msgpack and verify the
 * wire format matches the expected structure. This ensures cross-language
 * compatibility — any language that can produce the same bytes can talk to WSDB.
 *
 * Test strategy:
 *   1. Construct a command with known field values
 *   2. Wrap in NamedUnion + tuple (like a real IPC request)
 *   3. Serialize to msgpack
 *   4. Deserialize and verify the structure: [["CommandName", {fields...}]]
 *   5. Round-trip: deserialize back to the original type and compare
 */

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/wsdb/wsdb_commands.hpp"
#include "barretenberg/wsdb/wsdb_execute.hpp"

#include <gtest/gtest.h>
#include <tuple>
#include <vector>

namespace bb::wsdb {

// Helper: Serialize a command the same way the IPC client does
template <typename Cmd> std::vector<uint8_t> serialize_request(Cmd cmd)
{
    WsdbCommand command = std::move(cmd);
    auto wrapped = std::make_tuple(std::move(command));
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, wrapped);
    return std::vector<uint8_t>(buffer.data(), buffer.data() + buffer.size());
}

// Helper: Serialize a response the same way the IPC server does
template <typename Resp> std::vector<uint8_t> serialize_response(Resp resp)
{
    WsdbCommandResponse response = std::move(resp);
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, response);
    return std::vector<uint8_t>(buffer.data(), buffer.data() + buffer.size());
}

// Helper: Deserialize and inspect the msgpack structure
msgpack::object_handle unpack(const std::vector<uint8_t>& data)
{
    return msgpack::unpack(reinterpret_cast<const char*>(data.data()), data.size());
}

// ---------------------------------------------------------------------------
// Request wire format tests
// ---------------------------------------------------------------------------

TEST(WsdbWireCompat, GetTreeInfoRequestFormat)
{
    // Construct a known command
    WsdbGetTreeInfo cmd;
    cmd.treeId = MerkleTreeId::NULLIFIER_TREE;
    cmd.revision = WorldStateRevision{ .forkId = 0, .blockNumber = 42, .includeUncommitted = true };

    auto bytes = serialize_request(std::move(cmd));
    auto oh = unpack(bytes);
    auto obj = oh.get();

    // Wire format: [[command_name, {fields}]]
    // Outer: 1-element array (tuple wrapper)
    ASSERT_EQ(obj.type, msgpack::type::ARRAY);
    ASSERT_EQ(obj.via.array.size, 1u);

    // Inner: 2-element array (NamedUnion)
    auto& named_union = obj.via.array.ptr[0];
    ASSERT_EQ(named_union.type, msgpack::type::ARRAY);
    ASSERT_EQ(named_union.via.array.size, 2u);

    // Element 0: command name string
    auto& name = named_union.via.array.ptr[0];
    ASSERT_EQ(name.type, msgpack::type::STR);
    std::string cmd_name(name.via.str.ptr, name.via.str.size);
    EXPECT_EQ(cmd_name, "WsdbGetTreeInfo");

    // Element 1: command payload (map)
    auto& payload = named_union.via.array.ptr[1];
    ASSERT_EQ(payload.type, msgpack::type::MAP);
    EXPECT_GE(payload.via.map.size, 2u); // treeId, revision
}

TEST(WsdbWireCompat, GetTreeInfoRoundTrip)
{
    WsdbGetTreeInfo original;
    original.treeId = MerkleTreeId::NOTE_HASH_TREE;
    original.revision = WorldStateRevision{ .forkId = 5, .blockNumber = 100, .includeUncommitted = false };

    auto bytes = serialize_request(original);

    // Deserialize back
    auto oh = unpack(bytes);
    auto obj = oh.get();

    // Extract the command from the tuple wrapper
    std::tuple<WsdbCommand> wrapped;
    obj.convert(wrapped);

    auto& command = std::get<0>(wrapped);

    // Visit to get the original type back
    std::move(command).visit([&](auto&& deserialized) {
        using T = std::decay_t<decltype(deserialized)>;
        if constexpr (std::is_same_v<T, WsdbGetTreeInfo>) {
            EXPECT_EQ(deserialized.treeId, original.treeId);
            EXPECT_EQ(deserialized.revision.forkId, original.revision.forkId);
            EXPECT_EQ(deserialized.revision.blockNumber, original.revision.blockNumber);
            EXPECT_EQ(deserialized.revision.includeUncommitted, original.revision.includeUncommitted);
        } else {
            FAIL() << "Deserialized to wrong command type";
        }
    });
}

// ---------------------------------------------------------------------------
// Response wire format tests
// ---------------------------------------------------------------------------

TEST(WsdbWireCompat, GetTreeInfoResponseFormat)
{
    WsdbGetTreeInfo::Response resp;
    resp.treeId = MerkleTreeId::NULLIFIER_TREE;
    resp.root = fr::one();
    resp.size = 1024;
    resp.depth = 40;

    auto bytes = serialize_response(std::move(resp));
    auto oh = unpack(bytes);
    auto obj = oh.get();

    // Wire format: [response_name, {fields}] (no tuple wrapper)
    ASSERT_EQ(obj.type, msgpack::type::ARRAY);
    ASSERT_EQ(obj.via.array.size, 2u);

    // Element 0: response name
    auto& name = obj.via.array.ptr[0];
    ASSERT_EQ(name.type, msgpack::type::STR);
    std::string resp_name(name.via.str.ptr, name.via.str.size);
    EXPECT_EQ(resp_name, "WsdbGetTreeInfoResponse");

    // Element 1: response payload (map)
    auto& payload = obj.via.array.ptr[1];
    ASSERT_EQ(payload.type, msgpack::type::MAP);
}

TEST(WsdbWireCompat, GetTreeInfoResponseRoundTrip)
{
    WsdbGetTreeInfo::Response original;
    original.treeId = MerkleTreeId::NOTE_HASH_TREE;
    original.root = fr::one();
    original.size = 512;
    original.depth = 32;

    auto bytes = serialize_response(original);

    // Deserialize back
    auto oh = unpack(bytes);
    auto obj = oh.get();

    WsdbCommandResponse response;
    obj.convert(response);

    std::move(response).visit([&](auto&& deserialized) {
        using T = std::decay_t<decltype(deserialized)>;
        if constexpr (std::is_same_v<T, WsdbGetTreeInfo::Response>) {
            EXPECT_EQ(deserialized.treeId, original.treeId);
            EXPECT_EQ(deserialized.root, original.root);
            EXPECT_EQ(deserialized.size, original.size);
            EXPECT_EQ(deserialized.depth, original.depth);
        } else {
            FAIL() << "Deserialized to wrong response type";
        }
    });
}

// ---------------------------------------------------------------------------
// Error response wire format
// ---------------------------------------------------------------------------

TEST(WsdbWireCompat, ErrorResponseFormat)
{
    WsdbErrorResponse err;
    err.message = "tree not found";

    auto bytes = serialize_response(std::move(err));
    auto oh = unpack(bytes);
    auto obj = oh.get();

    ASSERT_EQ(obj.type, msgpack::type::ARRAY);
    ASSERT_EQ(obj.via.array.size, 2u);

    auto& name = obj.via.array.ptr[0];
    std::string resp_name(name.via.str.ptr, name.via.str.size);
    EXPECT_EQ(resp_name, "WsdbErrorResponse");

    auto& payload = obj.via.array.ptr[1];
    ASSERT_EQ(payload.type, msgpack::type::MAP);
}

// ---------------------------------------------------------------------------
// CreateFork round-trip (tests a command with uint64_t response)
// ---------------------------------------------------------------------------

TEST(WsdbWireCompat, CreateForkRoundTrip)
{
    WsdbCreateFork original;
    original.latest = false;
    original.blockNumber = 50;

    auto bytes = serialize_request(original);
    auto oh = unpack(bytes);
    auto obj = oh.get();

    std::tuple<WsdbCommand> wrapped;
    obj.convert(wrapped);

    std::move(std::get<0>(wrapped)).visit([&](auto&& deserialized) {
        using T = std::decay_t<decltype(deserialized)>;
        if constexpr (std::is_same_v<T, WsdbCreateFork>) {
            EXPECT_EQ(deserialized.latest, original.latest);
            EXPECT_EQ(deserialized.blockNumber, original.blockNumber);
        } else {
            FAIL() << "Deserialized to wrong command type";
        }
    });
}

// ---------------------------------------------------------------------------
// GetLeafValue round-trip (tests optional<vector<uint8_t>> in response)
// ---------------------------------------------------------------------------

TEST(WsdbWireCompat, GetLeafValueRequestRoundTrip)
{
    WsdbGetLeafValue original;
    original.treeId = MerkleTreeId::PUBLIC_DATA_TREE;
    original.revision = WorldStateRevision{ .forkId = 1, .blockNumber = 10, .includeUncommitted = true };
    original.leafIndex = 42;

    auto bytes = serialize_request(original);
    auto oh = unpack(bytes);
    auto obj = oh.get();

    std::tuple<WsdbCommand> wrapped;
    obj.convert(wrapped);

    std::move(std::get<0>(wrapped)).visit([&](auto&& deserialized) {
        using T = std::decay_t<decltype(deserialized)>;
        if constexpr (std::is_same_v<T, WsdbGetLeafValue>) {
            EXPECT_EQ(deserialized.treeId, original.treeId);
            EXPECT_EQ(deserialized.leafIndex, original.leafIndex);
            EXPECT_EQ(deserialized.revision.forkId, original.revision.forkId);
        } else {
            FAIL() << "Deserialized to wrong command type";
        }
    });
}

} // namespace bb::wsdb
