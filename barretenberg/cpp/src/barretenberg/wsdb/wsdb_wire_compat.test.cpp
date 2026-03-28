/**
 * @brief Wire-format compatibility tests for WSDB IPC protocol.
 *
 * These tests serialize WSDB wire types to msgpack and verify the wire format
 * matches the expected structure. This ensures cross-language compatibility --
 * any language that can produce the same bytes can talk to WSDB.
 */

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/wsdb/generated/wsdb_types.hpp"

#include <gtest/gtest.h>
#include <tuple>
#include <vector>

namespace bb::wsdb::wire {

// Helper: Deserialize and inspect the msgpack structure
msgpack::object_handle unpack(const std::vector<uint8_t>& data)
{
    return msgpack::unpack(reinterpret_cast<const char*>(data.data()), data.size());
}

// Helper: Serialize a value to msgpack bytes
template <typename T> std::vector<uint8_t> to_bytes(const T& value)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, value);
    return std::vector<uint8_t>(buffer.data(), buffer.data() + buffer.size());
}

// ---------------------------------------------------------------------------
// Wire type round-trip tests
// ---------------------------------------------------------------------------

TEST(WsdbWireCompat, GetTreeInfoRoundTrip)
{
    WsdbGetTreeInfo original;
    original.treeId = 1; // NOTE_HASH_TREE
    original.revision = WorldStateRevision{ .forkId = 5, .blockNumber = 100, .includeUncommitted = false };

    auto bytes = to_bytes(original);
    auto oh = unpack(bytes);

    WsdbGetTreeInfo deserialized;
    oh.get().convert(deserialized);

    EXPECT_EQ(deserialized.treeId, original.treeId);
    EXPECT_EQ(deserialized.revision.forkId, original.revision.forkId);
    EXPECT_EQ(deserialized.revision.blockNumber, original.revision.blockNumber);
    EXPECT_EQ(deserialized.revision.includeUncommitted, original.revision.includeUncommitted);
}

TEST(WsdbWireCompat, GetTreeInfoResponseRoundTrip)
{
    Fr test_root{};
    test_root[0] = 1; // Simple non-zero root

    WsdbGetTreeInfoResponse original;
    original.treeId = 0; // NULLIFIER_TREE
    original.root = test_root;
    original.size = 512;
    original.depth = 32;

    auto bytes = to_bytes(original);
    auto oh = unpack(bytes);

    WsdbGetTreeInfoResponse deserialized;
    oh.get().convert(deserialized);

    EXPECT_EQ(deserialized.treeId, original.treeId);
    EXPECT_EQ(deserialized.root, original.root);
    EXPECT_EQ(deserialized.size, original.size);
    EXPECT_EQ(deserialized.depth, original.depth);
}

TEST(WsdbWireCompat, CreateForkRoundTrip)
{
    WsdbCreateFork original;
    original.latest = false;
    original.blockNumber = 50;

    auto bytes = to_bytes(original);
    auto oh = unpack(bytes);

    WsdbCreateFork deserialized;
    oh.get().convert(deserialized);

    EXPECT_EQ(deserialized.latest, original.latest);
    EXPECT_EQ(deserialized.blockNumber, original.blockNumber);
}

TEST(WsdbWireCompat, GetLeafValueRequestRoundTrip)
{
    WsdbGetLeafValue original;
    original.treeId = 2; // PUBLIC_DATA_TREE
    original.revision = WorldStateRevision{ .forkId = 1, .blockNumber = 10, .includeUncommitted = true };
    original.leafIndex = 42;

    auto bytes = to_bytes(original);
    auto oh = unpack(bytes);

    WsdbGetLeafValue deserialized;
    oh.get().convert(deserialized);

    EXPECT_EQ(deserialized.treeId, original.treeId);
    EXPECT_EQ(deserialized.leafIndex, original.leafIndex);
    EXPECT_EQ(deserialized.revision.forkId, original.revision.forkId);
}

TEST(WsdbWireCompat, ErrorResponseFormat)
{
    WsdbErrorResponse err;
    err.message = "tree not found";

    auto bytes = to_bytes(err);
    auto oh = unpack(bytes);
    auto obj = oh.get();

    // Should be a map with "message" field
    ASSERT_EQ(obj.type, msgpack::type::MAP);

    WsdbErrorResponse deserialized;
    obj.convert(deserialized);
    EXPECT_EQ(deserialized.message, "tree not found");
}

TEST(WsdbWireCompat, StatusFullRoundTrip)
{
    WorldStateStatusSummary summary;
    summary.unfinalizedBlockNumber = 100;
    summary.finalizedBlockNumber = 90;
    summary.oldestHistoricalBlock = 10;
    summary.treesAreSynched = true;

    WorldStateStatusFull original;
    original.summary = summary;
    // Leave other fields default-initialized

    auto bytes = to_bytes(original);
    auto oh = unpack(bytes);

    WorldStateStatusFull deserialized;
    oh.get().convert(deserialized);

    EXPECT_EQ(deserialized.summary.unfinalizedBlockNumber, original.summary.unfinalizedBlockNumber);
    EXPECT_EQ(deserialized.summary.finalizedBlockNumber, original.summary.finalizedBlockNumber);
    EXPECT_EQ(deserialized.summary.treesAreSynched, original.summary.treesAreSynched);
}

} // namespace bb::wsdb::wire
