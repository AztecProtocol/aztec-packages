#include "append_only_tree.hpp"
#include "../fixtures.hpp"
#include "../memory_tree.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/array_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "gtest/gtest.h"
#include <cstdint>
#include <filesystem>
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace bb::crypto::merkle_tree;

using Store = CachedTreeStore<LMDBStore, bb::fr>;
using TreeType = AppendOnlyTree<Store, Poseidon2HashPolicy>;

class PersistedAppendOnlyTreeTest : public testing::Test {
  protected:
    void SetUp() override
    {
        // setup with 1MB max db size, 1 max database and 2 maximum concurrent readers
        _directory = randomTempDirectory();
        std::filesystem::create_directories(_directory);
        _environment = std::make_unique<LMDBEnvironment>(_directory, 1, 2, 2);
    }

    void TearDown() override { std::filesystem::remove_all(_directory); }

    static std::string _directory;

    std::unique_ptr<LMDBEnvironment> _environment;
};

std::string PersistedAppendOnlyTreeTest::_directory;

void check_size(TreeType& tree, index_t expected_size, bool includeUncommitted = true)
{
    Signal signal(1);
    auto completion = [&](const std::string&, uint32_t, const index_t& size, const fr&) -> void {
        EXPECT_EQ(size, expected_size);
        signal.signal_level(0);
    };
    tree.get_meta_data(includeUncommitted, completion);
    signal.wait_for_level(0);
}

void check_root(TreeType& tree, fr expected_root, bool includeUncommitted = true)
{
    Signal signal(1);
    auto completion = [&](const std::string&, uint32_t, const index_t&, const fr& root) -> void {
        EXPECT_EQ(root, expected_root);
        signal.signal_level(0);
    };
    tree.get_meta_data(includeUncommitted, completion);
    signal.wait_for_level(0);
}

void check_hash_path(TreeType& tree, index_t index, fr_hash_path expected_hash_path, bool includeUncommitted = true)
{
    Signal signal(1);
    auto completion = [&](const fr_hash_path& path) -> void {
        EXPECT_EQ(path, expected_hash_path);
        signal.signal_level(0);
    };
    tree.get_hash_path(index, completion, includeUncommitted);
    signal.wait_for_level(0);
}

void commit_tree(TreeType& tree)
{
    Signal signal(1);
    auto completion = [&]() -> void { signal.signal_level(0); };
    tree.commit(completion);
    signal.wait_for_level(0);
}

void add_value(TreeType& tree, const fr& value)
{
    Signal signal(1);
    auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };

    tree.add_value(value, completion);
    signal.wait_for_level(0);
}

void add_values(TreeType& tree, const std::vector<fr>& values)
{
    Signal signal(1);
    auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };

    tree.add_values(values, completion);
    signal.wait_for_level(0);
}

TEST_F(PersistedAppendOnlyTreeTest, can_create)
{
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    EXPECT_NO_THROW(Store store(name, depth, db));
    Store store(name, depth, db);

    ThreadPool pool(1);
    TreeType tree(store, pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    check_size(tree, 0);
    check_root(tree, memdb.root());
}

TEST_F(PersistedAppendOnlyTreeTest, can_only_recreate_with_same_name_and_depth)
{
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);

    EXPECT_ANY_THROW(Store store_wrong_name("Wrong name", depth, db));
    EXPECT_ANY_THROW(Store store_wrong_depth(name, depth + 1, db));
}

TEST_F(PersistedAppendOnlyTreeTest, can_add_value_and_get_hash_path)
{
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);

    ThreadPool pool(1);
    TreeType tree(store, pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    check_size(tree, 0);
    check_root(tree, memdb.root());

    Signal signal(1);
    auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };

    memdb.update_element(0, VALUES[0]);
    tree.add_value(VALUES[0], completion);
    signal.wait_for_level(0);

    check_size(tree, 1);
    check_root(tree, memdb.root());
    check_hash_path(tree, 0, memdb.get_hash_path(0));
}

TEST_F(PersistedAppendOnlyTreeTest, can_commit_and_restore)
{
    constexpr size_t depth = 10;
    std::string name = randomString();
    MemoryTree<Poseidon2HashPolicy> memdb(depth);
    {
        LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
        Store store(name, depth, db);

        ThreadPool pool(1);
        TreeType tree(store, pool);

        check_size(tree, 0);
        check_root(tree, memdb.root());
        check_hash_path(tree, 0, memdb.get_hash_path(0));

        bb::fr initial_root = memdb.root();
        fr_hash_path initial_hash_path = memdb.get_hash_path(0);
        memdb.update_element(0, VALUES[0]);
        add_value(tree, VALUES[0]);

        // check uncommitted state
        check_size(tree, 1);
        check_root(tree, memdb.root());
        check_hash_path(tree, 0, memdb.get_hash_path(0));

        // check committed state
        check_size(tree, 0, false);
        check_root(tree, initial_root, false);
        check_hash_path(tree, 0, initial_hash_path, false);

        // commit the changes
        commit_tree(tree);
        // now committed and uncommitted should be the same

        // check uncommitted state
        check_size(tree, 1);
        check_root(tree, memdb.root());
        check_hash_path(tree, 0, memdb.get_hash_path(0));

        // check committed state
        check_size(tree, 1, false);
        check_root(tree, memdb.root(), false);
        check_hash_path(tree, 0, memdb.get_hash_path(0), false);
    }

    // Re-create the store and tree, it should be the same as how we left it
    {
        LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
        Store store(name, depth, db);

        ThreadPool pool(1);
        TreeType tree(store, pool);

        // check uncommitted state
        check_size(tree, 1);
        check_root(tree, memdb.root());
        check_hash_path(tree, 0, memdb.get_hash_path(0));

        // check committed state
        check_size(tree, 1, false);
        check_root(tree, memdb.root(), false);
        check_hash_path(tree, 0, memdb.get_hash_path(0), false);
    }
}

TEST_F(PersistedAppendOnlyTreeTest, test_size)
{
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);
    ThreadPool pool(1);
    TreeType tree(store, pool);

    check_size(tree, 0);

    // Add a new non-zero leaf at index 0.
    add_value(tree, 30);
    check_size(tree, 1);

    // Add second.
    add_value(tree, 10);
    check_size(tree, 2);

    // Add third.
    add_value(tree, 20);
    check_size(tree, 3);

    // Add forth but with same value.
    add_value(tree, 40);
    check_size(tree, 4);
}

TEST_F(PersistedAppendOnlyTreeTest, can_add_multiple_values)
{
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);
    ThreadPool pool(1);
    TreeType tree(store, pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    for (size_t i = 0; i < NUM_VALUES; ++i) {
        fr mock_root = memdb.update_element(i, VALUES[i]);
        add_value(tree, VALUES[i]);
        check_root(tree, mock_root);

        check_hash_path(tree, 0, memdb.get_hash_path(0));
        check_hash_path(tree, i, memdb.get_hash_path(i));
    }
}

TEST_F(PersistedAppendOnlyTreeTest, can_add_multiple_values_in_a_batch)
{
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);
    ThreadPool pool(1);
    TreeType tree(store, pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    for (size_t i = 0; i < NUM_VALUES; ++i) {
        memdb.update_element(i, VALUES[i]);
    }
    add_values(tree, VALUES);
    check_size(tree, NUM_VALUES);
    check_root(tree, memdb.root());
    check_hash_path(tree, 0, memdb.get_hash_path(0));
    check_hash_path(tree, NUM_VALUES - 1, memdb.get_hash_path(NUM_VALUES - 1));
}

TEST_F(PersistedAppendOnlyTreeTest, can_be_filled)
{
    constexpr size_t depth = 3;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);
    ThreadPool pool(1);
    TreeType tree(store, pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    check_size(tree, 0);
    check_root(tree, memdb.root());

    for (size_t i = 0; i < 8; i++) {
        memdb.update_element(i, VALUES[i]);
        add_value(tree, VALUES[i]);
    }

    check_root(tree, memdb.root());
    check_hash_path(tree, 0, memdb.get_hash_path(0));
    check_hash_path(tree, 7, memdb.get_hash_path(7));
}

TEST_F(PersistedAppendOnlyTreeTest, can_add_single_whilst_reading)
{
    constexpr size_t depth = 10;
    MemoryTree<Poseidon2HashPolicy> memdb(depth);
    fr_hash_path initial_path = memdb.get_hash_path(0);
    memdb.update_element(0, VALUES[0]);
    fr_hash_path final_hash_path = memdb.get_hash_path(0);

    uint32_t num_reads = 16 * 1024;
    std::vector<fr_hash_path> paths(num_reads);

    {
        std::string name = randomString();
        LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
        Store store(name, depth, db);
        ThreadPool pool(8);
        TreeType tree(store, pool);

        check_size(tree, 0);

        Signal signal(2);

        auto add_completion = [&](const fr&, index_t) {
            signal.signal_level(1);
            auto commit_completion = [&]() { signal.signal_level(0); };
            tree.commit(commit_completion);
        };
        tree.add_value(VALUES[0], add_completion);

        for (size_t i = 0; i < num_reads; i++) {
            auto completion = [&, i](const fr_hash_path& path) { paths[i] = path; };
            tree.get_hash_path(0, completion, false);
        }
        signal.wait_for_level(0);
    }

    for (auto& path : paths) {
        EXPECT_TRUE(path == initial_path || path == final_hash_path);
    }
}
