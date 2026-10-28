/**
 * @file wsdb_ref_native_diff.test.cpp
 * @brief wsdb-ref against the node world state (native-packages/wsdb's aztec-wsdb), request for request.
 *
 * Both serve wsdb_schema.jsonc, so one encoded request goes to both: wsdb-ref through its in-process FFI
 * entry, aztec-wsdb through its socket. A seeded random run builds blocks the way a node does (effects on a
 * fork, then SyncBlock), interleaved with reads at every revision, writes and checkpoints on forks, unwinds,
 * finalization and history removal. Every response must be byte-identical, apart from the store statistics a
 * full status carries; a request must fail on both or on neither.
 *
 * Opt-in: set WSDB_NATIVE_BIN to an aztec-wsdb binary built from the same schema. WSDB_DIFF_SEEDS (default 4)
 * and WSDB_DIFF_STEPS (default 400) size the run.
 */
#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/world_state_reference/genesis_protocol_nullifiers.hpp"
#include "barretenberg/wsdb_ref/generated/wsdb_ffi.hpp"
#include "barretenberg/wsdb_ref/wsdb_ref_handlers.hpp"
#include "ipc_runtime/ipc_client.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <random>
#include <signal.h>
#include <spawn.h>
#include <sstream>
#include <string>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>
#include <vector>

extern char** environ;

using namespace bb;
using namespace bb::wsdb_ref;

namespace {

constexpr uint32_t LATEST = std::numeric_limits<uint32_t>::max();

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

std::vector<uint8_t> encode_request(const std::string& name, const auto& cmd)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(name);
    pk.pack(cmd);
    return { buf.data(), buf.data() + buf.size() };
}

/** A response frame: its tag, and the payload decoded when it is not an error. */
struct Frame {
    std::vector<uint8_t> bytes;
    std::string tag;
    std::string error;
    bool is_error() const { return tag == "WsdbErrorResponse"; }
};

Frame parse(std::vector<uint8_t> bytes)
{
    Frame frame{ .bytes = std::move(bytes), .tag = {}, .error = {} };
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(frame.bytes.data()), frame.bytes.size());
    auto obj = unpacked.get();
    frame.tag.assign(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
    if (frame.is_error()) {
        wire::WsdbErrorResponse error;
        obj.via.array.ptr[1].convert(error);
        frame.error = error.message;
    }
    return frame;
}

template <typename Resp> Resp decode(const Frame& frame)
{
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(frame.bytes.data()), frame.bytes.size());
    Resp resp;
    unpacked.get().via.array.ptr[1].convert(resp);
    return resp;
}

/** aztec-wsdb in a child process, at the same genesis wsdb-ref is given. */
class NativeWsdb {
  public:
    NativeWsdb(const std::string& binary, const std::filesystem::path& dir)
        : socket_path_((dir / "wsdb.sock").string())
    {
        std::filesystem::create_directories(dir / "data");
        std::ostringstream nullifiers;
        nullifiers << "[";
        auto seeds = world_state::genesis_protocol_nullifiers();
        for (size_t i = 0; i < seeds.size(); ++i) {
            std::ostringstream hex;
            hex << seeds[i];
            nullifiers << (i > 0 ? "," : "") << "\"" << hex.str().substr(2) << "\"";
        }
        nullifiers << "]";
        std::ostringstream heights;
        heights << "{0:" << NULLIFIER_TREE_HEIGHT << ",1:" << NOTE_HASH_TREE_HEIGHT << ",2:" << PUBLIC_DATA_TREE_HEIGHT
                << ",3:" << L1_TO_L2_MSG_TREE_HEIGHT << ",4:" << ARCHIVE_HEIGHT << "}";
        std::vector<std::string> args{
            binary,
            "msgpack",
            "run",
            "-i",
            socket_path_,
            "-d",
            (dir / "data").string(),
            "-t",
            "4",
            "--tree-heights",
            heights.str(),
            "--tree-prefill",
            "{0:128,2:128}",
            "--initial-header-generator-point",
            std::to_string(DOM_SEP__BLOCK_HEADER_HASH),
            "--prefilled-public-data",
            R"([["00000000000000000000000000000000000000000000000000000000000003e8","0000000000000000000000000000000000000000000000000000000000000007"]])",
            "--prefilled-nullifiers",
            nullifiers.str()
        };
        std::vector<char*> argv;
        for (auto& arg : args) {
            argv.push_back(arg.data());
        }
        argv.push_back(nullptr);
        if (posix_spawn(&pid_, binary.c_str(), nullptr, nullptr, argv.data(), environ) != 0) {
            throw std::runtime_error("failed to spawn " + binary);
        }
        client_ = ipc::IpcClient::create_socket(socket_path_);
        for (int attempt = 0; attempt < 200 && !client_->connect(); ++attempt) {
            std::this_thread::sleep_for(std::chrono::milliseconds(25));
        }
    }

    ~NativeWsdb()
    {
        client_->close();
        kill(pid_, SIGTERM);
        int status = 0;
        waitpid(pid_, &status, 0);
    }

    std::vector<uint8_t> call(const std::vector<uint8_t>& request)
    {
        if (!client_->send(request.data(), request.size(), 0)) {
            throw std::runtime_error("send to aztec-wsdb failed");
        }
        auto response = client_->receive(0);
        if (response.data() == nullptr) {
            throw std::runtime_error("receive from aztec-wsdb failed");
        }
        std::vector<uint8_t> out(response.begin(), response.end());
        client_->release(response.size());
        return out;
    }

  private:
    std::string socket_path_;
    pid_t pid_ = 0;
    std::unique_ptr<ipc::IpcClient> client_;
};

std::vector<uint8_t> call_ref(const std::vector<uint8_t>& request)
{
    uint8_t* output = nullptr;
    size_t output_len = 0;
    wsdb_ipc_ffi_entry(request.data(), request.size(), &output, &output_len);
    std::vector<uint8_t> frame(output, output + output_len);
    wsdb_ipc_ffi_free(output);
    return frame;
}

/** One differential run: a random but node-shaped workload, every request answered by both. */
class DiffRun {
  public:
    DiffRun(NativeWsdb& native, uint64_t seed)
        : native_(native)
        , rng_(seed)
    {}

    size_t requests = 0;
    size_t errors = 0;
    size_t failed_writes_reverted = 0;
    std::vector<std::string> message_mismatches;

    /** Sends `cmd` to both; returns the reference's frame. */
    template <typename Cmd> Frame both(const std::string& name, const Cmd& cmd)
    {
        auto request = encode_request(name, cmd);
        Frame ref = parse(call_ref(request));
        Frame nat = parse(native_.call(request));
        ++requests;
        if (std::getenv("WSDB_DIFF_TRACE") != nullptr) {
            std::cout << "step " << step_ << " " << dump_request(request).substr(0, 600)
                      << (ref.is_error()
                              ? " -> error: " + ref.error
                              : (name == "WsdbCreateFork" || name == "WsdbGetStatus" ? " -> " + dump(ref) : ""))
                      << "\n";
        }
        if (ref.is_error() != nat.is_error()) {
            ADD_FAILURE() << name << " step " << step_ << " " << dump_request(request) << ": wsdb-ref "
                          << (ref.is_error() ? "failed: " + ref.error : "succeeded") << ", aztec-wsdb "
                          << (nat.is_error() ? "failed: " + nat.error : "succeeded");
            return ref;
        }
        if (ref.is_error()) {
            ++errors;
            if (ref.error != nat.error) {
                message_mismatches.push_back(name + ": '" + ref.error + "' vs '" + nat.error + "'");
            }
            return ref;
        }
        if (has_full_status(name)) {
            compare_status(name, ref, nat);
        } else if (name == "WsdbGetStateReference" || name == "WsdbGetInitialStateReference") {
            // A node builds a state reference from an unordered map: the entries match, in any order.
            EXPECT_EQ(sorted_state(ref), sorted_state(nat)) << name << " step " << step_ << ": state references differ";
        } else if (ref.bytes != nat.bytes) {
            ADD_FAILURE() << name << " step " << step_ << ": responses differ\n  request:    " << dump_request(request)
                          << "\n  wsdb-ref:   " << dump(ref) << "\n  aztec-wsdb: " << dump(nat);
        }
        return ref;
    }

    void run(size_t steps)
    {
        init();
        for (step_ = 0; step_ < steps && !::testing::Test::HasFailure(); ++step_) {
            std::uniform_int_distribution<int> pick(0, 99);
            int choice = pick(rng_);
            if (choice < 12) {
                build_block();
            } else if (choice < 40) {
                read();
            } else if (choice < 65) {
                write_on_fork();
            } else if (choice < 72) {
                checkpoint_op();
            } else if (choice < 78) {
                fork_op();
            } else if (choice < 83) {
                canonical_op();
            } else if (choice < 90) {
                chain_op();
            } else {
                read();
            }
        }
    }

  private:
    NativeWsdb& native_;
    std::mt19937_64 rng_;
    size_t step_ = 0;
    std::vector<uint64_t> forks_{ 0 };
    std::vector<fr> known_keys_;
    std::vector<fr> known_note_hashes_;
    std::vector<fr> slots_;

    static std::string dump(const Frame& frame)
    {
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(frame.bytes.data()), frame.bytes.size());
        std::ostringstream out;
        out << unpacked.get();
        std::string text = out.str();
        return text.size() > 1500 ? text.substr(0, 1500) + "..." : text;
    }

    static std::string dump_request(const std::vector<uint8_t>& request)
    {
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(request.data()), request.size());
        std::ostringstream out;
        out << unpacked.get();
        std::string text = out.str();
        return text.size() > 1500 ? text.substr(0, 1500) + "..." : text;
    }

    static std::vector<std::tuple<uint32_t, fr, uint64_t>> sorted_state(const Frame& frame)
    {
        // Both responses carry `state` as their only field.
        auto state = decode<wire::WsdbGetStateReferenceResponse>(frame).state;
        std::vector<std::tuple<uint32_t, fr, uint64_t>> out;
        for (const auto& tree : state) {
            out.emplace_back(tree.treeId, fr_of(tree.root), tree.size);
        }
        std::sort(out.begin(), out.end(), [](const auto& a, const auto& b) { return std::get<0>(a) < std::get<0>(b); });
        return out;
    }

    static bool has_full_status(const std::string& name)
    {
        return name == "WsdbCommit" || name == "WsdbSyncBlock" || name == "WsdbUnwindBlocks" ||
               name == "WsdbRemoveHistoricalBlocks";
    }

    void compare_status(const std::string& name, const Frame& ref, const Frame& nat)
    {
        // Store statistics are a node's LMDB sizes; the summary and every tree's meta must match.
        auto summary = [](const wire::WorldStateStatusFull& s) {
            return std::make_tuple(s.summary.unfinalizedBlockNumber,
                                   s.summary.finalizedBlockNumber,
                                   s.summary.oldestHistoricalBlock,
                                   s.summary.treesAreSynched);
        };
        auto meta = [](const wire::TreeMeta& m) {
            return std::make_tuple(m.depth,
                                   m.size,
                                   m.committedSize,
                                   fr_of(m.root),
                                   m.initialSize,
                                   fr_of(m.initialRoot),
                                   m.oldestHistoricBlock,
                                   m.unfinalizedBlockHeight,
                                   m.finalizedBlockHeight);
        };
        auto statuses = [&]() -> std::pair<wire::WorldStateStatusFull, wire::WorldStateStatusFull> {
            if (name == "WsdbCommit") {
                return { decode<wire::WsdbCommitResponse>(ref).status, decode<wire::WsdbCommitResponse>(nat).status };
            }
            if (name == "WsdbSyncBlock") {
                return { decode<wire::WsdbSyncBlockResponse>(ref).status,
                         decode<wire::WsdbSyncBlockResponse>(nat).status };
            }
            if (name == "WsdbUnwindBlocks") {
                return { decode<wire::WsdbUnwindBlocksResponse>(ref).status,
                         decode<wire::WsdbUnwindBlocksResponse>(nat).status };
            }
            return { decode<wire::WsdbRemoveHistoricalBlocksResponse>(ref).status,
                     decode<wire::WsdbRemoveHistoricalBlocksResponse>(nat).status };
        }();
        const auto& [r, n] = statuses;
        EXPECT_EQ(summary(r), summary(n)) << name << " step " << step_ << ": status summaries differ";
        EXPECT_EQ(meta(r.meta.nullifierTreeMeta), meta(n.meta.nullifierTreeMeta)) << name << " nullifier meta";
        EXPECT_EQ(meta(r.meta.noteHashTreeMeta), meta(n.meta.noteHashTreeMeta)) << name << " note hash meta";
        EXPECT_EQ(meta(r.meta.publicDataTreeMeta), meta(n.meta.publicDataTreeMeta)) << name << " public data meta";
        EXPECT_EQ(meta(r.meta.messageTreeMeta), meta(n.meta.messageTreeMeta)) << name << " message meta";
        EXPECT_EQ(meta(r.meta.archiveTreeMeta), meta(n.meta.archiveTreeMeta)) << name << " archive meta";
    }

    uint64_t uniform(uint64_t lo, uint64_t hi) { return std::uniform_int_distribution<uint64_t>(lo, hi)(rng_); }
    bool coin(int percent) { return uniform(0, 99) < static_cast<uint64_t>(percent); }

    fr fresh_key()
    {
        fr key(uniform(1000, 1ULL << 62));
        known_keys_.push_back(key);
        return key;
    }
    fr some_key()
    {
        return known_keys_.empty() || coin(30) ? fresh_key() : known_keys_[uniform(0, known_keys_.size() - 1)];
    }
    fr some_slot()
    {
        if (slots_.empty() || coin(40)) {
            slots_.push_back(fr(uniform(129, 5000)));
        }
        return slots_[uniform(0, slots_.size() - 1)];
    }
    fr some_note_hash()
    {
        if (known_note_hashes_.empty() || coin(40)) {
            return fr(uniform(1, 1ULL << 62));
        }
        return known_note_hashes_[uniform(0, known_note_hashes_.size() - 1)];
    }
    uint64_t some_fork() { return forks_[uniform(0, forks_.size() - 1)]; }

    uint32_t latest_block()
    {
        auto status = decode<wire::WsdbGetStatusResponse>(both("WsdbGetStatus", wire::WsdbGetStatus{}));
        return static_cast<uint32_t>(status.status.unfinalizedBlockNumber);
    }

    wire::WorldStateRevision some_revision()
    {
        uint32_t latest = latest_block();
        if (coin(30)) {
            // Historical reads go to the canonical fork, as a node's clients send them. (Through another fork,
            // aztec-wsdb caps index searches at that fork's own block: a combination nothing sends.)
            return { .forkId = coin(10) ? 99ULL : 0ULL,
                     .blockNumber = static_cast<uint32_t>(uniform(0, latest + 1)),
                     .includeUncommitted = coin(60) };
        }
        return { .forkId = coin(10) ? 99 : some_fork(), .blockNumber = LATEST, .includeUncommitted = coin(60) };
    }

    void init()
    {
        // The genesis aztec-wsdb was started with: the protocol nullifiers and one public-data slot.
        wire::WsdbInitGenesis genesis{ .prefilledPublicData = { { .slot = bytes_of<wire::PublicDataSlot>(fr(1000)),
                                                                  .value = bytes_of<wire::PublicDataValue>(fr(7)) } },
                                       .prefilledNullifiers = {},
                                       .genesisTimestamp = 0,
                                       .initialHeaderGeneratorPoint =
                                           static_cast<uint32_t>(DOM_SEP__BLOCK_HEADER_HASH) };
        for (const auto& seed : world_state::genesis_protocol_nullifiers()) {
            genesis.prefilledNullifiers.push_back(bytes_of<wire::Fr>(seed));
        }
        auto request = encode_request("WsdbInitGenesis", genesis);
        ASSERT_FALSE(parse(call_ref(request)).is_error());
        slots_.push_back(fr(1000));
        both("WsdbGetInitialStateReference", wire::WsdbGetInitialStateReference{});
    }

    void read()
    {
        auto revision = some_revision();
        uint32_t tree = static_cast<uint32_t>(uniform(0, 4));
        switch (uniform(0, 11)) {
        case 0:
            both("WsdbGetTreeInfo", wire::WsdbGetTreeInfo{ .treeId = tree, .revision = revision });
            break;
        case 1:
            both("WsdbGetStateReference", wire::WsdbGetStateReference{ .revision = revision });
            break;
        case 2:
            both("WsdbGetLeafValue",
                 wire::WsdbGetLeafValue{
                     .treeId = coin(80) ? 1u : 4u, .revision = revision, .leafIndex = uniform(0, 300) });
            break;
        case 3:
            both("WsdbGetNullifierLeafPreimage",
                 wire::WsdbGetNullifierLeafPreimage{ .revision = revision, .leafIndex = uniform(0, 400) });
            both("WsdbGetNullifierLeafValue",
                 wire::WsdbGetNullifierLeafValue{ .revision = revision, .leafIndex = uniform(0, 400) });
            break;
        case 4:
            both("WsdbGetPublicDataLeafPreimage",
                 wire::WsdbGetPublicDataLeafPreimage{ .revision = revision, .leafIndex = uniform(0, 300) });
            both("WsdbGetPublicDataLeafValue",
                 wire::WsdbGetPublicDataLeafValue{ .revision = revision, .leafIndex = uniform(0, 300) });
            break;
        case 5:
            both("WsdbGetSiblingPath",
                 wire::WsdbGetSiblingPath{ .treeId = tree, .revision = revision, .leafIndex = uniform(0, 400) });
            break;
        case 6:
            both("WsdbFindLeafIndices",
                 wire::WsdbFindLeafIndices{
                     .treeId = 1,
                     .revision = revision,
                     .leaves = { bytes_of<wire::Fr>(some_note_hash()), bytes_of<wire::Fr>(some_note_hash()) },
                     .startIndex = uniform(0, 20) });
            break;
        case 7:
            both("WsdbFindNullifierLeafIndices",
                 wire::WsdbFindNullifierLeafIndices{
                     .revision = revision,
                     .leaves = { { .nullifier = bytes_of<wire::Nullifier>(some_key()) },
                                 { .nullifier = bytes_of<wire::Nullifier>(fr(uniform(1, 127))) } },
                     .startIndex = uniform(0, 140) });
            both("WsdbFindPublicDataLeafIndices",
                 wire::WsdbFindPublicDataLeafIndices{
                     .revision = revision,
                     .leaves = { { .slot = bytes_of<wire::PublicDataSlot>(some_slot()),
                                   .value = bytes_of<wire::PublicDataValue>(fr(uniform(0, 3))) } },
                     .startIndex = 0 });
            break;
        case 8:
            both("WsdbFindLowLeaf",
                 wire::WsdbFindLowLeaf{ .treeId = coin(50) ? 0u : 2u,
                                        .revision = revision,
                                        .key = bytes_of<wire::Fr>(coin(50) ? some_key() : some_slot()) });
            break;
        case 9:
            both("WsdbFindSiblingPaths",
                 wire::WsdbFindSiblingPaths{
                     .treeId = 1, .revision = revision, .leaves = { bytes_of<wire::Fr>(some_note_hash()) } });
            both("WsdbFindNullifierSiblingPaths",
                 wire::WsdbFindNullifierSiblingPaths{
                     .revision = revision, .leaves = { { .nullifier = bytes_of<wire::Nullifier>(some_key()) } } });
            both("WsdbFindPublicDataSiblingPaths",
                 wire::WsdbFindPublicDataSiblingPaths{
                     .revision = revision,
                     .leaves = { { .slot = bytes_of<wire::PublicDataSlot>(some_slot()),
                                   .value = bytes_of<wire::PublicDataValue>(fr(0)) } } });
            break;
        case 10:
            both("WsdbGetBlockNumbersForLeafIndices",
                 wire::WsdbGetBlockNumbersForLeafIndices{
                     .treeId = tree, .revision = revision, .leafIndices = { 0, uniform(0, 140), uniform(0, 400) } });
            break;
        default:
            both("WsdbGetStatus", wire::WsdbGetStatus{});
            both("WsdbGetInitialStateReference", wire::WsdbGetInitialStateReference{});
        }
    }

    /** Nullifiers, some zero; with `fresh_only`, none already inserted or repeated (so the insertion succeeds). */
    std::vector<wire::NullifierLeafValue> some_nullifiers(size_t count, bool allow_zero, bool fresh_only)
    {
        std::vector<wire::NullifierLeafValue> out;
        for (size_t i = 0; i < count; ++i) {
            fr key = allow_zero && coin(20) ? fr(0) : (fresh_only || coin(90) ? fresh_key() : some_key());
            out.push_back({ .nullifier = bytes_of<wire::Nullifier>(key) });
        }
        return out;
    }

    /** Public-data writes to distinct slots (a batch rejects a repeated slot). */
    std::vector<wire::PublicDataLeafValue> distinct_public_data(size_t count)
    {
        std::vector<wire::PublicDataLeafValue> out;
        std::vector<fr> used;
        while (out.size() < count) {
            fr slot = some_slot();
            if (std::find(used.begin(), used.end(), slot) != used.end()) {
                continue;
            }
            used.push_back(slot);
            out.push_back({ .slot = bytes_of<wire::PublicDataSlot>(slot),
                            .value = bytes_of<wire::PublicDataValue>(fr(uniform(1, 1000))) });
        }
        return out;
    }

    std::vector<wire::PublicDataLeafValue> some_public_data(size_t count, bool allow_zero)
    {
        std::vector<wire::PublicDataLeafValue> out;
        for (size_t i = 0; i < count; ++i) {
            if (allow_zero && coin(15)) {
                out.push_back(
                    { .slot = bytes_of<wire::PublicDataSlot>(fr(0)), .value = bytes_of<wire::PublicDataValue>(fr(0)) });
                continue;
            }
            out.push_back({ .slot = bytes_of<wire::PublicDataSlot>(some_slot()),
                            .value = bytes_of<wire::PublicDataValue>(fr(uniform(1, 1000))) });
        }
        return out;
    }

    std::vector<wire::Fr> some_note_hashes(size_t count)
    {
        std::vector<wire::Fr> out;
        for (size_t i = 0; i < count; ++i) {
            fr value = coin(25) ? fr(0) : fr(uniform(1, 1ULL << 62));
            if (!value.is_zero()) {
                known_note_hashes_.push_back(value);
            }
            out.push_back(bytes_of<wire::Fr>(value));
        }
        return out;
    }

    /**
     * A fork other than the canonical one to write to, sometimes a new one. A failed write changes nothing on either
     * side, so the fork stays in use after one.
     */
    uint64_t other_fork()
    {
        std::vector<uint64_t> others(forks_.begin() + 1, forks_.end());
        if (others.empty() || coin(15)) {
            auto created = both("WsdbCreateFork", wire::WsdbCreateFork{ .latest = true, .blockNumber = 0 });
            forks_.push_back(decode<wire::WsdbCreateForkResponse>(created).forkId);
            return forks_.back();
        }
        return others[uniform(0, others.size() - 1)];
    }

    void write_on_fork()
    {
        uint64_t fork = coin(25) ? 0 : other_fork();
        if (fork == 0 && coin(50)) {
            // Writes that cannot fail, so the canonical fork keeps growing.
            both("WsdbAppendLeaves",
                 wire::WsdbAppendLeaves{
                     .treeId = coin(70) ? 1u : 3u, .leaves = some_note_hashes(uniform(0, 5)), .forkId = 0 });
            both("WsdbSequentialInsertNullifier",
                 wire::WsdbSequentialInsertNullifier{ .leaves = some_nullifiers(uniform(0, 3), true, true),
                                                      .forkId = 0 });
            both("WsdbBatchInsertPublicData",
                 wire::WsdbBatchInsertPublicData{ .leaves = distinct_public_data(4), .subtreeDepth = 2, .forkId = 0 });
            return;
        }
        // As the public processor does with each tx: a checkpoint around the write, reverted if the write fails.
        bool guarded = coin(50);
        if (guarded) {
            both("WsdbCreateCheckpoint", wire::WsdbCreateCheckpoint{ .forkId = fork });
        }
        Frame result;
        switch (uniform(0, 6)) {
        case 0:
            both("WsdbAppendLeaves",
                 wire::WsdbAppendLeaves{
                     .treeId = coin(70) ? 1u : 3u, .leaves = some_note_hashes(uniform(0, 5)), .forkId = fork });
            break;
        case 1:
            result = both("WsdbSequentialInsertNullifier",
                          wire::WsdbSequentialInsertNullifier{ .leaves = some_nullifiers(uniform(0, 4), true, false),
                                                               .forkId = fork });
            break;
        case 2:
            result = both("WsdbSequentialInsertPublicData",
                          wire::WsdbSequentialInsertPublicData{ .leaves = some_public_data(uniform(0, 4), true),
                                                                .forkId = fork });
            break;
        case 3:
            result = both("WsdbBatchInsertNullifier",
                          wire::WsdbBatchInsertNullifier{ .leaves = some_nullifiers(4, true, false),
                                                          .subtreeDepth = static_cast<uint32_t>(uniform(0, 2)),
                                                          .forkId = fork });
            break;
        case 4:
            result = both("WsdbBatchInsertPublicData",
                          wire::WsdbBatchInsertPublicData{ .leaves = some_public_data(4, true),
                                                           .subtreeDepth = static_cast<uint32_t>(uniform(0, 2)),
                                                           .forkId = fork });
            break;
        case 5:
            result = both("WsdbAppendNullifierLeaves",
                          wire::WsdbAppendNullifierLeaves{ .leaves = some_nullifiers(uniform(1, 3), true, false),
                                                           .forkId = fork });
            if (result.is_error()) {
                break;
            }
            result = both(
                "WsdbAppendPublicDataLeaves",
                wire::WsdbAppendPublicDataLeaves{ .leaves = some_public_data(uniform(1, 3), true), .forkId = fork });
            break;
        default: {
            auto state = both("WsdbGetStateReference",
                              wire::WsdbGetStateReference{
                                  .revision = { .forkId = fork, .blockNumber = LATEST, .includeUncommitted = true } });
            if (state.is_error()) {
                break;
            }
            auto block_state = decode<wire::WsdbGetStateReferenceResponse>(state).state;
            if (coin(20)) {
                block_state = decode<wire::WsdbGetInitialStateReferenceResponse>(
                                  both("WsdbGetInitialStateReference", wire::WsdbGetInitialStateReference{}))
                                  .state;
            }
            both(
                "WsdbUpdateArchive",
                wire::WsdbUpdateArchive{ .blockStateRef = block_state,
                                         .blockHeaderHash = bytes_of<wire::BlockHeaderHash>(fr(uniform(1, 1ULL << 62))),
                                         .forkId = fork });
        }
        }
        if (guarded) {
            if (result.is_error()) {
                failed_writes_reverted++;
            }
            both(result.is_error() || coin(50) ? "WsdbRevertCheckpoint" : "WsdbCommitCheckpoint",
                 wire::WsdbRevertCheckpoint{ .forkId = fork });
        }
    }

    void checkpoint_op()
    {
        uint64_t fork = some_fork();
        switch (uniform(0, 4)) {
        case 0:
        case 1:
            both("WsdbCreateCheckpoint", wire::WsdbCreateCheckpoint{ .forkId = fork });
            break;
        case 2:
            both(coin(50) ? "WsdbCommitCheckpoint" : "WsdbRevertCheckpoint",
                 wire::WsdbCommitCheckpoint{ .forkId = fork });
            break;
        case 3:
            both("WsdbCommitAllCheckpoints", wire::WsdbCommitAllCheckpoints{ .forkId = fork });
            break;
        default:
            both("WsdbRevertAllCheckpoints", wire::WsdbRevertAllCheckpoints{ .forkId = fork });
        }
    }

    void fork_op()
    {
        if (coin(60) || forks_.size() < 2) {
            bool latest = coin(70);
            auto frame =
                both("WsdbCreateFork",
                     wire::WsdbCreateFork{ .latest = latest,
                                           .blockNumber = static_cast<uint32_t>(uniform(0, latest_block() + 1)) });
            if (!frame.is_error()) {
                forks_.push_back(decode<wire::WsdbCreateForkResponse>(frame).forkId);
            }
        } else {
            size_t at = uniform(0, forks_.size() - 1);
            both("WsdbDeleteFork", wire::WsdbDeleteFork{ .forkId = forks_[at] });
            if (forks_[at] != 0) {
                forks_.erase(forks_.begin() + static_cast<std::ptrdiff_t>(at));
            }
        }
    }

    void canonical_op()
    {
        // Direct writes to the canonical fork, then a commit or a rollback.
        both("WsdbAppendLeaves", wire::WsdbAppendLeaves{ .treeId = 1, .leaves = some_note_hashes(2), .forkId = 0 });
        both("WsdbSequentialInsertNullifier",
             wire::WsdbSequentialInsertNullifier{ .leaves = some_nullifiers(1, false, true), .forkId = 0 });
        if (coin(50)) {
            both("WsdbCommit", wire::WsdbCommit{});
        } else {
            both("WsdbRollback", wire::WsdbRollback{});
        }
    }

    void chain_op()
    {
        uint32_t latest = latest_block();
        switch (uniform(0, 2)) {
        case 0:
            both("WsdbFinalizeBlocks",
                 wire::WsdbFinalizeBlocks{ .toBlockNumber = static_cast<uint32_t>(uniform(0, latest + 1)) });
            break;
        case 1:
            both("WsdbUnwindBlocks",
                 wire::WsdbUnwindBlocks{ .toBlockNumber = static_cast<uint32_t>(uniform(0, latest)) });
            break;
        default:
            both("WsdbRemoveHistoricalBlocks",
                 wire::WsdbRemoveHistoricalBlocks{ .toBlockNumber = static_cast<uint32_t>(uniform(0, latest + 1)) });
        }
        // Forks a chain operation dropped are gone on both; forget them.
        std::erase_if(forks_, [&](uint64_t fork) {
            if (fork == 0) {
                return false;
            }
            return parse(call_ref(encode_request(
                             "WsdbGetTreeInfo",
                             wire::WsdbGetTreeInfo{
                                 .treeId = 0,
                                 .revision = { .forkId = fork, .blockNumber = LATEST, .includeUncommitted = true } })))
                .is_error();
        });
    }

    /** Builds a block as a node does: its effects on a fork at the tip, then the same effects synced to fork 0. */
    void build_block()
    {
        auto created = both("WsdbCreateFork", wire::WsdbCreateFork{ .latest = true, .blockNumber = 0 });
        uint64_t fork = decode<wire::WsdbCreateForkResponse>(created).forkId;
        auto notes = some_note_hashes(coin(30) ? 64 : 8);
        auto messages = coin(30) ? some_note_hashes(4) : std::vector<wire::Fr>{};
        auto nullifiers = some_nullifiers(coin(30) ? 64 : 8, true, true);
        auto public_data = some_public_data(uniform(0, 4), false);
        both("WsdbAppendLeaves", wire::WsdbAppendLeaves{ .treeId = 1, .leaves = notes, .forkId = fork });
        both("WsdbAppendLeaves", wire::WsdbAppendLeaves{ .treeId = 3, .leaves = messages, .forkId = fork });
        auto inserted =
            both("WsdbBatchInsertNullifier",
                 wire::WsdbBatchInsertNullifier{
                     .leaves = nullifiers, .subtreeDepth = nullifiers.size() == 64 ? 6u : 3u, .forkId = fork });
        both("WsdbSequentialInsertPublicData",
             wire::WsdbSequentialInsertPublicData{ .leaves = public_data, .forkId = fork });
        auto state = decode<wire::WsdbGetStateReferenceResponse>(
            both("WsdbGetStateReference",
                 wire::WsdbGetStateReference{
                     .revision = { .forkId = fork, .blockNumber = LATEST, .includeUncommitted = true } }));
        fr header_hash(uniform(1, 1ULL << 62));
        both("WsdbUpdateArchive",
             wire::WsdbUpdateArchive{ .blockStateRef = state.state,
                                      .blockHeaderHash = bytes_of<wire::BlockHeaderHash>(header_hash),
                                      .forkId = fork });
        auto archive = decode<wire::WsdbGetTreeInfoResponse>(
            both("WsdbGetTreeInfo",
                 wire::WsdbGetTreeInfo{
                     .treeId = 4, .revision = { .forkId = fork, .blockNumber = LATEST, .includeUncommitted = true } }));
        auto previous = decode<wire::WsdbGetTreeInfoResponse>(
            both("WsdbGetTreeInfo",
                 wire::WsdbGetTreeInfo{
                     .treeId = 4, .revision = { .forkId = 0, .blockNumber = LATEST, .includeUncommitted = false } }));
        both("WsdbDeleteFork", wire::WsdbDeleteFork{ .forkId = fork });
        if (inserted.is_error()) {
            return;
        }
        // Sometimes a block whose claimed state is wrong, which both must reject without committing.
        if (coin(10)) {
            state.state[0].size += 1;
        }
        both("WsdbSyncBlock",
             wire::WsdbSyncBlock{ .blockNumber = 0,
                                  .blockStateRef = state.state,
                                  .blockHeaderHash = bytes_of<wire::BlockHeaderHash>(header_hash),
                                  .paddedNoteHashes = notes,
                                  .paddedL1ToL2Messages = messages,
                                  .paddedNullifiers = nullifiers,
                                  .publicDataWrites = public_data,
                                  .expectedArchiveRoot = coin(80) ? std::optional(archive.root) : std::nullopt,
                                  .expectedPreviousArchiveRoot =
                                      coin(80) ? std::optional(previous.root) : std::nullopt });
    }
};

} // namespace

TEST(WsdbRefNativeDiff, MatchesAztecWsdbRequestForRequest)
{
    const char* binary = std::getenv("WSDB_NATIVE_BIN");
    if (binary == nullptr) {
        GTEST_SKIP() << "set WSDB_NATIVE_BIN to an aztec-wsdb binary to compare against it";
    }
    size_t seeds = std::getenv("WSDB_DIFF_SEEDS") ? std::stoul(std::getenv("WSDB_DIFF_SEEDS")) : 4;
    size_t steps = std::getenv("WSDB_DIFF_STEPS") ? std::stoul(std::getenv("WSDB_DIFF_STEPS")) : 400;
    for (uint64_t seed = 1; seed <= seeds && !HasFailure(); ++seed) {
        auto dir = std::filesystem::temp_directory_path() /
                   ("wsdb-ref-diff-" + std::to_string(getpid()) + "-" + std::to_string(seed));
        {
            NativeWsdb native(binary, dir);
            DiffRun run(native, seed);
            run.run(steps);
            std::cout << "seed " << seed << ": " << run.requests << " requests, " << run.errors
                      << " answered with errors on both, " << run.message_mismatches.size()
                      << " with different messages, " << run.failed_writes_reverted
                      << " failed writes reverted by a checkpoint\n";
            for (size_t i = 0; i < std::min<size_t>(run.message_mismatches.size(), 5); ++i) {
                std::cout << "  " << run.message_mismatches[i] << "\n";
            }
        }
        std::filesystem::remove_all(dir);
    }
}
