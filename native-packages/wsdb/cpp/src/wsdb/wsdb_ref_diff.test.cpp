/**
 * @file wsdb_ref_diff.test.cpp
 * @brief aztec-wsdb against wsdb-ref, barretenberg's reference world state, request for request.
 *
 * Both serve wsdb_schema.jsonc and both are linked in, each behind its generated FFI entry: aztec-wsdb's
 * (wsdb_labs_ipc_ffi_entry) from this package's sources, wsdb-ref's (wsdb_ref_ipc_ffi_entry) from barretenberg's
 * static library. The test drives each through the generated typed client, WsdbApi. A seeded random run builds blocks
 * the way a node does (effects on a fork, then SyncBlock), interleaved with reads at every revision, writes and
 * checkpoints on forks, unwinds, finalization and history removal. A request must fail on both or on neither, and
 * every success must be equal, apart from the store statistics a full status carries. Error messages are counted, not
 * compared.
 *
 * WSDB_DIFF_SEEDS (default 4) and WSDB_DIFF_STEPS (default 400) size the run; WSDB_DIFF_TRACE prints every request.
 */
#include "common/aztec_constants.hpp"
#include "field/field_element.hpp"
#include "world_state/genesis_protocol_nullifiers.hpp"
#include "wsdb/generated/ipc_codegen/msgpack_adaptor.hpp"
#include "wsdb/generated/wsdb_client.hpp"
#include "wsdb/generated/wsdb_ffi_backend.hpp"
#include "wsdb/generated/wsdb_types.hpp"
#include "wsdb/wsdb_ffi_service.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <optional>
#include <random>
#include <span>
#include <sstream>
#include <string>
#include <type_traits>
#include <unistd.h>
#include <variant>
#include <vector>

// wsdb-ref's FFI entry, in barretenberg's static library.
extern "C" {
void wsdb_ref_ipc_ffi_entry(const uint8_t* input, size_t input_len, uint8_t** output, size_t* output_len);
void wsdb_ref_ipc_ffi_free(void* ptr);
}

using namespace azteclabs::wsdb;

namespace {

constexpr uint32_t LATEST = std::numeric_limits<uint32_t>::max();

/** An ipc_codegen::Backend over wsdb-ref's FFI entry, as the generated FfiBackend is over aztec-wsdb's. */
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

using RefApi = WsdbApi<WsdbRefBackend>;
using LabsApi = WsdbApi<FfiBackend>;

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

/** A message or response as msgpack text, for failure messages and traces. */
template <typename T> std::string dump(const T& value)
{
    if constexpr (std::is_same_v<T, std::monostate>) {
        return "{}";
    } else {
        msgpack::sbuffer buf;
        msgpack::packer<msgpack::sbuffer> pk(buf);
        pk.pack(value);
        auto unpacked = msgpack::unpack(buf.data(), buf.size());
        std::ostringstream out;
        out << unpacked.get();
        std::string text = out.str();
        return text.size() > 1500 ? text.substr(0, 1500) + "..." : text;
    }
}

/** The indexed trees' initial sizes, prefill included: a run's one varied part of the genesis. */
struct InitialSizes {
    uint64_t nullifier;
    uint64_t public_data;
};

/** aztec-wsdb's open options: this test's tree shapes and genesis, its stores in `data_dir`. */
std::vector<std::string> aztec_wsdb_options(const std::filesystem::path& data_dir, const InitialSizes& sizes)
{
    std::filesystem::create_directories(data_dir);
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
    return {
        "-d",
        data_dir.string(),
        "-t",
        "4",
        "--tree-heights",
        heights.str(),
        "--tree-prefill",
        "{0:" + std::to_string(sizes.nullifier) + ",2:" + std::to_string(sizes.public_data) + "}",
        "--initial-header-generator-point",
        std::to_string(DOM_SEP__BLOCK_HEADER_HASH),
        "--prefilled-public-data",
        R"([["00000000000000000000000000000000000000000000000000000000000003e8","0000000000000000000000000000000000000000000000000000000000000007"]])",
        "--prefilled-nullifiers",
        nullifiers.str()
    };
}

/** aztec-wsdb in-process, open for one run: closed, with its stores, when the run ends. */
class AztecWsdb {
  public:
    explicit AztecWsdb(const std::vector<std::string>& options)
    {
        std::vector<const char*> args;
        for (const auto& option : options) {
            args.push_back(option.c_str());
        }
        if (wsdb_labs_ffi_open(static_cast<int>(args.size()), args.data()) != 0) {
            throw std::runtime_error("wsdb_labs_ffi_open failed");
        }
    }
    ~AztecWsdb() { wsdb_labs_ffi_close(); }
    AztecWsdb(const AztecWsdb&) = delete;
    AztecWsdb& operator=(const AztecWsdb&) = delete;
    AztecWsdb(AztecWsdb&&) = delete;
    AztecWsdb& operator=(AztecWsdb&&) = delete;
};

// Sends one command to both: `BOTH(get_tree_info, cmd)` calls api.get_tree_info(cmd) on each, building the command
// once so both get the same request.
#define BOTH(method, ...)                                                                                              \
    both(                                                                                                              \
        #method,                                                                                                       \
        [](auto& api, auto&&... args) { return api.method(std::forward<decltype(args)>(args)...); } __VA_OPT__(, )   \
            __VA_ARGS__)

/** One differential run: a random but node-shaped workload, every request answered by both. */
class DiffRun {
  public:
    DiffRun(const InitialSizes& sizes, uint64_t seed)
        : sizes_(sizes)
        , rng_(seed)
    {}

    size_t requests = 0;
    size_t errors = 0;
    size_t failed_writes_reverted = 0;
    std::vector<std::string> message_mismatches;

    /**
     * Sends one command to both through `call(api, cmd...)` and compares the answers. Returns the reference's
     * response, or nullopt when it failed; a command answering nothing returns std::monostate.
     */
    template <typename Call, typename... Cmd> auto both(const std::string& name, Call call, const Cmd&... cmd)
    {
        using Resp = decltype(call(ref_, Cmd(cmd)...));
        using Value = std::conditional_t<std::is_void_v<Resp>, std::monostate, Resp>;
        auto attempt = [&](auto& api) -> std::variant<Value, std::string> {
            try {
                if constexpr (std::is_void_v<Resp>) {
                    call(api, Cmd(cmd)...);
                    return Value{};
                } else {
                    return call(api, Cmd(cmd)...);
                }
            } catch (const std::exception& e) {
                return std::string(e.what());
            }
        };
        auto ref = attempt(ref_);
        auto labs = attempt(labs_);
        ++requests;
        auto request = [&]() { return name + " " + (std::string() + ... + dump(cmd)); };
        auto* ref_value = std::get_if<Value>(&ref);
        auto* labs_value = std::get_if<Value>(&labs);
        if (std::getenv("WSDB_DIFF_TRACE") != nullptr) {
            std::cout << "step " << step_ << " " << request().substr(0, 600)
                      << (ref_value == nullptr ? " -> error: " + std::get<std::string>(ref)
                          : name == "create_fork" || name == "get_status" ? " -> " + dump(*ref_value)
                                                                          : "")
                      << "\n";
        }
        if ((ref_value == nullptr) != (labs_value == nullptr)) {
            ADD_FAILURE() << "step " << step_ << " " << request() << ": wsdb-ref "
                          << (ref_value == nullptr ? "failed: " + std::get<std::string>(ref) : "succeeded")
                          << ", aztec-wsdb "
                          << (labs_value == nullptr ? "failed: " + std::get<std::string>(labs) : "succeeded");
        } else if (ref_value == nullptr) {
            ++errors;
            if (std::get<std::string>(ref) != std::get<std::string>(labs)) {
                message_mismatches.push_back(name + ": '" + std::get<std::string>(ref) + "' vs '" +
                                             std::get<std::string>(labs) + "'");
            }
        } else {
            compare(*ref_value, *labs_value, request);
        }
        return ref_value == nullptr ? std::optional<Value>() : std::optional<Value>(std::move(*ref_value));
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
    RefApi ref_;
    LabsApi labs_;
    InitialSizes sizes_;
    std::mt19937_64 rng_;
    size_t step_ = 0;
    std::vector<uint64_t> forks_{ 0 };
    std::vector<fr> known_keys_;
    std::vector<fr> known_note_hashes_;
    std::vector<fr> slots_;

    static auto sorted_state(const std::vector<wire::TreeStateReference>& state)
    {
        std::vector<std::tuple<uint32_t, fr, uint64_t>> out;
        for (const auto& tree : state) {
            out.emplace_back(tree.treeId, fr_of(tree.root), tree.size);
        }
        std::sort(out.begin(), out.end(), [](const auto& a, const auto& b) { return std::get<0>(a) < std::get<0>(b); });
        return out;
    }

    template <typename T> void compare(const T& ref, const T& labs, const auto& request)
    {
        if constexpr (requires { ref.status.meta; }) {
            compare_status(ref.status, labs.status, request);
        } else if constexpr (requires { ref.state; }) {
            // A node builds a state reference from an unordered map: the entries match, in any order.
            EXPECT_EQ(sorted_state(ref.state), sorted_state(labs.state))
                << "step " << step_ << " " << request() << ": state references differ";
        } else if (!(ref == labs)) {
            ADD_FAILURE() << "step " << step_ << ": responses differ\n  request:    " << request()
                          << "\n  wsdb-ref:   " << dump(ref) << "\n  aztec-wsdb: " << dump(labs);
        }
    }

    void compare_status(const wire::WorldStateStatusFull& r, const wire::WorldStateStatusFull& n, const auto& request)
    {
        // Store statistics are a node's LMDB sizes; the summary and every tree's meta must match.
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
        auto what = [&]() { return "step " + std::to_string(step_) + " " + request(); };
        EXPECT_EQ(r.summary, n.summary) << what() << ": status summaries differ";
        EXPECT_EQ(meta(r.meta.nullifierTreeMeta), meta(n.meta.nullifierTreeMeta)) << what() << ": nullifier meta";
        EXPECT_EQ(meta(r.meta.noteHashTreeMeta), meta(n.meta.noteHashTreeMeta)) << what() << ": note hash meta";
        EXPECT_EQ(meta(r.meta.publicDataTreeMeta), meta(n.meta.publicDataTreeMeta)) << what() << ": public data meta";
        EXPECT_EQ(meta(r.meta.messageTreeMeta), meta(n.meta.messageTreeMeta)) << what() << ": message meta";
        EXPECT_EQ(meta(r.meta.archiveTreeMeta), meta(n.meta.archiveTreeMeta)) << what() << ": archive meta";
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
        return static_cast<uint32_t>(BOTH(get_status).value().status.unfinalizedBlockNumber);
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
        // The genesis aztec-wsdb was started with: the protocol's tree heights, this run's initial sizes, the
        // protocol nullifiers and one public-data slot.
        wire::WsdbInit genesis{ .treeHeights = { { .treeId = 0, .height = NULLIFIER_TREE_HEIGHT },
                                                 { .treeId = 1, .height = NOTE_HASH_TREE_HEIGHT },
                                                 { .treeId = 2, .height = PUBLIC_DATA_TREE_HEIGHT },
                                                 { .treeId = 3, .height = L1_TO_L2_MSG_TREE_HEIGHT },
                                                 { .treeId = 4, .height = ARCHIVE_HEIGHT } },
                                .treePrefill = { { .treeId = 0, .size = sizes_.nullifier },
                                                 { .treeId = 2, .size = sizes_.public_data } },
                                .prefilledPublicData = { { .slot = bytes_of<wire::PublicDataSlot>(fr(1000)),
                                                           .value = bytes_of<wire::PublicDataValue>(fr(7)) } },
                                .prefilledNullifiers = {},
                                .genesisTimestamp = 0,
                                .initialHeaderGeneratorPoint = static_cast<uint32_t>(DOM_SEP__BLOCK_HEADER_HASH) };
        for (const auto& seed : world_state::genesis_protocol_nullifiers()) {
            genesis.prefilledNullifiers.push_back(bytes_of<wire::Fr>(seed));
        }
        // aztec-wsdb takes its genesis when it is opened; wsdb-ref, from Init, which replaces any earlier state.
        ref_.init(genesis);
        slots_.push_back(fr(1000));
        BOTH(get_initial_state_reference);
    }

    void read()
    {
        auto revision = some_revision();
        uint32_t tree = static_cast<uint32_t>(uniform(0, 4));
        switch (uniform(0, 11)) {
        case 0:
            BOTH(get_tree_info, wire::WsdbGetTreeInfo{ .treeId = tree, .revision = revision });
            break;
        case 1:
            BOTH(get_state_reference, wire::WsdbGetStateReference{ .revision = revision });
            break;
        case 2:
            BOTH(get_leaf_value,
                 wire::WsdbGetLeafValue{
                     .treeId = coin(80) ? 1u : 4u, .revision = revision, .leafIndex = uniform(0, 300) });
            break;
        case 3:
            BOTH(get_nullifier_leaf_preimage,
                 wire::WsdbGetNullifierLeafPreimage{ .revision = revision, .leafIndex = uniform(0, 400) });
            BOTH(get_nullifier_leaf_value,
                 wire::WsdbGetNullifierLeafValue{ .revision = revision, .leafIndex = uniform(0, 400) });
            break;
        case 4:
            BOTH(get_public_data_leaf_preimage,
                 wire::WsdbGetPublicDataLeafPreimage{ .revision = revision, .leafIndex = uniform(0, 300) });
            BOTH(get_public_data_leaf_value,
                 wire::WsdbGetPublicDataLeafValue{ .revision = revision, .leafIndex = uniform(0, 300) });
            break;
        case 5:
            BOTH(get_sibling_path,
                 wire::WsdbGetSiblingPath{ .treeId = tree, .revision = revision, .leafIndex = uniform(0, 400) });
            break;
        case 6:
            BOTH(find_leaf_indices,
                 wire::WsdbFindLeafIndices{
                     .treeId = 1,
                     .revision = revision,
                     .leaves = { bytes_of<wire::Fr>(some_note_hash()), bytes_of<wire::Fr>(some_note_hash()) },
                     .startIndex = uniform(0, 20) });
            break;
        case 7:
            BOTH(find_nullifier_leaf_indices,
                 wire::WsdbFindNullifierLeafIndices{
                     .revision = revision,
                     .leaves = { { .nullifier = bytes_of<wire::Nullifier>(some_key()) },
                                 { .nullifier = bytes_of<wire::Nullifier>(fr(uniform(1, 127))) } },
                     .startIndex = uniform(0, 140) });
            BOTH(find_public_data_leaf_indices,
                 wire::WsdbFindPublicDataLeafIndices{
                     .revision = revision,
                     .leaves = { { .slot = bytes_of<wire::PublicDataSlot>(some_slot()),
                                   .value = bytes_of<wire::PublicDataValue>(fr(uniform(0, 3))) } },
                     .startIndex = 0 });
            break;
        case 8:
            BOTH(find_low_leaf,
                 wire::WsdbFindLowLeaf{ .treeId = coin(50) ? 0u : 2u,
                                        .revision = revision,
                                        .key = bytes_of<wire::Fr>(coin(50) ? some_key() : some_slot()) });
            break;
        case 9:
            BOTH(find_sibling_paths,
                 wire::WsdbFindSiblingPaths{
                     .treeId = 1, .revision = revision, .leaves = { bytes_of<wire::Fr>(some_note_hash()) } });
            BOTH(find_nullifier_sibling_paths,
                 wire::WsdbFindNullifierSiblingPaths{
                     .revision = revision, .leaves = { { .nullifier = bytes_of<wire::Nullifier>(some_key()) } } });
            BOTH(find_public_data_sibling_paths,
                 wire::WsdbFindPublicDataSiblingPaths{
                     .revision = revision,
                     .leaves = { { .slot = bytes_of<wire::PublicDataSlot>(some_slot()),
                                   .value = bytes_of<wire::PublicDataValue>(fr(0)) } } });
            break;
        case 10:
            BOTH(get_block_numbers_for_leaf_indices,
                 wire::WsdbGetBlockNumbersForLeafIndices{
                     .treeId = tree, .revision = revision, .leafIndices = { 0, uniform(0, 140), uniform(0, 400) } });
            break;
        default:
            BOTH(get_status);
            BOTH(get_initial_state_reference);
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
            auto created = BOTH(create_fork, wire::WsdbCreateFork{ .latest = true, .blockNumber = 0 });
            forks_.push_back(created.value().forkId);
            return forks_.back();
        }
        return others[uniform(0, others.size() - 1)];
    }

    void write_on_fork()
    {
        uint64_t fork = coin(25) ? 0 : other_fork();
        if (fork == 0 && coin(50)) {
            // Writes that cannot fail, so the canonical fork keeps growing.
            BOTH(append_leaves,
                 wire::WsdbAppendLeaves{
                     .treeId = coin(70) ? 1u : 3u, .leaves = some_note_hashes(uniform(0, 5)), .forkId = 0 });
            BOTH(sequential_insert_nullifier,
                 wire::WsdbSequentialInsertNullifier{ .leaves = some_nullifiers(uniform(0, 3), true, true),
                                                      .forkId = 0 });
            BOTH(batch_insert_public_data,
                 wire::WsdbBatchInsertPublicData{ .leaves = distinct_public_data(4), .subtreeDepth = 2, .forkId = 0 });
            return;
        }
        // As the public processor does with each tx: a checkpoint around the write, reverted if the write fails.
        bool guarded = coin(50);
        if (guarded) {
            BOTH(create_checkpoint, wire::WsdbCreateCheckpoint{ .forkId = fork });
        }
        bool failed = false;
        switch (uniform(0, 6)) {
        case 0:
            BOTH(append_leaves,
                 wire::WsdbAppendLeaves{
                     .treeId = coin(70) ? 1u : 3u, .leaves = some_note_hashes(uniform(0, 5)), .forkId = fork });
            break;
        case 1:
            failed = !BOTH(sequential_insert_nullifier,
                          wire::WsdbSequentialInsertNullifier{ .leaves = some_nullifiers(uniform(0, 4), true, false),
                                                               .forkId = fork }).has_value();
            break;
        case 2:
            failed = !BOTH(sequential_insert_public_data,
                          wire::WsdbSequentialInsertPublicData{ .leaves = some_public_data(uniform(0, 4), true),
                                                                .forkId = fork }).has_value();
            break;
        case 3:
            failed = !BOTH(batch_insert_nullifier,
                          wire::WsdbBatchInsertNullifier{ .leaves = some_nullifiers(4, true, false),
                                                          .subtreeDepth = static_cast<uint32_t>(uniform(0, 2)),
                                                          .forkId = fork }).has_value();
            break;
        case 4:
            failed = !BOTH(batch_insert_public_data,
                          wire::WsdbBatchInsertPublicData{ .leaves = some_public_data(4, true),
                                                           .subtreeDepth = static_cast<uint32_t>(uniform(0, 2)),
                                                           .forkId = fork }).has_value();
            break;
        case 5:
            failed = !BOTH(append_nullifier_leaves,
                          wire::WsdbAppendNullifierLeaves{ .leaves = some_nullifiers(uniform(1, 3), true, false),
                                                           .forkId = fork }).has_value();
            if (failed) {
                break;
            }
            failed = !BOTH(append_public_data_leaves,
                wire::WsdbAppendPublicDataLeaves{ .leaves = some_public_data(uniform(1, 3), true), .forkId = fork }).has_value();
            break;
        default: {
            auto state = BOTH(get_state_reference,
                              wire::WsdbGetStateReference{
                                  .revision = { .forkId = fork, .blockNumber = LATEST, .includeUncommitted = true } });
            if (!state) {
                break;
            }
            auto block_state = state->state;
            if (coin(20)) {
                block_state = BOTH(get_initial_state_reference).value().state;
            }
            BOTH(update_archive,
                wire::WsdbUpdateArchive{ .blockStateRef = block_state,
                                         .blockHeaderHash = bytes_of<wire::BlockHeaderHash>(fr(uniform(1, 1ULL << 62))),
                                         .forkId = fork });
        }
        }
        if (guarded) {
            if (failed) {
                failed_writes_reverted++;
            }
            if (failed || coin(50)) {
                BOTH(revert_checkpoint, wire::WsdbRevertCheckpoint{ .forkId = fork });
            } else {
                BOTH(commit_checkpoint, wire::WsdbCommitCheckpoint{ .forkId = fork });
            }
        }
    }

    void checkpoint_op()
    {
        uint64_t fork = some_fork();
        switch (uniform(0, 4)) {
        case 0:
        case 1:
            BOTH(create_checkpoint, wire::WsdbCreateCheckpoint{ .forkId = fork });
            break;
        case 2:
            if (coin(50)) {
                BOTH(commit_checkpoint, wire::WsdbCommitCheckpoint{ .forkId = fork });
            } else {
                BOTH(revert_checkpoint, wire::WsdbRevertCheckpoint{ .forkId = fork });
            }
            break;
        case 3:
            BOTH(commit_all_checkpoints, wire::WsdbCommitAllCheckpoints{ .forkId = fork });
            break;
        default:
            BOTH(revert_all_checkpoints, wire::WsdbRevertAllCheckpoints{ .forkId = fork });
        }
    }

    void fork_op()
    {
        if (coin(60) || forks_.size() < 2) {
            bool latest = coin(70);
            auto created =
                BOTH(create_fork,
                     wire::WsdbCreateFork{ .latest = latest,
                                           .blockNumber = static_cast<uint32_t>(uniform(0, latest_block() + 1)) });
            if (created) {
                forks_.push_back(created->forkId);
            }
        } else {
            size_t at = uniform(0, forks_.size() - 1);
            BOTH(delete_fork, wire::WsdbDeleteFork{ .forkId = forks_[at] });
            if (forks_[at] != 0) {
                forks_.erase(forks_.begin() + static_cast<std::ptrdiff_t>(at));
            }
        }
    }

    void canonical_op()
    {
        // Direct writes to the canonical fork, then a commit or a rollback.
        BOTH(append_leaves, wire::WsdbAppendLeaves{ .treeId = 1, .leaves = some_note_hashes(2), .forkId = 0 });
        BOTH(sequential_insert_nullifier,
             wire::WsdbSequentialInsertNullifier{ .leaves = some_nullifiers(1, false, true), .forkId = 0 });
        if (coin(50)) {
            BOTH(commit);
        } else {
            BOTH(rollback);
        }
    }

    void chain_op()
    {
        uint32_t latest = latest_block();
        switch (uniform(0, 2)) {
        case 0:
            BOTH(finalize_blocks,
                 wire::WsdbFinalizeBlocks{ .toBlockNumber = static_cast<uint32_t>(uniform(0, latest + 1)) });
            break;
        case 1:
            BOTH(unwind_blocks,
                 wire::WsdbUnwindBlocks{ .toBlockNumber = static_cast<uint32_t>(uniform(0, latest)) });
            break;
        default:
            BOTH(remove_historical_blocks,
                 wire::WsdbRemoveHistoricalBlocks{ .toBlockNumber = static_cast<uint32_t>(uniform(0, latest + 1)) });
        }
        // Forks a chain operation dropped are gone on both; forget them.
        std::erase_if(forks_, [&](uint64_t fork) {
            if (fork == 0) {
                return false;
            }
            try {
                ref_.get_tree_info(wire::WsdbGetTreeInfo{
                    .treeId = 0, .revision = { .forkId = fork, .blockNumber = LATEST, .includeUncommitted = true } });
                return false;
            } catch (const std::exception&) {
                return true;
            }
        });
    }

    /** Builds a block as a node does: its effects on a fork at the tip, then the same effects synced to fork 0. */
    void build_block()
    {
        auto created = BOTH(create_fork, wire::WsdbCreateFork{ .latest = true, .blockNumber = 0 });
        uint64_t fork = created.value().forkId;
        auto notes = some_note_hashes(coin(30) ? 64 : 8);
        auto messages = coin(30) ? some_note_hashes(4) : std::vector<wire::Fr>{};
        auto nullifiers = some_nullifiers(coin(30) ? 64 : 8, true, true);
        auto public_data = some_public_data(uniform(0, 4), false);
        BOTH(append_leaves, wire::WsdbAppendLeaves{ .treeId = 1, .leaves = notes, .forkId = fork });
        BOTH(append_leaves, wire::WsdbAppendLeaves{ .treeId = 3, .leaves = messages, .forkId = fork });
        auto inserted =
            BOTH(batch_insert_nullifier,
                 wire::WsdbBatchInsertNullifier{
                     .leaves = nullifiers, .subtreeDepth = nullifiers.size() == 64 ? 6u : 3u, .forkId = fork });
        BOTH(sequential_insert_public_data,
             wire::WsdbSequentialInsertPublicData{ .leaves = public_data, .forkId = fork });
        auto state = BOTH(get_state_reference,
                          wire::WsdbGetStateReference{
                              .revision = { .forkId = fork, .blockNumber = LATEST, .includeUncommitted = true } })
                         .value();
        fr header_hash(uniform(1, 1ULL << 62));
        BOTH(update_archive,
             wire::WsdbUpdateArchive{ .blockStateRef = state.state,
                                      .blockHeaderHash = bytes_of<wire::BlockHeaderHash>(header_hash),
                                      .forkId = fork });
        auto archive = BOTH(get_tree_info,
                            wire::WsdbGetTreeInfo{
                                .treeId = 4,
                                .revision = { .forkId = fork, .blockNumber = LATEST, .includeUncommitted = true } })
                           .value();
        auto previous = BOTH(get_tree_info,
                             wire::WsdbGetTreeInfo{
                                 .treeId = 4,
                                 .revision = { .forkId = 0, .blockNumber = LATEST, .includeUncommitted = false } })
                            .value();
        BOTH(delete_fork, wire::WsdbDeleteFork{ .forkId = fork });
        if (!inserted) {
            return;
        }
        // Sometimes a block whose claimed state is wrong, which both must reject without committing.
        if (coin(10)) {
            state.state[0].size += 1;
        }
        BOTH(sync_block,
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

TEST(WsdbRefDiff, MatchesWsdbRefRequestForRequest)
{
    size_t seeds = std::getenv("WSDB_DIFF_SEEDS") ? std::stoul(std::getenv("WSDB_DIFF_SEEDS")) : 4;
    size_t steps = std::getenv("WSDB_DIFF_STEPS") ? std::stoul(std::getenv("WSDB_DIFF_STEPS")) : 400;
    for (uint64_t seed = 1; seed <= seeds && !HasFailure(); ++seed) {
        auto dir = std::filesystem::temp_directory_path() /
                   ("wsdb-ref-diff-" + std::to_string(getpid()) + "-" + std::to_string(seed));
        {
            // Odd seeds run the protocol's initial sizes, even ones others.
            InitialSizes sizes = seed % 2 == 1 ? InitialSizes{ 128, 128 } : InitialSizes{ 64, 256 };
            AztecWsdb aztec_wsdb(aztec_wsdb_options(dir / "data", sizes));
            DiffRun run(sizes, seed);
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
