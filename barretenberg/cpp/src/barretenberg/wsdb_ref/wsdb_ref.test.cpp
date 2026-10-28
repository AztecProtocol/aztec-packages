#include "barretenberg/wsdb_ref/wsdb_ref_handlers.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/wsdb_ref/generated/wsdb_ffi.hpp"

#include <gtest/gtest.h>

#include <cstdlib>
#include <string>
#include <variant>

using namespace bb;
using namespace bb::wsdb_ref;

namespace {

constexpr uint32_t LATEST = std::numeric_limits<uint32_t>::max();
const wire::WorldStateRevision LATEST_UNCOMMITTED{ .forkId = 0, .blockNumber = LATEST, .includeUncommitted = true };
const wire::WorldStateRevision LATEST_COMMITTED{ .forkId = 0, .blockNumber = LATEST, .includeUncommitted = false };

std::vector<uint8_t> encode_request(const char* name, const auto& cmd)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(name));
    pk.pack(cmd);
    return { buf.data(), buf.data() + buf.size() };
}

/** A decoded response: the payload, or the service's error message. */
template <typename Resp> using Result = std::variant<Resp, std::string>;

template <typename Resp> Result<Resp> decode_response(const std::vector<uint8_t>& frame, const char* expected)
{
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(frame.data()), frame.size());
    auto obj = unpacked.get();
    std::string tag(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
    if (tag == "WsdbErrorResponse") {
        wire::WsdbErrorResponse error;
        obj.via.array.ptr[1].convert(error);
        return error.message;
    }
    EXPECT_EQ(tag, expected);
    Resp resp;
    obj.via.array.ptr[1].convert(resp);
    return resp;
}

/** Call a service through the generated in-process FFI entry: the path the napi and wasm transports take. */
template <typename Resp> Result<Resp> call_ffi(const char* name, const auto& cmd, const char* expected)
{
    auto request = encode_request(name, cmd);
    uint8_t* output = nullptr;
    size_t output_len = 0;
    wsdb_ipc_ffi_entry(request.data(), request.size(), &output, &output_len);
    std::vector<uint8_t> frame(output, output + output_len);
    wsdb_ipc_ffi_free(output);
    return decode_response<Resp>(frame, expected);
}

/** Call a fresh service instance through the generated dispatch, independent of the FFI's shared state. */
struct Service {
    WsdbRefContext ctx;
    AsyncDispatchHandler handler = make_wsdb_handler(ctx);

    template <typename Resp> Result<Resp> call(const char* name, const auto& cmd, const char* expected)
    {
        auto request = encode_request(name, cmd);
        std::vector<uint8_t> frame;
        handler(request, [&frame](std::vector<uint8_t> response) { frame = std::move(response); });
        return decode_response<Resp>(frame, expected);
    }
};

template <typename Resp> const Resp& ok(const Result<Resp>& result)
{
    if (const auto* error = std::get_if<std::string>(&result)) {
        ADD_FAILURE() << "service error: " << *error;
        static Resp empty{};
        return empty;
    }
    return std::get<Resp>(result);
}

template <typename Resp> std::string error_of(const Result<Resp>& result)
{
    const auto* error = std::get_if<std::string>(&result);
    return error ? *error : std::string("<no error>");
}

template <typename W> W bytes_of(const fr& value)
{
    W w{};
    fr::serialize_to_buffer(value, w.data());
    return w;
}

fr fr_of(const auto& w)
{
    return fr::serialize_from_buffer(w.data());
}

} // namespace

TEST(WsdbRef, FfiEntryServesTheCanonicalGenesis)
{
    auto archive =
        ok(call_ffi<wire::WsdbGetTreeInfoResponse>("WsdbGetTreeInfo",
                                                   wire::WsdbGetTreeInfo{ .treeId = 4, .revision = LATEST_COMMITTED },
                                                   "WsdbGetTreeInfoResponse"));
    EXPECT_EQ(fr_of(archive.root), fr(GENESIS_ARCHIVE_ROOT));
    EXPECT_EQ(archive.size, 1);
    EXPECT_EQ(archive.depth, ARCHIVE_HEIGHT);

    auto header = ok(call_ffi<wire::WsdbGetLeafValueResponse>(
        "WsdbGetLeafValue",
        wire::WsdbGetLeafValue{ .treeId = 4, .revision = LATEST_COMMITTED, .leafIndex = 0 },
        "WsdbGetLeafValueResponse"));
    ASSERT_TRUE(header.value.has_value());
    EXPECT_EQ(fr_of(*header.value), fr(GENESIS_BLOCK_HEADER_HASH));

    auto initial = ok(call_ffi<wire::WsdbGetInitialStateReferenceResponse>(
        "WsdbGetInitialStateReference", wire::WsdbGetInitialStateReference{}, "WsdbGetInitialStateReferenceResponse"));
    ASSERT_EQ(initial.state.size(), 4);
    bool saw_nullifier_tree = false;
    for (const auto& tree : initial.state) {
        if (tree.treeId == 0) {
            saw_nullifier_tree = true;
            EXPECT_EQ(fr_of(tree.root), fr(GENESIS_NULLIFIER_TREE_ROOT));
            EXPECT_EQ(tree.size, 128);
        }
    }
    EXPECT_TRUE(saw_nullifier_tree);
}

TEST(WsdbRef, FfiEntryAnswersBadRequestsWithErrors)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string("WsdbNoSuchCommand"));
    pk.pack_map(0);
    uint8_t* output = nullptr;
    size_t output_len = 0;
    wsdb_ipc_ffi_entry(reinterpret_cast<const uint8_t*>(buf.data()), buf.size(), &output, &output_len);
    std::vector<uint8_t> frame(output, output + output_len);
    wsdb_ipc_ffi_free(output);
    EXPECT_EQ(error_of(decode_response<wire::WsdbGetTreeInfoResponse>(frame, "")),
              "unknown command: WsdbNoSuchCommand");

    EXPECT_EQ(error_of(call_ffi<wire::WsdbGetTreeInfoResponse>(
                  "WsdbGetTreeInfo",
                  wire::WsdbGetTreeInfo{ .treeId = 9, .revision = LATEST_COMMITTED },
                  "WsdbGetTreeInfoResponse")),
              "Unknown tree id 9");
}

TEST(WsdbRef, ForksAndHistoryOverTheWire)
{
    Service service;
    auto fork = ok(service.call<wire::WsdbCreateForkResponse>(
        "WsdbCreateFork", wire::WsdbCreateFork{ .latest = true, .blockNumber = 0 }, "WsdbCreateForkResponse"));
    EXPECT_EQ(fork.forkId, 1);
    ok(service.call<wire::WsdbAppendLeavesResponse>(
        "WsdbAppendLeaves",
        wire::WsdbAppendLeaves{ .treeId = 1, .leaves = { bytes_of<wire::Fr>(fr(42)) }, .forkId = fork.forkId },
        "WsdbAppendLeavesResponse"));
    auto on_fork = ok(service.call<wire::WsdbGetTreeInfoResponse>(
        "WsdbGetTreeInfo",
        wire::WsdbGetTreeInfo{
            .treeId = 1, .revision = { .forkId = fork.forkId, .blockNumber = LATEST, .includeUncommitted = true } },
        "WsdbGetTreeInfoResponse"));
    EXPECT_EQ(on_fork.size, 1);
    auto canonical = ok(service.call<wire::WsdbGetTreeInfoResponse>(
        "WsdbGetTreeInfo",
        wire::WsdbGetTreeInfo{ .treeId = 1, .revision = LATEST_UNCOMMITTED },
        "WsdbGetTreeInfoResponse"));
    EXPECT_EQ(canonical.size, 0);

    EXPECT_EQ(error_of(service.call<wire::WsdbGetTreeInfoResponse>(
                  "WsdbGetTreeInfo",
                  wire::WsdbGetTreeInfo{
                      .treeId = 1, .revision = { .forkId = 3, .blockNumber = LATEST, .includeUncommitted = true } },
                  "WsdbGetTreeInfoResponse")),
              "Fork not found");
    EXPECT_NE(
        error_of(service.call<wire::WsdbGetTreeInfoResponse>(
                     "WsdbGetTreeInfo",
                     wire::WsdbGetTreeInfo{
                         .treeId = 1, .revision = { .forkId = 0, .blockNumber = 5, .includeUncommitted = false } },
                     "WsdbGetTreeInfoResponse"))
            .find("latest block is 0"),
        std::string::npos);
    EXPECT_EQ(error_of(service.call<wire::WsdbGetLeafValueResponse>(
                  "WsdbGetLeafValue",
                  wire::WsdbGetLeafValue{ .treeId = 0, .revision = LATEST_UNCOMMITTED, .leafIndex = 0 },
                  "WsdbGetLeafValueResponse")),
              "Unsupported tree type for get_leaf_value");
    EXPECT_EQ(error_of(service.call<wire::WsdbRevertCheckpointResponse>(
                  "WsdbRevertCheckpoint", wire::WsdbRevertCheckpoint{ .forkId = 0 }, "WsdbRevertCheckpointResponse")),
              "Cannot revert without a checkpoint");
    EXPECT_NE(error_of(service.call<wire::WsdbCopyStoresResponse>(
                           "WsdbCopyStores",
                           wire::WsdbCopyStores{ .dstPath = "/tmp/x", .compact = std::nullopt },
                           "WsdbCopyStoresResponse"))
                  .find("not supported"),
              std::string::npos);
}

std::vector<wire::TreeHeight> protocol_tree_heights()
{
    return { { .treeId = 0, .height = NULLIFIER_TREE_HEIGHT },
             { .treeId = 1, .height = NOTE_HASH_TREE_HEIGHT },
             { .treeId = 2, .height = PUBLIC_DATA_TREE_HEIGHT },
             { .treeId = 3, .height = L1_TO_L2_MSG_TREE_HEIGHT },
             { .treeId = 4, .height = ARCHIVE_HEIGHT } };
}

TEST(WsdbRef, InitGenesisSetsTreeHeightsAndInitialSizes)
{
    Service service;
    auto heights = protocol_tree_heights();
    heights[1].height = 3;
    ok(service.call<wire::WsdbInitGenesisResponse>(
        "WsdbInitGenesis",
        wire::WsdbInitGenesis{ .treeHeights = heights,
                               .treePrefill = { { .treeId = 0, .size = 4 }, { .treeId = 2, .size = 8 } },
                               .prefilledPublicData = {},
                               .prefilledNullifiers = {},
                               .genesisTimestamp = 0,
                               .initialHeaderGeneratorPoint = static_cast<uint32_t>(DOM_SEP__BLOCK_HEADER_HASH) },
        "WsdbInitGenesisResponse"));
    auto tree_info = [&](uint32_t tree_id) {
        return ok(service.call<wire::WsdbGetTreeInfoResponse>(
            "WsdbGetTreeInfo",
            wire::WsdbGetTreeInfo{ .treeId = tree_id, .revision = LATEST_COMMITTED },
            "WsdbGetTreeInfoResponse"));
    };
    EXPECT_EQ(tree_info(0).size, 4);
    EXPECT_EQ(tree_info(2).size, 8);
    EXPECT_EQ(tree_info(1).depth, 3);
    // A three-level note hash tree holds eight leaves.
    auto append = [&](size_t count) {
        return service.call<wire::WsdbAppendLeavesResponse>(
            "WsdbAppendLeaves",
            wire::WsdbAppendLeaves{
                .treeId = 1, .leaves = std::vector<wire::Fr>(count, bytes_of<wire::Fr>(fr(1))), .forkId = 0 },
            "WsdbAppendLeavesResponse");
    };
    ok(append(8));
    EXPECT_FALSE(std::holds_alternative<wire::WsdbAppendLeavesResponse>(append(1)));

    auto rejected = [&](std::vector<wire::TreeHeight> tree_heights, std::vector<wire::TreePrefill> prefill) {
        return error_of(
            service.call<wire::WsdbInitGenesisResponse>("WsdbInitGenesis",
                                                        wire::WsdbInitGenesis{ .treeHeights = std::move(tree_heights),
                                                                               .treePrefill = std::move(prefill),
                                                                               .prefilledPublicData = {},
                                                                               .prefilledNullifiers = {},
                                                                               .genesisTimestamp = 0,
                                                                               .initialHeaderGeneratorPoint = 0 },
                                                        "WsdbInitGenesisResponse"));
    };
    const std::vector<wire::TreePrefill> both = { { .treeId = 0, .size = 128 }, { .treeId = 2, .size = 128 } };
    EXPECT_NE(rejected({ heights.begin(), heights.end() - 1 }, both).find("each of the five trees"), std::string::npos);
    EXPECT_NE(rejected(protocol_tree_heights(), { both[0] }).find("nullifier and public data"), std::string::npos);
    EXPECT_NE(
        rejected(protocol_tree_heights(), { both[0], both[1], { .treeId = 1, .size = 4 } }).find("not an indexed tree"),
        std::string::npos);
    EXPECT_NE(rejected(protocol_tree_heights(), { { .treeId = 0, .size = 1 }, both[1] }).find("initial size > 1"),
              std::string::npos);
}

TEST(WsdbRef, InitGenesisRestartsAtTheGivenGenesis)
{
    Service service;
    auto nullifier_root = [&]() {
        auto info = ok(service.call<wire::WsdbGetTreeInfoResponse>(
            "WsdbGetTreeInfo",
            wire::WsdbGetTreeInfo{ .treeId = 0, .revision = LATEST_COMMITTED },
            "WsdbGetTreeInfoResponse"));
        return fr_of(info.root);
    };
    EXPECT_EQ(nullifier_root(), fr(GENESIS_NULLIFIER_TREE_ROOT));
    ok(service.call<wire::WsdbInitGenesisResponse>(
        "WsdbInitGenesis",
        wire::WsdbInitGenesis{ .treeHeights = protocol_tree_heights(),
                               .treePrefill = { { .treeId = 0, .size = 128 }, { .treeId = 2, .size = 128 } },
                               .prefilledPublicData = { { .slot = bytes_of<wire::PublicDataSlot>(fr(1000)),
                                                          .value = bytes_of<wire::PublicDataValue>(fr(5)) } },
                               .prefilledNullifiers = {},
                               .genesisTimestamp = 0,
                               .initialHeaderGeneratorPoint = static_cast<uint32_t>(DOM_SEP__BLOCK_HEADER_HASH) },
        "WsdbInitGenesisResponse"));
    EXPECT_NE(nullifier_root(), fr(GENESIS_NULLIFIER_TREE_ROOT));
    auto slot = ok(service.call<wire::WsdbFindPublicDataLeafIndicesResponse>(
        "WsdbFindPublicDataLeafIndices",
        wire::WsdbFindPublicDataLeafIndices{ .revision = LATEST_COMMITTED,
                                             .leaves = { { .slot = bytes_of<wire::PublicDataSlot>(fr(1000)),
                                                           .value = bytes_of<wire::PublicDataValue>(fr(0)) } },
                                             .startIndex = 0 },
        "WsdbFindPublicDataLeafIndicesResponse"));
    EXPECT_EQ(slot.indices, (std::vector<std::optional<uint64_t>>{ 127 }));
}

TEST(WsdbRef, InsertsNullifiersWithWitnessesAndRejectsDuplicates)
{
    Service service;
    const fr nullifier(0xabcdef);
    auto inserted = ok(service.call<wire::WsdbSequentialInsertNullifierResponse>(
        "WsdbSequentialInsertNullifier",
        wire::WsdbSequentialInsertNullifier{ .leaves = { { .nullifier = bytes_of<wire::Nullifier>(nullifier) } },
                                             .forkId = 0 },
        "WsdbSequentialInsertNullifierResponse"));
    ASSERT_EQ(inserted.result.insertionWitnessData.size(), 1);
    EXPECT_EQ(inserted.result.insertionWitnessData[0].index, 128);
    EXPECT_EQ(inserted.result.lowLeafWitnessData[0].path.size(), NULLIFIER_TREE_HEIGHT);

    auto found = ok(service.call<wire::WsdbFindNullifierLeafIndicesResponse>(
        "WsdbFindNullifierLeafIndices",
        wire::WsdbFindNullifierLeafIndices{ .revision = LATEST_UNCOMMITTED,
                                            .leaves = { { .nullifier = bytes_of<wire::Nullifier>(nullifier) } },
                                            .startIndex = 0 },
        "WsdbFindNullifierLeafIndicesResponse"));
    ASSERT_EQ(found.indices.size(), 1);
    EXPECT_EQ(found.indices[0], 128);

    // Rejected as a whole: the fresh nullifier in the same batch is not inserted either.
    const fr fresh(0x777);
    auto duplicate = service.call<wire::WsdbSequentialInsertNullifierResponse>(
        "WsdbSequentialInsertNullifier",
        wire::WsdbSequentialInsertNullifier{ .leaves = { { .nullifier = bytes_of<wire::Nullifier>(fresh) },
                                                         { .nullifier = bytes_of<wire::Nullifier>(nullifier) } },
                                             .forkId = 0 },
        "WsdbSequentialInsertNullifierResponse");
    EXPECT_NE(error_of(duplicate).find("is already present"), std::string::npos);
    auto low = ok(service.call<wire::WsdbFindLowLeafResponse>(
        "WsdbFindLowLeaf",
        wire::WsdbFindLowLeaf{ .treeId = 0, .revision = LATEST_UNCOMMITTED, .key = bytes_of<wire::Fr>(fresh) },
        "WsdbFindLowLeafResponse"));
    EXPECT_FALSE(low.alreadyPresent);
}

TEST(WsdbRef, UpdateArchiveChecksTheBlockState)
{
    Service service;
    ok(service.call<wire::WsdbAppendLeavesResponse>(
        "WsdbAppendLeaves",
        wire::WsdbAppendLeaves{ .treeId = 1, .leaves = { bytes_of<wire::Fr>(fr(42)) }, .forkId = 0 },
        "WsdbAppendLeavesResponse"));
    auto state = ok(
        service.call<wire::WsdbGetStateReferenceResponse>("WsdbGetStateReference",
                                                          wire::WsdbGetStateReference{ .revision = LATEST_UNCOMMITTED },
                                                          "WsdbGetStateReferenceResponse"));

    auto stale = ok(service.call<wire::WsdbGetInitialStateReferenceResponse>(
        "WsdbGetInitialStateReference", wire::WsdbGetInitialStateReference{}, "WsdbGetInitialStateReferenceResponse"));
    EXPECT_EQ(
        error_of(service.call<wire::WsdbUpdateArchiveResponse>(
            "WsdbUpdateArchive",
            wire::WsdbUpdateArchive{
                .blockStateRef = stale.state, .blockHeaderHash = bytes_of<wire::BlockHeaderHash>(fr(1)), .forkId = 0 },
            "WsdbUpdateArchiveResponse")),
        "Can't update archive tree: Block state does not match world state");

    ok(service.call<wire::WsdbUpdateArchiveResponse>(
        "WsdbUpdateArchive",
        wire::WsdbUpdateArchive{
            .blockStateRef = state.state, .blockHeaderHash = bytes_of<wire::BlockHeaderHash>(fr(1)), .forkId = 0 },
        "WsdbUpdateArchiveResponse"));
    auto archive = ok(service.call<wire::WsdbGetTreeInfoResponse>(
        "WsdbGetTreeInfo",
        wire::WsdbGetTreeInfo{ .treeId = 4, .revision = LATEST_UNCOMMITTED },
        "WsdbGetTreeInfoResponse"));
    EXPECT_EQ(archive.size, 2);
}

// wasm does not find main() in gtest_main (see ecc_tests' secp256r1.test.cpp).
#ifdef __wasm__
GTEST_API_ int main(int argc, char** argv)
{
    testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
#endif
