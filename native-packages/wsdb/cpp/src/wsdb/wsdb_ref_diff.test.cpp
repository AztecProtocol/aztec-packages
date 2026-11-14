/**
 * @file wsdb_ref_diff.test.cpp
 * @brief aztec-wsdb against wsdb-ref, barretenberg's reference world state.
 *
 * Both serve wsdb_schema.jsonc, so the generated client, WsdbApi, talks to either: `ref` over wsdb-ref's FFI entry,
 * linked in from barretenberg's static library, and `labs` over an aztec-wsdb WsdbService in this process. Each test
 * sends both the same Init and then the same requests, through `same(...)`, which expects equal answers, or through
 * `both_fail(...)`, which expects both to refuse the request.
 */
// The world state before the generated wire types: both declare MerkleTreeId, and the wire one must not be found
// first while the world state headers are parsed.
#include "wsdb/wsdb_service.hpp"

#include "common/aztec_constants.hpp"
#include "field/field_element.hpp"
#include "merkle_tree/merkle_tree_id.hpp"
#include "world_state/test_genesis.hpp"
#include "wsdb/generated/ipc_codegen/msgpack_adaptor.hpp"
#include "wsdb/generated/wsdb_client.hpp"
#include "wsdb/generated/wsdb_types.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <filesystem>
#include <memory>
#include <optional>
#include <span>
#include <sstream>
#include <string>
#include <tuple>
#include <type_traits>
#include <unistd.h>
#include <vector>

// wsdb-ref's FFI entry, in barretenberg's static library.
extern "C" {
void wsdb_ref_ipc_ffi_entry(const uint8_t* input, size_t input_len, uint8_t** output, size_t* output_len);
void wsdb_ref_ipc_ffi_free(void* ptr);
}

using namespace azteclabs::wsdb;

namespace {

class WsdbRefBackend {
  public:
    std::vector<uint8_t> call(std::span<const uint8_t> request)
    {
        uint8_t* out = nullptr;
        size_t out_len = 0;
        wsdb_ref_ipc_ffi_entry(request.data(), request.size(), &out, &out_len);
        std::vector<uint8_t> response(out, out + out_len);
        wsdb_ref_ipc_ffi_free(out);
        return response;
    }
};

class WsdbServiceBackend {
  public:
    explicit WsdbServiceBackend(WsdbService* service)
        : service_(service)
    {}
    std::vector<uint8_t> call(std::span<const uint8_t> request) { return service_->call(request); }

  private:
    WsdbService* service_;
};

using RefApi = WsdbApi<WsdbRefBackend>;
using LabsApi = WsdbApi<WsdbServiceBackend>;

namespace tree {
constexpr uint32_t NULLIFIER = 0;
constexpr uint32_t NOTE_HASH = 1;
constexpr uint32_t PUBLIC_DATA = 2;
constexpr uint32_t L1_TO_L2_MESSAGE = 3;
constexpr uint32_t ARCHIVE = 4;
constexpr uint32_t ALL[] = { NULLIFIER, NOTE_HASH, PUBLIC_DATA, L1_TO_L2_MESSAGE, ARCHIVE };
} // namespace tree

template <typename W = wire::Fr> W field(uint64_t value)
{
    W w{};
    fr::serialize_to_buffer(fr(value), w.data());
    return w;
}

wire::NullifierLeafValue nullifier(uint64_t value)
{
    return { .nullifier = field<wire::Nullifier>(value) };
}

wire::PublicDataLeafValue public_data(uint64_t slot, uint64_t value)
{
    return { .slot = field<wire::PublicDataSlot>(slot), .value = field<wire::PublicDataValue>(value) };
}

wire::WorldStateRevision committed(uint64_t fork = 0)
{
    return { .forkId = fork, .blockNumber = merkle_tree::LATEST_BLOCK, .includeUncommitted = false };
}

wire::WorldStateRevision uncommitted(uint64_t fork = 0)
{
    return { .forkId = fork, .blockNumber = merkle_tree::LATEST_BLOCK, .includeUncommitted = true };
}

wire::WorldStateRevision at_block(uint32_t block)
{
    return { .forkId = 0, .blockNumber = block, .includeUncommitted = false };
}

/** A message or response as msgpack text, for failure messages. */
template <typename T> std::string dump(const T& value)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack(value);
    auto unpacked = msgpack::unpack(buf.data(), buf.size());
    std::ostringstream out;
    out << unpacked.get();
    std::string text = out.str();
    return text.size() > 1500 ? text.substr(0, 1500) + "..." : text;
}

/** A genesis with the protocol's tree heights and prefill, the test nullifiers and public-data slot 1000 = 7. */
wire::WsdbInit genesis()
{
    wire::WsdbInit init{ .treeHeights = { { .treeId = tree::NULLIFIER, .height = NULLIFIER_TREE_HEIGHT },
                                          { .treeId = tree::NOTE_HASH, .height = NOTE_HASH_TREE_HEIGHT },
                                          { .treeId = tree::PUBLIC_DATA, .height = PUBLIC_DATA_TREE_HEIGHT },
                                          { .treeId = tree::L1_TO_L2_MESSAGE, .height = L1_TO_L2_MSG_TREE_HEIGHT },
                                          { .treeId = tree::ARCHIVE, .height = ARCHIVE_HEIGHT } },
                         .treePrefill = { { .treeId = tree::NULLIFIER, .size = 128 },
                                          { .treeId = tree::PUBLIC_DATA, .size = 128 } },
                         .prefilledPublicData = { public_data(1000, 7) },
                         .prefilledNullifiers = {},
                         .genesisTimestamp = 0,
                         .initialHeaderGeneratorPoint = static_cast<uint32_t>(DOM_SEP__BLOCK_HEADER_HASH) };
    for (const auto& value : world_state::test_genesis_nullifiers()) {
        wire::Fr w{};
        fr::serialize_to_buffer(value, w.data());
        init.prefilledNullifiers.push_back(w);
    }
    return init;
}

/** What a block adds to the trees. */
struct BlockEffects {
    std::vector<wire::Fr> note_hashes;
    std::vector<wire::Fr> messages;
    std::vector<wire::NullifierLeafValue> nullifiers; // 8, the last two zero, as a batch of 2^3
    std::vector<wire::PublicDataLeafValue> public_data_writes;
};

/** Block `n`'s effects: values no other block uses, and a write to slot 1000 and to a new slot. */
BlockEffects block_effects(uint64_t n)
{
    BlockEffects effects;
    for (uint64_t i = 0; i < 8; ++i) {
        effects.note_hashes.push_back(field(i == 3 ? 0 : n * 1000 + i + 1));
        effects.nullifiers.push_back(nullifier(i >= 6 ? 0 : n * 1000000 + i + 1));
    }
    for (uint64_t i = 0; i < 4; ++i) {
        effects.messages.push_back(field(n * 100000 + i + 1));
    }
    effects.public_data_writes = { public_data(1000, n), public_data(2000 + n, 1) };
    return effects;
}

template <typename Api, typename Call> auto on(const std::string& who, Api& api, Call& call)
{
    try {
        return call(api);
    } catch (const std::exception& e) {
        throw std::runtime_error(who + " failed: " + e.what());
    }
}

// A node builds a state reference from an unordered map: the entries must match, in any order.
auto sorted(const std::vector<wire::TreeStateReference>& state)
{
    std::vector<std::tuple<uint32_t, wire::Fr, uint64_t>> out;
    for (const auto& t : state) {
        out.emplace_back(t.treeId, t.root, t.size);
    }
    std::sort(out.begin(), out.end(), [](const auto& a, const auto& b) { return std::get<0>(a) < std::get<0>(b); });
    return out;
}

// A full status carries LMDB store statistics, which only aztec-wsdb has; its summary and tree metas must match.
auto meta(const wire::WorldStateStatusFull& status)
{
    auto tree_meta = [](const wire::TreeMeta& m) {
        return std::make_tuple(m.depth,
                               m.size,
                               m.committedSize,
                               m.root,
                               m.initialSize,
                               m.initialRoot,
                               m.oldestHistoricBlock,
                               m.unfinalizedBlockHeight,
                               m.finalizedBlockHeight);
    };
    return std::make_tuple(status.summary,
                           tree_meta(status.meta.nullifierTreeMeta),
                           tree_meta(status.meta.noteHashTreeMeta),
                           tree_meta(status.meta.publicDataTreeMeta),
                           tree_meta(status.meta.messageTreeMeta),
                           tree_meta(status.meta.archiveTreeMeta));
}

template <typename T> void expect_equal(const T& ref, const T& labs)
{
    bool equal = false;
    if constexpr (requires { ref.status.meta; }) {
        equal = meta(ref.status) == meta(labs.status);
    } else if constexpr (requires { ref.state; }) {
        equal = sorted(ref.state) == sorted(labs.state);
    } else {
        equal = ref == labs;
    }
    EXPECT_TRUE(equal) << "answers differ\n  wsdb-ref:   " << dump(ref) << "\n  aztec-wsdb: " << dump(labs);
}

class WsdbRefDiffTest : public ::testing::Test {
  protected:
    /**
     * Calls `call(api)` with each client. Both must succeed and, for a request with an answer, answer the same.
     * Returns wsdb-ref's answer.
     */
    template <typename Call> auto same(Call call)
    {
        using Result = decltype(call(ref_));
        if constexpr (std::is_void_v<Result>) {
            on("wsdb-ref", ref_, call);
            on("aztec-wsdb", *labs_, call);
        } else {
            Result ref = on("wsdb-ref", ref_, call);
            Result labs = on("aztec-wsdb", *labs_, call);
            expect_equal(ref, labs);
            return ref;
        }
    }

    /** Calls `call(api)` with each client; both must refuse it. */
    template <typename Call> void both_fail(Call call)
    {
        auto fails = [&](auto& api) {
            try {
                call(api);
                return false;
            } catch (const std::exception&) {
                return true;
            }
        };
        EXPECT_TRUE(fails(ref_)) << "wsdb-ref accepted a request it should refuse";
        EXPECT_TRUE(fails(*labs_)) << "aztec-wsdb accepted a request it should refuse";
    }

    /** Every tree's info and the state reference, at `revision`. */
    void expect_same_trees(const wire::WorldStateRevision& revision)
    {
        for (uint32_t id : tree::ALL) {
            same([&](auto& api) { return api.get_tree_info({ .treeId = id, .revision = revision }); });
        }
        same([&](auto& api) { return api.get_state_reference({ .revision = revision }); });
    }

    /**
     * Builds block `n` as a node does: its effects on a fork at the tip, the archive updated with its header, and the
     * fork's resulting state and archive roots put in the SyncBlock the canonical fork is then sent.
     */
    wire::WsdbSyncBlock prepare_block(uint32_t n)
    {
        BlockEffects effects = block_effects(n);
        uint64_t fork = same([](auto& api) { return api.create_fork({ .latest = true, .blockNumber = 0 }); }).forkId;
        same([&](auto& api) {
            api.append_leaves({ .treeId = tree::NOTE_HASH, .leaves = effects.note_hashes, .forkId = fork });
        });
        same([&](auto& api) {
            api.append_leaves({ .treeId = tree::L1_TO_L2_MESSAGE, .leaves = effects.messages, .forkId = fork });
        });
        same([&](auto& api) {
            return api.batch_insert_nullifier({ .leaves = effects.nullifiers, .subtreeDepth = 3, .forkId = fork });
        });
        same([&](auto& api) {
            return api.sequential_insert_public_data({ .leaves = effects.public_data_writes, .forkId = fork });
        });
        auto state = same([&](auto& api) { return api.get_state_reference({ .revision = uncommitted(fork) }); }).state;
        auto header_hash = field<wire::BlockHeaderHash>(n * 7919);
        same([&](auto& api) {
            api.update_archive({ .blockStateRef = state, .blockHeaderHash = header_hash, .forkId = fork });
        });
        auto archive = same(
            [&](auto& api) { return api.get_tree_info({ .treeId = tree::ARCHIVE, .revision = uncommitted(fork) }); });
        auto previous =
            same([&](auto& api) { return api.get_tree_info({ .treeId = tree::ARCHIVE, .revision = committed() }); });
        same([&](auto& api) { api.delete_fork({ .forkId = fork }); });
        return { .blockNumber = n,
                 .blockStateRef = state,
                 .blockHeaderHash = header_hash,
                 .paddedNoteHashes = effects.note_hashes,
                 .paddedL1ToL2Messages = effects.messages,
                 .paddedNullifiers = effects.nullifiers,
                 .publicDataWrites = effects.public_data_writes,
                 .expectedArchiveRoot = archive.root,
                 .expectedPreviousArchiveRoot = previous.root };
    }

    /** Builds and syncs blocks 1..count. */
    void build_blocks(uint32_t count)
    {
        for (uint32_t n = 1; n <= count; ++n) {
            auto block = prepare_block(n);
            same([&](auto& api) { return api.sync_block(block); });
        }
    }

    void SetUp() override
    {
        dir_ =
            std::filesystem::temp_directory_path() / ("wsdb-ref-diff-" + std::to_string(getpid()) + "-" +
                                                      ::testing::UnitTest::GetInstance()->current_test_info()->name());
        std::filesystem::remove_all(dir_);
        std::filesystem::create_directories(dir_);
        service_ = std::make_unique<WsdbService>(WsdbConfig{ .data_dir = dir_.string(), .threads = 4 },
                                                 []() { return false; });
        labs_ = std::make_unique<LabsApi>(WsdbServiceBackend(service_.get()));
        // wsdb-ref is one per process; Init restarts it, so every test starts from this genesis.
        same([](auto& api) { api.init(genesis()); });
    }

    void TearDown() override
    {
        labs_.reset();
        service_.reset();
        std::filesystem::remove_all(dir_);
    }

  private:
    std::filesystem::path dir_;
    std::unique_ptr<WsdbService> service_;
    RefApi ref_;
    std::unique_ptr<LabsApi> labs_;
};

} // namespace

TEST_F(WsdbRefDiffTest, Genesis)
{
    same([](auto& api) { return api.get_initial_state_reference(); });
    same([](auto& api) { return api.get_status(); });
    expect_same_trees(committed());
    expect_same_trees(at_block(0));
    for (uint64_t index : { 0, 1, 127 }) {
        same([&](auto& api) {
            return api.get_nullifier_leaf_preimage({ .revision = committed(), .leafIndex = index });
        });
        same([&](auto& api) {
            return api.get_public_data_leaf_preimage({ .revision = committed(), .leafIndex = index });
        });
    }
    // An index past a tree's end.
    for (uint32_t id : { tree::NULLIFIER, tree::PUBLIC_DATA }) {
        uint64_t end =
            same([&](auto& api) { return api.get_tree_info({ .treeId = id, .revision = committed() }); }).size;
        both_fail([&](auto& api) {
            if (id == tree::NULLIFIER) {
                api.get_nullifier_leaf_preimage({ .revision = committed(), .leafIndex = end });
            } else {
                api.get_public_data_leaf_preimage({ .revision = committed(), .leafIndex = end });
            }
        });
    }
    for (uint32_t id : tree::ALL) {
        same(
            [&](auto& api) { return api.get_sibling_path({ .treeId = id, .revision = committed(), .leafIndex = 0 }); });
    }
    same([](auto& api) {
        return api.find_low_leaf({ .treeId = tree::PUBLIC_DATA, .revision = committed(), .key = field(1000) });
    });
    same([](auto& api) {
        return api.find_low_leaf({ .treeId = tree::NULLIFIER, .revision = committed(), .key = field(5000) });
    });
}

TEST_F(WsdbRefDiffTest, AppendedLeaves)
{
    std::vector<wire::Fr> note_hashes = { field(11), field(12), field(0), field(14) };
    same([&](auto& api) { api.append_leaves({ .treeId = tree::NOTE_HASH, .leaves = note_hashes, .forkId = 0 }); });
    same([](auto& api) {
        api.append_leaves({ .treeId = tree::L1_TO_L2_MESSAGE, .leaves = { field(21), field(22) }, .forkId = 0 });
    });

    // Visible uncommitted, not yet committed.
    expect_same_trees(uncommitted());
    expect_same_trees(committed());
    for (uint64_t index : { 0, 2, 3, 4 }) {
        same([&](auto& api) {
            return api.get_leaf_value({ .treeId = tree::NOTE_HASH, .revision = uncommitted(), .leafIndex = index });
        });
    }
    same([](auto& api) {
        return api.find_leaf_indices({ .treeId = tree::NOTE_HASH,
                                       .revision = uncommitted(),
                                       .leaves = { field(12), field(99) },
                                       .startIndex = 0 });
    });
    same([](auto& api) {
        return api.find_sibling_paths(
            { .treeId = tree::NOTE_HASH, .revision = uncommitted(), .leaves = { field(14), field(99) } });
    });

    same([](auto& api) { return api.commit(); });
    expect_same_trees(committed());

    same([](auto& api) { api.append_leaves({ .treeId = tree::NOTE_HASH, .leaves = { field(31) }, .forkId = 0 }); });
    same([](auto& api) { api.rollback(); });
    expect_same_trees(uncommitted());
}

TEST_F(WsdbRefDiffTest, NullifierInsertions)
{
    uint64_t fork = same([](auto& api) { return api.create_fork({ .latest = true, .blockNumber = 0 }); }).forkId;

    same([&](auto& api) {
        return api.batch_insert_nullifier({ .leaves = { nullifier(5000), nullifier(3000), nullifier(0), nullifier(0) },
                                            .subtreeDepth = 2,
                                            .forkId = fork });
    });
    same([&](auto& api) {
        return api.sequential_insert_nullifier(
            { .leaves = { nullifier(4000), nullifier(0), nullifier(6000) }, .forkId = fork });
    });
    same([&](auto& api) { api.append_nullifier_leaves({ .leaves = { nullifier(7000) }, .forkId = fork }); });
    expect_same_trees(uncommitted(fork));

    same([&](auto& api) {
        return api.find_nullifier_leaf_indices({ .revision = uncommitted(fork),
                                                 .leaves = { nullifier(3000), nullifier(4000), nullifier(4500) },
                                                 .startIndex = 0 });
    });
    for (uint64_t key : { 3000, 4500, 9000 }) {
        same([&](auto& api) {
            return api.find_low_leaf({ .treeId = tree::NULLIFIER, .revision = uncommitted(fork), .key = field(key) });
        });
    }
    for (uint64_t index : { 127, 128, 131, 133 }) {
        same([&](auto& api) {
            return api.get_nullifier_leaf_preimage({ .revision = uncommitted(fork), .leafIndex = index });
        });
    }
    same([&](auto& api) {
        return api.find_nullifier_sibling_paths(
            { .revision = uncommitted(fork), .leaves = { nullifier(5000), nullifier(1) } });
    });

    // A nullifier already in the tree.
    both_fail([&](auto& api) { api.sequential_insert_nullifier({ .leaves = { nullifier(5000) }, .forkId = fork }); });
    both_fail([&](auto& api) {
        api.batch_insert_nullifier(
            { .leaves = { nullifier(8000), nullifier(3000) }, .subtreeDepth = 1, .forkId = fork });
    });
    expect_same_trees(uncommitted(fork));
}

TEST_F(WsdbRefDiffTest, PublicDataInsertions)
{
    uint64_t fork = same([](auto& api) { return api.create_fork({ .latest = true, .blockNumber = 0 }); }).forkId;

    same([&](auto& api) {
        return api.batch_insert_public_data(
            { .leaves = { public_data(3000, 1), public_data(1000, 8), public_data(0, 0), public_data(2500, 2) },
              .subtreeDepth = 2,
              .forkId = fork });
    });
    // Updates slot 1000 again and writes a new slot.
    same([&](auto& api) {
        return api.sequential_insert_public_data(
            { .leaves = { public_data(1000, 9), public_data(4000, 3) }, .forkId = fork });
    });
    same([&](auto& api) { api.append_public_data_leaves({ .leaves = { public_data(5000, 4) }, .forkId = fork }); });
    expect_same_trees(uncommitted(fork));

    same([&](auto& api) {
        return api.find_public_data_leaf_indices({ .revision = uncommitted(fork),
                                                   .leaves = { public_data(1000, 9), public_data(1000, 7) },
                                                   .startIndex = 0 });
    });
    for (uint64_t key : { 1000, 2700, 6000 }) {
        same([&](auto& api) {
            return api.find_low_leaf({ .treeId = tree::PUBLIC_DATA, .revision = uncommitted(fork), .key = field(key) });
        });
    }
    for (uint64_t index : { 0, 127, 128, 131, 133 }) {
        same([&](auto& api) {
            return api.get_public_data_leaf_preimage({ .revision = uncommitted(fork), .leafIndex = index });
        });
        same([&](auto& api) {
            return api.get_public_data_leaf_value({ .revision = uncommitted(fork), .leafIndex = index });
        });
    }
    same([&](auto& api) {
        return api.find_public_data_sibling_paths(
            { .revision = uncommitted(fork), .leaves = { public_data(3000, 1) } });
    });

    // A batch writing one slot twice.
    both_fail([&](auto& api) {
        api.batch_insert_public_data(
            { .leaves = { public_data(6000, 1), public_data(6000, 2) }, .subtreeDepth = 1, .forkId = fork });
    });
}

TEST_F(WsdbRefDiffTest, BlocksSyncedLikeANode)
{
    build_blocks(3);

    same([](auto& api) { return api.get_status(); });
    for (uint32_t block = 0; block <= 3; ++block) {
        expect_same_trees(at_block(block));
        same([&](auto& api) {
            return api.find_leaf_indices({ .treeId = tree::NOTE_HASH,
                                           .revision = at_block(block),
                                           .leaves = { field(1001), field(2001), field(3001) },
                                           .startIndex = 0 });
        });
    }
    for (uint32_t id : tree::ALL) {
        same([&](auto& api) {
            return api.get_block_numbers_for_leaf_indices(
                { .treeId = id, .revision = committed(), .leafIndices = { 0, 5, 9, 17, 200 } });
        });
    }
    same([](auto& api) { return api.get_public_data_leaf_value({ .revision = at_block(2), .leafIndex = 128 }); });
}

TEST_F(WsdbRefDiffTest, SyncBlockRefusesAWrongBlock)
{
    build_blocks(1);
    auto block = prepare_block(2);

    auto wrong_state = block;
    wrong_state.blockStateRef[0].size += 1;
    both_fail([&](auto& api) { api.sync_block(wrong_state); });

    auto wrong_archive = block;
    wrong_archive.expectedArchiveRoot = field(1);
    both_fail([&](auto& api) { api.sync_block(wrong_archive); });

    same([](auto& api) { return api.get_status(); });
    expect_same_trees(committed());

    same([&](auto& api) { return api.sync_block(block); });
}

TEST_F(WsdbRefDiffTest, Checkpoints)
{
    uint64_t fork = same([](auto& api) { return api.create_fork({ .latest = true, .blockNumber = 0 }); }).forkId;
    auto append = [&](uint64_t value) {
        same([&](auto& api) {
            api.append_leaves({ .treeId = tree::NOTE_HASH, .leaves = { field(value) }, .forkId = fork });
        });
        same([&](auto& api) {
            return api.sequential_insert_nullifier({ .leaves = { nullifier(value) }, .forkId = fork });
        });
    };

    same([&](auto& api) { api.create_checkpoint({ .forkId = fork }); });
    append(5001);
    same([&](auto& api) { api.create_checkpoint({ .forkId = fork }); });
    append(5002);
    same([&](auto& api) { api.revert_checkpoint({ .forkId = fork }); });
    expect_same_trees(uncommitted(fork));
    same([&](auto& api) { api.commit_checkpoint({ .forkId = fork }); });
    expect_same_trees(uncommitted(fork));

    same([&](auto& api) { api.create_checkpoint({ .forkId = fork }); });
    append(5003);
    same([&](auto& api) { api.create_checkpoint({ .forkId = fork }); });
    append(5004);
    same([&](auto& api) { api.revert_all_checkpoints({ .forkId = fork }); });
    expect_same_trees(uncommitted(fork));

    same([&](auto& api) { api.create_checkpoint({ .forkId = fork }); });
    append(5005);
    same([&](auto& api) { api.create_checkpoint({ .forkId = fork }); });
    append(5006);
    same([&](auto& api) { api.commit_all_checkpoints({ .forkId = fork }); });
    expect_same_trees(uncommitted(fork));

    both_fail([&](auto& api) { api.revert_checkpoint({ .forkId = fork }); });
    both_fail([&](auto& api) { api.commit_checkpoint({ .forkId = fork }); });
}

TEST_F(WsdbRefDiffTest, Forks)
{
    build_blocks(2);
    uint64_t at_tip = same([](auto& api) { return api.create_fork({ .latest = true, .blockNumber = 0 }); }).forkId;
    uint64_t at_one = same([](auto& api) { return api.create_fork({ .latest = false, .blockNumber = 1 }); }).forkId;
    expect_same_trees(uncommitted(at_tip));
    expect_same_trees(uncommitted(at_one));

    same([&](auto& api) {
        api.append_leaves({ .treeId = tree::NOTE_HASH, .leaves = { field(77) }, .forkId = at_one });
    });
    same([&](auto& api) {
        return api.sequential_insert_public_data({ .leaves = { public_data(1000, 77) }, .forkId = at_one });
    });
    expect_same_trees(uncommitted(at_one));
    // A fork's writes stay on it.
    expect_same_trees(uncommitted(at_tip));
    expect_same_trees(uncommitted());

    same([&](auto& api) { api.delete_fork({ .forkId = at_one }); });
    both_fail([&](auto& api) { api.get_tree_info({ .treeId = tree::NOTE_HASH, .revision = uncommitted(at_one) }); });
    both_fail([](auto& api) { api.get_tree_info({ .treeId = tree::NOTE_HASH, .revision = uncommitted(99) }); });
    both_fail([](auto& api) { api.create_fork({ .latest = false, .blockNumber = 5 }); });
}

TEST_F(WsdbRefDiffTest, UnwindFinalizeAndRemoveHistory)
{
    build_blocks(4);

    same([](auto& api) { return api.finalize_blocks({ .toBlockNumber = 2 }); });
    // Unwinds block 4: block 3 is the tip again.
    same([](auto& api) { return api.unwind_blocks({ .toBlockNumber = 3 }); });
    expect_same_trees(committed());
    both_fail([](auto& api) { api.get_tree_info({ .treeId = tree::NOTE_HASH, .revision = at_block(4) }); });

    // Drops block 1's history; block 2 is the oldest left, and genesis stays readable.
    same([](auto& api) { return api.remove_historical_blocks({ .toBlockNumber = 2 }); });
    same([](auto& api) { return api.get_status(); });
    expect_same_trees(at_block(0));
    expect_same_trees(at_block(2));
    both_fail([](auto& api) { api.get_tree_info({ .treeId = tree::NOTE_HASH, .revision = at_block(1) }); });

    // The chain continues from the unwound tip.
    auto block = prepare_block(4);
    same([&](auto& api) { return api.sync_block(block); });
    expect_same_trees(committed());
}
