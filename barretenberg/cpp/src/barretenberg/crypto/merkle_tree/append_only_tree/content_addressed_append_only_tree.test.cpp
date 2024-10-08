#include "barretenberg/crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp"
#include "../fixtures.hpp"
#include "../memory_tree.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/array_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_content_addressed_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "gtest/gtest.h"
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <gtest/gtest.h>
#include <memory>
#include <vector>

using namespace bb;
using namespace bb::crypto::merkle_tree;

using Store = ContentAddressedCachedTreeStore<bb::fr>;
using TreeType = ContentAddressedAppendOnlyTree<Store, Poseidon2HashPolicy>;
using LMDBStoreType = LMDBTreeStore;

class PersistedContentAddressedAppendOnlyTreeTest : public testing::Test {
  protected:
    void SetUp() override
    {
        _directory = random_temp_directory();
        _mapSize = 1024 * 1024;
        _maxReaders = 16;
        std::filesystem::create_directories(_directory);
    }

    void TearDown() override { std::filesystem::remove_all(_directory); }

    static std::string _directory;
    static uint64_t _maxReaders;
    static uint64_t _mapSize;
};

std::string PersistedContentAddressedAppendOnlyTreeTest::_directory;
uint64_t PersistedContentAddressedAppendOnlyTreeTest::_maxReaders;
uint64_t PersistedContentAddressedAppendOnlyTreeTest::_mapSize;

void check_size(TreeType& tree, index_t expected_size, bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<TreeMetaResponse>& response) -> void {
        EXPECT_EQ(response.success, true);
        EXPECT_EQ(response.inner.meta.size, expected_size);
        signal.signal_level();
    };
    tree.get_meta_data(includeUncommitted, completion);
    signal.wait_for_level();
}

void check_unfinalised_block_height(TreeType& tree, index_t expected_block_height)
{
    Signal signal;
    auto completion = [&](const TypedResponse<TreeMetaResponse>& response) -> void {
        EXPECT_EQ(response.success, true);
        EXPECT_EQ(response.inner.meta.unfinalisedBlockHeight, expected_block_height);
        signal.signal_level();
    };
    tree.get_meta_data(true, completion);
    signal.wait_for_level();
}

void check_root(TreeType& tree, fr expected_root, bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<TreeMetaResponse>& response) -> void {
        EXPECT_EQ(response.success, true);
        EXPECT_EQ(response.inner.meta.root, expected_root);
        signal.signal_level();
    };
    tree.get_meta_data(includeUncommitted, completion);
    signal.wait_for_level();
}

void check_sibling_path(TreeType& tree,
                        index_t index,
                        fr_sibling_path expected_sibling_path,
                        bool includeUncommitted = true,
                        bool expected_result = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<GetSiblingPathResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_result);
        if (expected_result) {
            EXPECT_EQ(response.inner.path, expected_sibling_path);
        }
        signal.signal_level();
    };
    tree.get_sibling_path(index, completion, includeUncommitted);
    signal.wait_for_level();
}

void check_historic_sibling_path(TreeType& tree,
                                 index_t index,
                                 fr_sibling_path expected_sibling_path,
                                 index_t blockNumber)
{
    Signal signal;
    auto completion = [&](const TypedResponse<GetSiblingPathResponse>& response) -> void {
        EXPECT_EQ(response.success, true);
        EXPECT_EQ(response.inner.path, expected_sibling_path);
        signal.signal_level();
    };
    tree.get_sibling_path(index, blockNumber, completion, false);
    signal.wait_for_level();
}

void commit_tree(TreeType& tree, bool expected_success = true)
{
    Signal signal;
    auto completion = [&](const Response& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        signal.signal_level();
    };
    tree.commit(completion);
    signal.wait_for_level();
}

void rollback_tree(TreeType& tree)
{
    Signal signal;
    auto completion = [&](const Response& response) -> void {
        EXPECT_EQ(response.success, true);
        signal.signal_level();
    };
    tree.rollback(completion);
    signal.wait_for_level();
}

void add_value(TreeType& tree, const fr& value)
{
    Signal signal;
    auto completion = [&](const TypedResponse<AddDataResponse>& response) -> void {
        EXPECT_EQ(response.success, true);
        signal.signal_level();
    };

    tree.add_value(value, completion);
    signal.wait_for_level();
}

void add_values(TreeType& tree, const std::vector<fr>& values)
{
    Signal signal;
    auto completion = [&](const TypedResponse<AddDataResponse>& response) -> void {
        EXPECT_EQ(response.success, true);
        signal.signal_level();
    };

    tree.add_values(values, completion);
    signal.wait_for_level();
}

void check_find_leaf_index(
    TreeType& tree, const fr& leaf, index_t expected_index, bool expected_success, bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<FindLeafIndexResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            EXPECT_EQ(response.inner.leaf_index, expected_index);
        }
        signal.signal_level();
    };

    tree.find_leaf_index(leaf, includeUncommitted, completion);
    signal.wait_for_level();
}

void check_find_historic_leaf_index(TreeType& tree,
                                    const index_t& block_number,
                                    const fr& leaf,
                                    index_t expected_index,
                                    bool expected_success,
                                    bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<FindLeafIndexResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            EXPECT_EQ(response.inner.leaf_index, expected_index);
        }
        signal.signal_level();
    };

    tree.find_leaf_index(leaf, block_number, includeUncommitted, completion);
    signal.wait_for_level();
}

void check_find_historic_leaf_index_from(TreeType& tree,
                                         const index_t& block_number,
                                         const fr& leaf,
                                         index_t start_index,
                                         index_t expected_index,
                                         bool expected_success,
                                         bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<FindLeafIndexResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            EXPECT_EQ(response.inner.leaf_index, expected_index);
        }
        signal.signal_level();
    };

    tree.find_leaf_index_from(leaf, start_index, block_number, includeUncommitted, completion);
    signal.wait_for_level();
}

void check_find_leaf_index_from(TreeType& tree,
                                const fr& leaf,
                                index_t start_index,
                                index_t expected_index,
                                bool expected_success,
                                bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<FindLeafIndexResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            EXPECT_EQ(response.inner.leaf_index, expected_index);
        }
        signal.signal_level();
    };

    tree.find_leaf_index_from(leaf, start_index, includeUncommitted, completion);
    signal.wait_for_level();
}

void check_leaf(
    TreeType& tree, const fr& leaf, index_t leaf_index, bool expected_success, bool includeUncommitted = true)
{
    Signal signal;
    tree.get_leaf(leaf_index, includeUncommitted, [&](const TypedResponse<GetLeafResponse>& response) {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            EXPECT_EQ(response.inner.leaf, leaf);
        }
        signal.signal_level();
    });
    signal.wait_for_level();
}

void check_historic_leaf(TreeType& tree,
                         const index_t& blockNumber,
                         const fr& leaf,
                         index_t leaf_index,
                         bool expected_success,
                         bool includeUncommitted = true)
{
    Signal signal;
    tree.get_leaf(leaf_index, blockNumber, includeUncommitted, [&](const TypedResponse<GetLeafResponse>& response) {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            EXPECT_EQ(response.inner.leaf, leaf);
        }
        signal.signal_level();
    });
    signal.wait_for_level();
}

void check_sibling_path(fr expected_root, fr node, index_t index, fr_sibling_path sibling_path)
{
    fr left, right, hash = node;
    for (size_t i = 0; i < sibling_path.size(); ++i) {
        if (index % 2 == 0) {
            left = hash;
            right = sibling_path[i];
        } else {
            left = sibling_path[i];
            right = hash;
        }

        hash = Poseidon2HashPolicy::hash_pair(left, right);
        index >>= 1;
    }

    EXPECT_EQ(hash, expected_root);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_create)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    EXPECT_NO_THROW(Store store(name, depth, db));
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    check_size(tree, 0);
    check_root(tree, memdb.root());
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_only_recreate_with_same_name_and_depth)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

    EXPECT_ANY_THROW(Store store_wrong_name("Wrong name", depth, db));
    EXPECT_ANY_THROW(Store store_wrong_depth(name, depth + 1, db));
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_add_value_and_get_sibling_path)
{
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    check_size(tree, 0);
    check_root(tree, memdb.root());

    memdb.update_element(0, VALUES[0]);
    add_value(tree, VALUES[0]);

    check_size(tree, 1);
    check_root(tree, memdb.root());
    check_sibling_path(tree, 0, memdb.get_sibling_path(0));
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, reports_an_error_if_tree_is_overfilled)
{
    constexpr size_t depth = 4;
    std::string name = random_string();
    std::string directory = random_temp_directory();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);

    std::vector<fr> values;
    for (uint32_t i = 0; i < 16; i++) {
        values.push_back(VALUES[i]);
    }
    add_values(tree, values);

    Signal signal;
    auto add_completion = [&](const TypedResponse<AddDataResponse>& response) {
        EXPECT_EQ(response.success, false);
        EXPECT_EQ(response.message, "Tree is full");
        signal.signal_level();
    };
    tree.add_value(VALUES[16], add_completion);
    signal.wait_for_level();
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, errors_are_caught_and_handled)
{
    // We use a deep tree with a small amount of storage (100 * 1024) bytes
    constexpr size_t depth = 16;
    constexpr uint32_t numDbs = 4;
    std::string name = random_string();
    std::string directory = random_temp_directory();
    std::filesystem::create_directories(directory);

    {
        auto environment = std::make_unique<LMDBEnvironment>(directory, 50, numDbs, 2);
        LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, 50, _maxReaders);
        std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

        ThreadPoolPtr pool = make_thread_pool(1);
        TreeType tree(std::move(store), pool);
        MemoryTree<Poseidon2HashPolicy> memdb(depth);

        // check the committed data only, so we read from the db
        check_size(tree, 0, false);
        check_root(tree, memdb.root(), false);

        fr empty_root = memdb.root();

        // Add lots of values to the tree
        uint32_t num_values_to_add = 16 * 1024;
        std::vector<fr> values(num_values_to_add, VALUES[0]);
        for (uint32_t i = 0; i < num_values_to_add; i++) {
            memdb.update_element(i, VALUES[0]);
        }
        add_values(tree, values);

        // check the uncommitted data is accurate
        check_size(tree, num_values_to_add, true);
        check_root(tree, memdb.root(), true);

        // trying to commit that should fail
        Signal signal;
        auto completion = [&](const Response& response) -> void {
            EXPECT_EQ(response.success, false);
            signal.signal_level();
        };

        tree.commit(completion);
        signal.wait_for_level();

        // At this stage, the tree is still in an uncommited state despite the error
        // Reading both committed and uncommitted data shold be ok

        // check the uncommitted data is accurate
        check_size(tree, num_values_to_add, true);
        check_root(tree, memdb.root(), true);

        // Reading committed data should still work
        check_size(tree, 0, false);
        check_root(tree, empty_root, false);

        // Now rollback the tree
        rollback_tree(tree);

        // committed and uncommitted data should be as an empty tree
        check_size(tree, 0, true);
        check_root(tree, empty_root, true);

        // Reading committed data should still work
        check_size(tree, 0, false);
        check_root(tree, empty_root, false);
    }

    {
        auto environment = std::make_unique<LMDBEnvironment>(directory, 500, numDbs, 2);
        LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, 500, _maxReaders);
        std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

        ThreadPoolPtr pool = make_thread_pool(1);
        TreeType tree(std::move(store), pool);
        MemoryTree<Poseidon2HashPolicy> memdb(depth);

        fr empty_root = memdb.root();

        // committed and uncommitted data should be as an empty tree
        check_size(tree, 0, true);
        check_root(tree, empty_root, true);

        // Reading committed data should still work
        check_size(tree, 0, false);
        check_root(tree, empty_root, false);

        // Now add a single value and commit it
        add_value(tree, VALUES[0]);

        commit_tree(tree);

        MemoryTree<Poseidon2HashPolicy> memdb2(depth);
        memdb2.update_element(0, VALUES[0]);

        // committed and uncommitted data should be equal to the tree with 1 item
        check_size(tree, 1, true);
        check_root(tree, memdb2.root(), true);

        // Reading committed data should still work
        check_size(tree, 1, false);
        check_root(tree, memdb2.root(), false);
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_commit_and_restore)
{
    constexpr size_t depth = 5;
    std::string name = random_string();
    MemoryTree<Poseidon2HashPolicy> memdb(depth);
    {
        LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
        std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

        ThreadPoolPtr pool = make_thread_pool(1);
        TreeType tree(std::move(store), pool);

        check_size(tree, 0);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));

        bb::fr initial_root = memdb.root();
        fr_sibling_path initial_sibling_path = memdb.get_sibling_path(0);
        memdb.update_element(0, VALUES[0]);
        add_value(tree, VALUES[0]);

        // check uncommitted state
        check_size(tree, 1);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));

        // check committed state
        check_size(tree, 0, false);
        check_root(tree, initial_root, false);
        check_sibling_path(tree, 0, initial_sibling_path, false);

        // commit the changes
        commit_tree(tree);
        // now committed and uncommitted should be the same

        // check uncommitted state
        check_size(tree, 1);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));

        // check committed state
        check_size(tree, 1, false);
        check_root(tree, memdb.root(), false);
        check_sibling_path(tree, 0, memdb.get_sibling_path(0), false);
    }

    // Re-create the store and tree, it should be the same as how we left it
    {
        LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
        std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

        ThreadPoolPtr pool = make_thread_pool(1);
        TreeType tree(std::move(store), pool);

        // check uncommitted state
        check_size(tree, 1);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));

        // check committed state
        check_size(tree, 1, false);
        check_root(tree, memdb.root(), false);
        check_sibling_path(tree, 0, memdb.get_sibling_path(0), false);
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, test_size)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);

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

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, test_find_leaf_index)
{
    constexpr size_t depth = 5;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);

    add_value(tree, 30);
    add_value(tree, 10);
    add_value(tree, 20);
    add_value(tree, 40);

    // check the committed state and that the uncommitted state is empty
    check_find_leaf_index(tree, 10, 1, true, true);
    check_find_leaf_index(tree, 10, 0, false, false);

    check_find_leaf_index(tree, 15, 0, false, true);
    check_find_leaf_index(tree, 15, 0, false, false);

    check_find_leaf_index(tree, 40, 3, true, true);
    check_find_leaf_index(tree, 30, 0, true, true);
    check_find_leaf_index(tree, 20, 2, true, true);

    check_find_leaf_index(tree, 40, 0, false, false);
    check_find_leaf_index(tree, 30, 0, false, false);
    check_find_leaf_index(tree, 20, 0, false, false);

    commit_tree(tree);

    std::vector<fr> values{ 15, 18, 26, 2 };
    add_values(tree, values);

    // check the now committed state
    check_find_leaf_index(tree, 40, 3, true, false);
    check_find_leaf_index(tree, 30, 0, true, false);
    check_find_leaf_index(tree, 20, 2, true, false);

    // check the new uncommitted state
    check_find_leaf_index(tree, 18, 5, true, true);
    check_find_leaf_index(tree, 18, 0, false, false);

    commit_tree(tree);

    values = { 16, 4, 18, 22 };
    add_values(tree, values);

    // we now have duplicate leaf 18, one committed the other not
    check_find_leaf_index(tree, 18, 5, true, true);
    check_find_leaf_index(tree, 18, 5, true, false);

    // verify the find index from api
    check_find_leaf_index_from(tree, 18, 0, 5, true, true);
    check_find_leaf_index_from(tree, 18, 6, 10, true, true);
    check_find_leaf_index_from(tree, 18, 6, 0, false, false);

    commit_tree(tree);

    // add another leaf 18
    add_value(tree, 18);

    // should return the first index
    check_find_leaf_index_from(tree, 18, 0, 5, true, false);
    check_find_leaf_index_from(tree, 18, 0, 5, true, true);

    add_value(tree, 88);
    // and another uncommitted 18
    add_value(tree, 18);

    add_value(tree, 32);

    // should return the first uncommitted
    check_find_leaf_index_from(tree, 18, 12, 12, true, true);
    check_find_leaf_index_from(tree, 18, 14, 14, true, true);
    check_find_leaf_index_from(tree, 18, 15, 0, false, true);

    // look past the last instance of this leaf
    check_find_leaf_index_from(tree, 18, 17, 0, false, true);

    // look beyond the end of uncommitted
    check_find_leaf_index_from(tree, 18, 18, 0, false, true);

    // look beyond the end of committed and don't include uncomitted
    check_find_leaf_index_from(tree, 18, 14, 0, false, false);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_add_multiple_values)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    for (size_t i = 0; i < NUM_VALUES; ++i) {
        fr mock_root = memdb.update_element(i, VALUES[i]);
        add_value(tree, VALUES[i]);
        check_root(tree, mock_root);

        check_sibling_path(tree, 0, memdb.get_sibling_path(0));
        check_sibling_path(tree, i, memdb.get_sibling_path(i));
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_add_multiple_values_in_a_batch)
{
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    std::vector<fr> to_add;

    for (size_t i = 0; i < 4; ++i) {
        memdb.update_element(i, VALUES[i]);
        to_add.push_back(VALUES[i]);
    }
    add_values(tree, to_add);
    check_size(tree, 4);
    check_root(tree, memdb.root());
    check_sibling_path(tree, 0, memdb.get_sibling_path(0));
    check_sibling_path(tree, 4 - 1, memdb.get_sibling_path(4 - 1));
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_commit_multiple_blocks)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    auto check = [&](index_t expected_size, index_t expected_unfinalised_block_height) {
        check_size(tree, expected_size);
        check_unfinalised_block_height(tree, expected_unfinalised_block_height);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));
        check_sibling_path(tree, expected_size - 1, memdb.get_sibling_path(expected_size - 1));
    };

    constexpr uint32_t num_blocks = 10;
    constexpr uint32_t batch_size = 4;
    for (uint32_t i = 0; i < num_blocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < batch_size; ++j) {
            size_t ind = i * batch_size + j;
            memdb.update_element(ind, VALUES[ind]);
            to_add.push_back(VALUES[ind]);
        }
        index_t expected_size = (i + 1) * batch_size;
        add_values(tree, to_add);
        check(expected_size, i);
        commit_tree(tree);
        check(expected_size, i + 1);
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_add_varying_size_blocks)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    auto check = [&](index_t expected_size, index_t expected_unfinalised_block_height) {
        check_size(tree, expected_size);
        check_unfinalised_block_height(tree, expected_unfinalised_block_height);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));
        check_sibling_path(tree, expected_size - 1, memdb.get_sibling_path(expected_size - 1));
    };

    std::vector<size_t> batchSize = { 8, 20, 64, 32 };
    index_t expected_size = 0;

    for (uint32_t i = 0; i < batchSize.size(); i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < batchSize[i]; ++j) {
            size_t ind = expected_size + j;
            memdb.update_element(ind, VALUES[ind]);
            to_add.push_back(VALUES[ind]);
        }
        expected_size += batchSize[i];
        add_values(tree, to_add);
        check(expected_size, i);
        commit_tree(tree);
        check(expected_size, i + 1);
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_retrieve_historic_sibling_paths)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    constexpr uint32_t num_blocks = 10;
    constexpr uint32_t batch_size = 4;

    std::vector<fr_sibling_path> historicPathsZeroIndex;
    std::vector<fr_sibling_path> historicPathsMaxIndex;

    auto check = [&](index_t expected_size, index_t expected_unfinalised_block_height) {
        check_size(tree, expected_size);
        check_unfinalised_block_height(tree, expected_unfinalised_block_height);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));
        check_sibling_path(tree, expected_size - 1, memdb.get_sibling_path(expected_size - 1));

        for (uint32_t i = 0; i < historicPathsZeroIndex.size(); i++) {
            check_historic_sibling_path(tree, 0, historicPathsZeroIndex[i], i + 1);
            index_t maxSizeAtBlock = ((i + 1) * batch_size) - 1;
            check_historic_sibling_path(tree, maxSizeAtBlock, historicPathsMaxIndex[i], i + 1);
        }
    };

    for (uint32_t i = 0; i < num_blocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < batch_size; ++j) {
            size_t ind = i * batch_size + j;
            memdb.update_element(ind, VALUES[ind]);
            to_add.push_back(VALUES[ind]);
        }
        index_t expected_size = (i + 1) * batch_size;
        add_values(tree, to_add);
        check(expected_size, i);
        commit_tree(tree);
        check(expected_size, i + 1);
        historicPathsZeroIndex.push_back(memdb.get_sibling_path(0));
        historicPathsMaxIndex.push_back(memdb.get_sibling_path(expected_size - 1));
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, retrieves_historic_leaves)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    constexpr uint32_t num_blocks = 10;
    constexpr uint32_t batch_size = 4;

    for (uint32_t i = 0; i < num_blocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < batch_size; ++j) {
            size_t ind = i * batch_size + j;
            memdb.update_element(ind, VALUES[ind]);
            to_add.push_back(VALUES[ind]);
        }
        add_values(tree, to_add);
        commit_tree(tree);
    }

    for (uint32_t i = 0; i < num_blocks; i++) {
        for (uint32_t j = 0; j < num_blocks; j++) {
            index_t indexToQuery = j * batch_size;
            fr expectedLeaf = j <= i ? VALUES[indexToQuery] : fr::zero();
            check_historic_leaf(tree, i + 1, expectedLeaf, indexToQuery, j <= i, false);
        }
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, test_find_historic_leaf_index)
{
    constexpr size_t depth = 5;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);

    std::vector<fr> values{ 30, 10, 20, 40 };
    add_values(tree, values);

    commit_tree(tree);

    values = { 15, 18, 26, 2 };
    add_values(tree, values);

    commit_tree(tree);

    values = { 16, 4, 18, 22 };
    add_values(tree, values);

    // should not be present at block 1
    check_find_historic_leaf_index(tree, 1, 26, 0, false);
    // should be present at block 2
    check_find_historic_leaf_index(tree, 2, 26, 6, true);

    // at block 1 leaf 18 should not be found if only considering committed
    check_find_historic_leaf_index_from(tree, 1, 18, 2, 0, false, false);
    // at block 2 it should be
    check_find_historic_leaf_index_from(tree, 2, 18, 2, 5, true);
    // at block 2, from index 6 it should not be found if looking only at committed
    check_find_historic_leaf_index_from(tree, 2, 18, 6, 5, false, false);
    // at block 2, from index 6 it should be found if looking at uncommitted too
    check_find_historic_leaf_index_from(tree, 2, 18, 6, 10, true);

    commit_tree(tree);

    // at block 3, from index 6 it should now be found in committed only
    check_find_historic_leaf_index_from(tree, 3, 18, 6, 10, true, false);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_be_filled)
{
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    check_size(tree, 0);
    check_root(tree, memdb.root());

    for (size_t i = 0; i < 8; i++) {
        memdb.update_element(i, VALUES[i]);
        add_value(tree, VALUES[i]);
    }

    check_root(tree, memdb.root());
    check_sibling_path(tree, 0, memdb.get_sibling_path(0));
    check_sibling_path(tree, 7, memdb.get_sibling_path(7));
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_add_single_whilst_reading)
{
    constexpr size_t depth = 10;
    MemoryTree<Poseidon2HashPolicy> memdb(depth);
    fr_sibling_path initial_path = memdb.get_sibling_path(0);
    memdb.update_element(0, VALUES[0]);
    fr_sibling_path final_sibling_path = memdb.get_sibling_path(0);

    uint32_t num_reads = 16 * 1024;
    std::vector<fr_sibling_path> paths(num_reads);

    {
        std::string name = random_string();
        LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
        std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
        ThreadPoolPtr pool = make_thread_pool(8);
        TreeType tree(std::move(store), pool);

        check_size(tree, 0);

        Signal signal(1 + num_reads);

        auto add_completion = [&](const TypedResponse<AddDataResponse>&) {
            auto commit_completion = [&](const Response&) { signal.signal_decrement(); };
            tree.commit(commit_completion);
        };
        tree.add_value(VALUES[0], add_completion);

        for (size_t i = 0; i < num_reads; i++) {
            auto completion = [&, i](const TypedResponse<GetSiblingPathResponse>& response) {
                paths[i] = response.inner.path;
                signal.signal_decrement();
            };
            tree.get_sibling_path(0, completion, false);
        }
        signal.wait_for_level(0);
    }

    for (auto& path : paths) {
        EXPECT_TRUE(path == initial_path || path == final_sibling_path);
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_get_inserted_leaves)
{
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);

    add_values(tree, { 30, 10, 20, 40 });

    check_leaf(tree, 30, 0, true);
    check_leaf(tree, 10, 1, true);
    check_leaf(tree, 20, 2, true);
    check_leaf(tree, 40, 3, true);

    check_leaf(tree, 0, 4, false);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, returns_sibling_path)
{
    constexpr size_t depth = 4;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    add_values(tree, { 30, 10, 20, 40 });
    memdb.update_element(0, 30);
    memdb.update_element(1, 10);
    memdb.update_element(2, 20);
    memdb.update_element(3, 40);

    {
        Signal signal(1);
        tree.get_subtree_sibling_path(
            0,
            [&](auto& resp) {
                fr_sibling_path expected_sibling_path = memdb.get_sibling_path(4);
                EXPECT_EQ(resp.inner.path, expected_sibling_path);
                signal.signal_level();
            },
            true);
        signal.wait_for_level();
    }

    {
        Signal signal(1);
        tree.get_subtree_sibling_path(
            2,
            [&](auto& resp) {
                fr_sibling_path expected_sibling_path = { memdb.get_node(2, 0), memdb.get_node(1, 1) };
                EXPECT_EQ(resp.inner.path, expected_sibling_path);
                signal.signal_level();
            },
            true);
        signal.wait_for_level();
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_create_images_at_historic_blocks)
{
    constexpr size_t depth = 5;
    std::string name = random_string();
    ThreadPoolPtr pool = make_thread_pool(1);
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);
    size_t index = 0;

    std::unique_ptr<Store> store1 = std::make_unique<Store>(name, depth, db);
    TreeType tree1(std::move(store1), pool);

    std::vector<fr> values{ 30, 10, 20, 40 };
    add_values(tree1, values);
    for (auto v : values) {
        memdb.update_element(index++, v);
    }

    commit_tree(tree1);

    fr_sibling_path block1SiblingPathIndex3 = memdb.get_sibling_path(3);

    values = { 15, 18, 26, 2 };
    add_values(tree1, values);
    for (auto v : values) {
        memdb.update_element(index++, v);
    }

    commit_tree(tree1);

    fr block2Root = memdb.root();

    fr_sibling_path block2SiblingPathIndex7 = memdb.get_sibling_path(7);
    fr_sibling_path block2SiblingPathIndex3 = memdb.get_sibling_path(3);

    values = { 16, 4, 18, 22 };
    add_values(tree1, values);
    for (auto v : values) {
        memdb.update_element(index++, v);
    }

    commit_tree(tree1);

    fr_sibling_path block3SiblingPathIndex11 = memdb.get_sibling_path(11);
    fr_sibling_path block3SiblingPathIndex7 = memdb.get_sibling_path(7);
    fr_sibling_path block3SiblingPathIndex3 = memdb.get_sibling_path(3);

    // Create a new image at block 2
    std::unique_ptr<Store> storeAtBlock2 = std::make_unique<Store>(name, depth, 2, db);
    TreeType treeAtBlock2(std::move(storeAtBlock2), pool);

    check_root(treeAtBlock2, block2Root);
    check_sibling_path(treeAtBlock2, 3, block2SiblingPathIndex3, false, true);
    check_leaf(treeAtBlock2, 20, 2, true);
    check_find_leaf_index(treeAtBlock2, 10, 1, true);
    check_find_leaf_index_from(treeAtBlock2, 15, 1, 4, true);

    // should not exist in our image
    check_leaf(treeAtBlock2, 4, 9, false);
    check_find_leaf_index(treeAtBlock2, 4, 0, false);

    // now add the same values to our image
    add_values(treeAtBlock2, values);

    // the state of our image should match the original tree
    check_sibling_path(tree1, 3, block3SiblingPathIndex3, false, true);
    check_sibling_path(tree1, 7, block3SiblingPathIndex7, false, true);

    //  needs to use uncommitted for this check
    check_sibling_path(treeAtBlock2, 3, block3SiblingPathIndex3, true, true);
    check_sibling_path(treeAtBlock2, 7, block3SiblingPathIndex7, true, true);

    // now check historic data
    check_historic_sibling_path(treeAtBlock2, 3, block1SiblingPathIndex3, 1);
    check_find_historic_leaf_index(treeAtBlock2, 1, 10, 1, true);
    check_find_historic_leaf_index(treeAtBlock2, 2, 16, 8, true, true);
    check_find_historic_leaf_index(treeAtBlock2, 2, 16, 8, false, false);

    check_find_historic_leaf_index_from(treeAtBlock2, 1, 18, 3, 0, false, false);
    check_find_historic_leaf_index_from(treeAtBlock2, 1, 20, 0, 2, true, false);

    check_unfinalised_block_height(treeAtBlock2, 2);

    // It should be impossible to commit using the image
    commit_tree(treeAtBlock2, false);
}
