/**
 * @file wsdb_ffi.test.cpp
 * @brief libaztec_wsdb, loaded as a host process loads it, takes calls on one instance from many threads at once.
 */
// The world state before the generated wire types: both declare MerkleTreeId, and the wire one must not be found
// first while the world state headers are parsed.
#include "wsdb/wsdb_service.hpp"

#include "common/aztec_constants.hpp"
#include "world_state/test_genesis.hpp"
#include "wsdb/generated/wsdb_client.hpp"
#include "wsdb/generated/wsdb_types.hpp"

#include <gtest/gtest.h>

#include <dlfcn.h>
#include <filesystem>
#include <span>
#include <stdexcept>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>

using namespace azteclabs::wsdb;

namespace {

/** libaztec_wsdb's entry, from the library itself: it is built next to this binary, in ../lib. */
struct Library {
    void* handle = nullptr;
    void* (*create_with_args)(int, const char* const*) = nullptr;
    void (*call)(void*, const uint8_t*, size_t, uint8_t**, size_t*) = nullptr;
    void (*destroy)(void*) = nullptr;
    void (*free)(void*) = nullptr;
    int32_t (*thread_safe)() = nullptr;

    Library()
    {
        auto path =
            std::filesystem::canonical("/proc/self/exe").parent_path().parent_path() / "lib" / "libaztec_wsdb.so";
        handle = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
        if (handle == nullptr) {
            throw std::runtime_error(std::string("dlopen: ") + dlerror());
        }
        bind(create_with_args, "aztec_wsdb_ipc_ffi_create_with_args");
        bind(call, "aztec_wsdb_ipc_ffi_call");
        bind(destroy, "aztec_wsdb_ipc_ffi_destroy");
        bind(free, "aztec_wsdb_ipc_ffi_free");
        bind(thread_safe, "aztec_wsdb_ipc_ffi_thread_safe");
    }
    Library(const Library&) = delete;
    Library& operator=(const Library&) = delete;
    Library(Library&&) = delete;
    Library& operator=(Library&&) = delete;
    ~Library() { dlclose(handle); }

  private:
    template <typename Fn> void bind(Fn& fn, const char* name)
    {
        fn = reinterpret_cast<Fn>(dlsym(handle, name));
        if (fn == nullptr) {
            throw std::runtime_error(std::string("missing symbol ") + name);
        }
    }
};

Library& library()
{
    static Library lib;
    return lib;
}

/** A typed-client backend over one library instance. Copies share the instance. */
class LibraryBackend {
  public:
    explicit LibraryBackend(void* instance)
        : instance_(instance)
    {}
    std::vector<uint8_t> call(std::span<const uint8_t> request)
    {
        uint8_t* out = nullptr;
        size_t out_len = 0;
        library().call(instance_, request.data(), request.size(), &out, &out_len);
        std::vector<uint8_t> response(out, out + out_len);
        library().free(out);
        return response;
    }

  private:
    void* instance_;
};

using Api = WsdbApi<LibraryBackend>;

template <typename W = wire::Fr> W wire_fr(const fr& value)
{
    W w{};
    fr::serialize_to_buffer(value, w.data());
    return w;
}

wire::WsdbInit genesis_init()
{
    wire::WsdbInit init{ .treeHeights = { { .treeId = 0, .height = NULLIFIER_TREE_HEIGHT },
                                          { .treeId = 1, .height = NOTE_HASH_TREE_HEIGHT },
                                          { .treeId = 2, .height = PUBLIC_DATA_TREE_HEIGHT },
                                          { .treeId = 3, .height = L1_TO_L2_MSG_TREE_HEIGHT },
                                          { .treeId = 4, .height = ARCHIVE_HEIGHT } },
                         .treePrefill = { { .treeId = 0, .size = 128 }, { .treeId = 2, .size = 64 } },
                         .prefilledPublicData = {},
                         .prefilledNullifiers = {},
                         .genesisTimestamp = 1234,
                         .initialHeaderGeneratorPoint = static_cast<uint32_t>(DOM_SEP__BLOCK_HEADER_HASH) };
    for (const auto& nullifier : world_state::test_genesis_nullifiers()) {
        init.prefilledNullifiers.push_back(wire_fr(nullifier));
    }
    return init;
}

constexpr uint32_t note_hash_tree = 1;

class WsdbFfiTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        root_ =
            std::filesystem::temp_directory_path() / ("wsdb-ffi-" + std::to_string(getpid()) + "-" +
                                                      ::testing::UnitTest::GetInstance()->current_test_info()->name());
        std::filesystem::remove_all(root_);
    }
    void TearDown() override { std::filesystem::remove_all(root_); }

    /** An initialized instance with its stores in their own directory under this test's. */
    void* open(const std::string& name)
    {
        auto dir = root_ / name;
        std::filesystem::create_directories(dir);
        std::string dir_arg = dir.string();
        std::vector<const char*> args{ "--data-dir", dir_arg.c_str(), "--threads", "4" };
        void* instance = library().create_with_args(static_cast<int>(args.size()), args.data());
        if (instance != nullptr) {
            Api(LibraryBackend(instance)).init(genesis_init());
        }
        return instance;
    }

  private:
    std::filesystem::path root_;
};

/** One caller's work on its own fork: appends interleaved with reads of the fork's uncommitted state. */
wire::Fr run_on_fork(Api& api, uint64_t fork, uint64_t seed)
{
    wire::WorldStateRevision uncommitted{ .forkId = fork, .blockNumber = merkle_tree::LATEST_BLOCK, .includeUncommitted = true };
    for (uint64_t batch = 0; batch < 20; batch++) {
        std::vector<wire::Fr> leaves;
        for (uint64_t i = 0; i < 4; i++) {
            leaves.push_back(wire_fr(fr(seed * 1000 + batch * 4 + i + 1)));
        }
        auto before = api.get_tree_info({ .treeId = note_hash_tree, .revision = uncommitted });
        api.append_leaves({ .treeId = note_hash_tree, .leaves = leaves, .forkId = fork });
        auto after = api.get_tree_info({ .treeId = note_hash_tree, .revision = uncommitted });
        if (after.size != before.size + leaves.size()) {
            throw std::runtime_error("fork " + std::to_string(fork) + " lost or gained leaves");
        }
    }
    return api.get_tree_info({ .treeId = note_hash_tree, .revision = uncommitted }).root;
}

} // namespace

TEST_F(WsdbFfiTest, DeclaresItselfThreadSafe)
{
    EXPECT_EQ(library().thread_safe(), 1);
}

TEST_F(WsdbFfiTest, RefusesAnInstanceWithoutADataDirectory)
{
    std::vector<const char*> args{ "--threads", "4" };
    EXPECT_EQ(library().create_with_args(static_cast<int>(args.size()), args.data()), nullptr);
}

TEST_F(WsdbFfiTest, ManyThreadsOnOneInstanceGetTheirSerialResults)
{
    constexpr uint64_t callers = 6;

    // Each caller's sequence on its own fork, run one after another.
    std::vector<wire::Fr> serial_roots;
    {
        void* instance = open("serial");
        ASSERT_NE(instance, nullptr);
        Api api{ LibraryBackend(instance) };
        for (uint64_t c = 0; c < callers; c++) {
            auto fork = api.create_fork({ .latest = true, .blockNumber = 0 }).forkId;
            serial_roots.push_back(run_on_fork(api, fork, c));
        }
        library().destroy(instance);
    }

    // The same sequences from one thread each, at once, on one instance.
    void* instance = open("concurrent");
    ASSERT_NE(instance, nullptr);
    std::vector<wire::Fr> roots(callers);
    std::vector<std::string> errors(callers);
    std::vector<std::thread> threads;
    for (uint64_t c = 0; c < callers; c++) {
        threads.emplace_back([&, c] {
            try {
                Api api{ LibraryBackend(instance) };
                auto fork = api.create_fork({ .latest = true, .blockNumber = 0 }).forkId;
                roots[c] = run_on_fork(api, fork, c);
            } catch (const std::exception& e) {
                errors[c] = e.what();
            }
        });
    }
    for (auto& thread : threads) {
        thread.join();
    }
    library().destroy(instance);

    for (uint64_t c = 0; c < callers; c++) {
        EXPECT_EQ(errors[c], "") << "caller " << c;
        EXPECT_EQ(roots[c], serial_roots[c]) << "caller " << c;
    }
}

TEST_F(WsdbFfiTest, ManyThreadsWritingOneForkKeepEveryLeaf)
{
    constexpr uint64_t callers = 6;
    constexpr uint64_t appends = 25;
    void* instance = open("shared-fork");
    ASSERT_NE(instance, nullptr);
    Api api{ LibraryBackend(instance) };
    auto fork = api.create_fork({ .latest = true, .blockNumber = 0 }).forkId;
    wire::WorldStateRevision uncommitted{ .forkId = fork, .blockNumber = merkle_tree::LATEST_BLOCK, .includeUncommitted = true };
    auto start = api.get_tree_info({ .treeId = note_hash_tree, .revision = uncommitted }).size;

    std::vector<std::thread> threads;
    for (uint64_t c = 0; c < callers; c++) {
        threads.emplace_back([&, c] {
            Api caller{ LibraryBackend(instance) };
            for (uint64_t i = 0; i < appends; i++) {
                caller.append_leaves(
                    { .treeId = note_hash_tree, .leaves = { wire_fr(fr(c * 1000 + i + 1)) }, .forkId = fork });
                caller.get_tree_info({ .treeId = note_hash_tree, .revision = uncommitted });
            }
        });
    }
    for (auto& thread : threads) {
        thread.join();
    }
    EXPECT_EQ(api.get_tree_info({ .treeId = note_hash_tree, .revision = uncommitted }).size, start + callers * appends);
    library().destroy(instance);
}
