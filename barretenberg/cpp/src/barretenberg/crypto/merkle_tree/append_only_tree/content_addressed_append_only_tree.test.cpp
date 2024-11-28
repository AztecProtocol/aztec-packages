#include "barretenberg/crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp"
#include "../fixtures.hpp"
#include "../memory_tree.hpp"
#include "../test_fixtures.hpp"
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
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <gtest/gtest.h>
#include <memory>
#include <stdexcept>
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

void check_finalised_block_height(TreeType& tree, index_t expected_finalised_block)
{
    Signal signal;
    auto completion = [&](const TypedResponse<TreeMetaResponse>& response) -> void {
        EXPECT_EQ(response.success, true);
        EXPECT_EQ(response.inner.meta.finalisedBlockHeight, expected_finalised_block);
        signal.signal_level();
    };
    tree.get_meta_data(false, completion);
    signal.wait_for_level();
}

void check_block_height(TreeType& tree, index_t expected_block_height)
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
                                 index_t blockNumber,
                                 bool expected_success = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<GetSiblingPathResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            EXPECT_EQ(response.inner.path, expected_sibling_path);
        }
        signal.signal_level();
    };
    tree.get_sibling_path(index, blockNumber, completion, false);
    signal.wait_for_level();
}

void commit_tree(TreeType& tree, bool expected_success = true)
{
    Signal signal;
    TreeType::CommitCallback completion = [&](const TypedResponse<CommitResponse>& response) -> void {
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

void remove_historic_block(TreeType& tree, const index_t& blockNumber, bool expected_success = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<RemoveHistoricResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        signal.signal_level();
    };
    tree.remove_historic_block(blockNumber, completion);
    signal.wait_for_level();
}

void unwind_block(TreeType& tree, const index_t& blockNumber, bool expected_success = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<UnwindResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        signal.signal_level();
    };
    tree.unwind_block(blockNumber, completion);
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

void finalise_block(TreeType& tree, const index_t& blockNumber, bool expected_success = true)
{
    Signal signal;
    auto completion = [&](const Response& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (!response.success && expected_success) {
            std::cout << response.message << std::endl;
        }
        signal.signal_level();
    };
    tree.finalise_block(blockNumber, completion);
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
    fr left;
    fr right;
    fr hash = node;
    for (const auto& i : sibling_path) {
        if (index % 2 == 0) {
            left = hash;
            right = i;
        } else {
            left = i;
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

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, committing_with_no_changes_should_succeed)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    EXPECT_NO_THROW(Store store(name, depth, db));
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    add_value(tree, VALUES[0]);
    memdb.update_element(0, VALUES[0]);

    commit_tree(tree, true);
    check_root(tree, memdb.root());
    check_size(tree, 1, false);
    commit_tree(tree, true);
    check_root(tree, memdb.root());
    check_size(tree, 1, false);
    // rollbacks should do nothing
    rollback_tree(tree);
    check_root(tree, memdb.root());
    check_size(tree, 1, false);
    add_value(tree, VALUES[1]);

    // committed should be the same
    check_root(tree, memdb.root(), false);
    check_size(tree, 1, false);

    // rollback
    rollback_tree(tree);
    // commit should do nothing
    commit_tree(tree, true);
    check_root(tree, memdb.root());
    check_size(tree, 1, false);
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

    std::stringstream ss;
    ss << "Unable to append leaves to tree " << name << " new size: 17 max size: 16";

    Signal signal;
    auto add_completion = [&](const TypedResponse<AddDataResponse>& response) {
        EXPECT_EQ(response.success, false);
        EXPECT_EQ(response.message, ss.str());
        signal.signal_level();
    };
    tree.add_value(VALUES[16], add_completion);
    signal.wait_for_level();
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, errors_are_caught_and_handled)
{
    // We use a deep tree with a small amount of storage (100 * 1024) bytes
    constexpr size_t depth = 16;
    std::string name = random_string();
    std::string directory = random_temp_directory();
    std::filesystem::create_directories(directory);
    auto& random_engine = numeric::get_randomness();

    {
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
        std::vector<fr> values;
        for (uint32_t i = 0; i < num_values_to_add; i++) {
            values.emplace_back(random_engine.get_random_uint256());
            memdb.update_element(i, values[i]);
        }
        add_values(tree, values);

        // check the uncommitted data is accurate
        check_size(tree, num_values_to_add, true);
        check_root(tree, memdb.root(), true);

        // trying to commit that should fail
        Signal signal;
        auto completion = [&](const TypedResponse<CommitResponse>& response) -> void {
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

        check_block_and_root_data(db, 1, memdb.root(), true);
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

        check_block_and_root_data(db, 1, memdb.root(), true);

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

    values = { 16, 4, 19, 22 };
    add_values(tree, values);

    // verify the find index from api
    check_find_leaf_index_from(tree, 18, 0, 5, true, true);
    check_find_leaf_index_from(tree, 19, 6, 10, true, true);
    check_find_leaf_index_from(tree, 19, 0, 0, false, false);

    commit_tree(tree);

    add_value(tree, 88);

    add_value(tree, 32);

    check_size(tree, 14);
    check_size(tree, 12, false);

    // look past the last instance of this leaf
    check_find_leaf_index_from(tree, 18, 6, 0, false, true);

    // look beyond the end of uncommitted
    check_find_leaf_index_from(tree, 18, 15, 0, false, true);

    // look beyond the end of committed and don't include uncomitted
    check_find_leaf_index_from(tree, 88, 13, 0, false, false);
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

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_pad_with_zero_leaves)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    std::vector<fr> to_add(32, fr::zero());
    to_add[0] = VALUES[0];

    for (size_t i = 0; i < 32; ++i) {
        memdb.update_element(i, to_add[i]);
    }
    add_values(tree, to_add);
    check_size(tree, 32);
    check_root(tree, memdb.root());

    commit_tree(tree, true);

    check_size(tree, 32);
    check_root(tree, memdb.root());
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_not_retrieve_zero_leaf_indices)
{
    constexpr size_t depth = 8;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    std::vector<fr> to_add(32, fr::zero());
    to_add[0] = VALUES[0];

    for (size_t i = 0; i < 32; ++i) {
        memdb.update_element(i, VALUES[i]);
    }
    add_values(tree, to_add);
    commit_tree(tree);
    fr leaf = fr::zero();
    check_find_leaf_index(tree, leaf, 0, false);
    check_find_historic_leaf_index(tree, 1, leaf, 0, false);
    check_find_leaf_index_from(tree, leaf, 0, 0, false);
    check_find_historic_leaf_index_from(tree, 1, leaf, 0, 0, false);
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
        check_block_height(tree, expected_unfinalised_block_height);
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
        check_block_and_root_data(db, 1 + i, memdb.root(), true);
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
        check_block_height(tree, expected_unfinalised_block_height);
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
        check_block_and_root_data(db, 1 + i, memdb.root(), true);
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
        check_block_height(tree, expected_unfinalised_block_height);
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

    values = { 16, 4, 19, 22 };
    add_values(tree, values);

    // should not be present at block 1
    check_find_historic_leaf_index(tree, 1, 26, 0, false);
    // should be present at block 2
    check_find_historic_leaf_index(tree, 2, 26, 6, true);

    // at block 1 leaf 18 should not be found if only considering committed
    check_find_historic_leaf_index_from(tree, 1, 18, 2, 0, false, false);
    // at block 2 it should be
    check_find_historic_leaf_index_from(tree, 2, 18, 2, 5, true);
    // at block 2, from index 6, 19 should not be found if looking only at committed
    check_find_historic_leaf_index_from(tree, 2, 19, 6, 5, false, false);
    // at block 2, from index 6, 19 should be found if looking at uncommitted too
    check_find_historic_leaf_index_from(tree, 2, 19, 6, 10, true);

    commit_tree(tree);

    // at block 3, from index 6, should now be found in committed only
    check_find_historic_leaf_index_from(tree, 3, 19, 6, 10, true, false);
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
            auto commit_completion = [&](const TypedResponse<CommitResponse>&) { signal.signal_decrement(); };
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

    check_block_and_root_data(db, 1, memdb.root(), true);

    fr_sibling_path block1SiblingPathIndex3 = memdb.get_sibling_path(3);

    values = { 15, 18, 26, 2 };
    add_values(tree1, values);
    for (auto v : values) {
        memdb.update_element(index++, v);
    }

    commit_tree(tree1);

    check_block_and_root_data(db, 2, memdb.root(), true);

    fr block2Root = memdb.root();

    fr_sibling_path block2SiblingPathIndex7 = memdb.get_sibling_path(7);
    fr_sibling_path block2SiblingPathIndex3 = memdb.get_sibling_path(3);

    values = { 16, 4, 18, 22 };
    add_values(tree1, values);
    for (auto v : values) {
        memdb.update_element(index++, v);
    }

    commit_tree(tree1);

    check_block_and_root_data(db, 3, memdb.root(), true);

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

    check_block_height(treeAtBlock2, 2);

    // It should be impossible to commit using the image
    commit_tree(treeAtBlock2, false);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_remove_historic_block_data)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    constexpr uint32_t numBlocks = 50;
    constexpr uint32_t batchSize = 16;
    constexpr uint32_t windowSize = 8;

    std::vector<fr_sibling_path> historicPathsZeroIndex;
    std::vector<fr_sibling_path> historicPathsMaxIndex;
    std::vector<fr> roots;

    auto check = [&](index_t expectedSize, index_t expectedBlockHeight) {
        check_size(tree, expectedSize);
        check_block_height(tree, expectedBlockHeight);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));
        check_sibling_path(tree, expectedSize - 1, memdb.get_sibling_path(expectedSize - 1));

        for (uint32_t i = 0; i < historicPathsZeroIndex.size(); i++) {
            // retrieving historic data should fail if the block is outside of the window
            const index_t blockNumber = i + 1;
            const bool expectedSuccess =
                expectedBlockHeight <= windowSize || blockNumber > (expectedBlockHeight - windowSize);
            check_historic_sibling_path(tree, 0, historicPathsZeroIndex[i], blockNumber, expectedSuccess);
            index_t maxSizeAtBlock = ((i + 1) * batchSize) - 1;
            check_historic_sibling_path(tree, maxSizeAtBlock, historicPathsMaxIndex[i], blockNumber, expectedSuccess);

            const index_t leafIndex = 6;
            check_historic_leaf(tree, blockNumber, VALUES[leafIndex], leafIndex, expectedSuccess);
            check_find_historic_leaf_index(tree, blockNumber, VALUES[leafIndex], leafIndex, expectedSuccess);
            check_find_historic_leaf_index_from(tree, blockNumber, VALUES[leafIndex], 0, leafIndex, expectedSuccess);
        }
    };

    for (uint32_t i = 0; i < numBlocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < batchSize; ++j) {
            size_t ind = i * batchSize + j;
            memdb.update_element(ind, VALUES[ind]);
            to_add.push_back(VALUES[ind]);
        }
        index_t expected_size = (i + 1) * batchSize;
        add_values(tree, to_add);
        check(expected_size, i);
        commit_tree(tree);

        // immediately finalise the block
        finalise_block(tree, i + 1);

        historicPathsZeroIndex.push_back(memdb.get_sibling_path(0));
        historicPathsMaxIndex.push_back(memdb.get_sibling_path(expected_size - 1));
        roots.push_back(memdb.root());

        // Now remove the oldest block if outside of the window
        if (i >= windowSize) {
            const index_t oldestBlock = (i + 1) - windowSize;
            // trying to remove a block that is not the most historic should fail
            remove_historic_block(tree, oldestBlock + 1, false);

            fr rootToRemove = roots[oldestBlock - 1];
            check_block_and_root_data(db, oldestBlock, rootToRemove, true);

            // removing the most historic should succeed
            remove_historic_block(tree, oldestBlock, true);

            // the block data should have been removed
            check_block_and_root_data(db, oldestBlock, rootToRemove, false);
        }
        check(expected_size, i + 1);
    }

    // Attempting to remove block 0 should fail as there isn't one
    remove_historic_block(tree, 0, false);
}

void test_unwind(std::string directory,
                 std::string name,
                 uint64_t mapSize,
                 uint64_t maxReaders,
                 uint32_t depth,
                 uint32_t blockSize,
                 uint32_t numBlocks,
                 uint32_t numBlocksToUnwind,
                 std::vector<fr> values)
{
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(directory, name, mapSize, maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    uint32_t batchSize = blockSize;

    std::vector<fr_sibling_path> historicPathsZeroIndex;
    std::vector<fr_sibling_path> historicPathsMaxIndex;
    std::vector<fr> roots;

    fr initialRoot = memdb.root();
    fr_sibling_path initialPath = memdb.get_sibling_path(0);

    for (uint32_t i = 0; i < numBlocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < batchSize; ++j) {
            size_t ind = i * batchSize + j;
            memdb.update_element(ind, values[ind]);
            to_add.push_back(values[ind]);
        }
        index_t expected_size = (i + 1) * batchSize;
        add_values(tree, to_add);

        // attempting an unwind of the block being built should fail
        unwind_block(tree, i + 1, false);

        if (i > 0) {
            // attemnpting an unwind of the most recent committed block should fail as we have uncommitted changes
            unwind_block(tree, i, false);
        }

        commit_tree(tree);

        historicPathsZeroIndex.push_back(memdb.get_sibling_path(0));
        historicPathsMaxIndex.push_back(memdb.get_sibling_path(expected_size - 1));
        roots.push_back(memdb.root());
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));
        check_sibling_path(tree, expected_size - 1, memdb.get_sibling_path(expected_size - 1));
        check_size(tree, expected_size);
        check_block_and_size_data(db, i + 1, expected_size, true);
        check_block_and_root_data(db, i + 1, memdb.root(), true);
    }

    const uint32_t blocksToRemove = numBlocksToUnwind;
    for (uint32_t i = 0; i < blocksToRemove; i++) {
        const index_t blockNumber = numBlocks - i;

        check_block_and_root_data(db, blockNumber, roots[blockNumber - 1], true);
        // attempting to unwind a block that is not the tip should fail
        unwind_block(tree, blockNumber + 1, false);
        unwind_block(tree, blockNumber);

        // the root should now only exist if there are other blocks with same root
        const auto last = roots.begin() + long(blockNumber - 1);
        const auto it =
            std::find_if(roots.begin(), last, [=](const fr& r) -> bool { return r == roots[blockNumber - 1]; });
        check_block_and_root_data(db, blockNumber, roots[blockNumber - 1], false, it != last);

        const index_t previousValidBlock = blockNumber - 1;
        index_t deletedBlockStartIndex = previousValidBlock * batchSize;

        check_block_height(tree, previousValidBlock);
        check_size(tree, deletedBlockStartIndex);
        check_root(tree, previousValidBlock == 0 ? initialRoot : roots[previousValidBlock - 1]);

        // The zero index sibling path should be as it was at the previous block
        check_sibling_path(tree,
                           0,
                           previousValidBlock == 0 ? initialPath : historicPathsZeroIndex[previousValidBlock - 1],
                           false,
                           true);

        // Trying to find leaves appended in the block that was removed should fail
        check_leaf(tree, values[1 + deletedBlockStartIndex], 1 + deletedBlockStartIndex, false);
        check_find_leaf_index(tree, values[1 + deletedBlockStartIndex], 1 + deletedBlockStartIndex, false);

        for (index_t j = 0; j < numBlocks; j++) {
            index_t historicBlockNumber = j + 1;
            bool expectedSuccess = historicBlockNumber <= previousValidBlock;
            check_historic_sibling_path(tree, 0, historicPathsZeroIndex[j], historicBlockNumber, expectedSuccess);
            index_t maxSizeAtBlock = ((j + 1) * batchSize) - 1;
            check_historic_sibling_path(
                tree, maxSizeAtBlock, historicPathsMaxIndex[j], historicBlockNumber, expectedSuccess);

            const index_t leafIndex = 1;
            check_historic_leaf(tree, historicBlockNumber, values[leafIndex], leafIndex, expectedSuccess);

            // find historic leaves, provided they are not zero leaves
            check_find_historic_leaf_index(tree,
                                           historicBlockNumber,
                                           values[leafIndex],
                                           leafIndex,
                                           expectedSuccess && values[leafIndex] != fr::zero());
            check_find_historic_leaf_index_from(tree,
                                                historicBlockNumber,
                                                values[leafIndex],
                                                0,
                                                leafIndex,
                                                expectedSuccess && values[leafIndex] != fr::zero());
        }
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_unwind_blocks)
{
    std::vector<fr> first = create_values(1024);
    test_unwind(_directory, "DB", _mapSize, _maxReaders, 10, 16, 16, 8, first);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_unwind_all_blocks)
{
    std::vector<fr> first = create_values(1024);
    test_unwind(_directory, "DB", _mapSize, _maxReaders, 10, 16, 16, 16, first);
    std::vector<fr> second = create_values(1024);
    test_unwind(_directory, "DB", _mapSize, _maxReaders, 10, 16, 16, 16, second);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_unwind_initial_blocks_that_are_empty)
{
    const size_t block_size = 16;
    // First we add 16 blocks worth pf zero leaves and unwind them all
    std::vector<fr> first(1024, fr::zero());
    test_unwind(_directory, "DB", _mapSize, _maxReaders, 10, block_size, 16, 16, first);
    // now we add 1 block of zero leaves and the other blocks non-zero leaves and unwind them all
    std::vector<fr> second = create_values(1024);
    // set the first 16 values to be zeros
    for (size_t i = 0; i < block_size; i++) {
        second[i] = fr::zero();
    }
    test_unwind(_directory, "DB", _mapSize, _maxReaders, 10, block_size, 16, 16, second);

    // now we add 2 block of zero leaves in the middle and the other blocks non-zero leaves and unwind them all
    std::vector<fr> third = create_values(1024);
    size_t offset = block_size * 2;
    for (size_t i = 0; i < block_size * 2; i++) {
        third[i + offset] = fr::zero();
    }
    test_unwind(_directory, "DB", _mapSize, _maxReaders, 10, block_size, 16, 16, third);

    // Now we add a number of regular blocks and unwind
    std::vector<fr> fourth = create_values(1024);
    test_unwind(_directory, "DB", _mapSize, _maxReaders, 10, block_size, 16, 16, fourth);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_sync_and_unwind_large_blocks)
{

    constexpr uint32_t numBlocks = 4;
    constexpr uint32_t numBlocksToUnwind = 2;
    std::vector<uint32_t> blockSizes = { 2, 4, 8, 16, 32 };
    for (const uint32_t& size : blockSizes) {
        uint32_t actualSize = size * 1024;
        std::vector<fr> values = create_values(actualSize * numBlocks);
        std::stringstream ss;
        ss << "DB " << actualSize;
        test_unwind(_directory, ss.str(), _mapSize, _maxReaders, 20, actualSize, numBlocks, numBlocksToUnwind, values);
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_advance_finalised_blocks)
{
    std::string name = random_string();
    constexpr uint32_t depth = 10;
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    uint32_t blockSize = 16;
    uint32_t numBlocks = 16;
    uint32_t finalisedBlockDelay = 4;
    std::vector<fr> values = create_values(blockSize * numBlocks);

    for (uint32_t i = 0; i < numBlocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < blockSize; ++j) {
            size_t ind = i * blockSize + j;
            memdb.update_element(ind, values[ind]);
            to_add.push_back(values[ind]);
        }
        add_values(tree, to_add);
        commit_tree(tree);

        index_t expectedFinalisedBlock = i < finalisedBlockDelay ? 0 : i - finalisedBlockDelay;
        check_finalised_block_height(tree, expectedFinalisedBlock);

        if (i >= finalisedBlockDelay) {

            index_t blockToFinalise = expectedFinalisedBlock + 1;

            // attempting to finalise a block that doesn't exist should fail
            finalise_block(tree, blockToFinalise + numBlocks, false);

            finalise_block(tree, blockToFinalise, true);
        }
    }
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_finalise_multiple_blocks)
{
    std::string name = random_string();
    constexpr uint32_t depth = 10;
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    uint32_t blockSize = 16;
    uint32_t numBlocks = 16;
    std::vector<fr> values = create_values(blockSize * numBlocks);

    for (uint32_t i = 0; i < numBlocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < blockSize; ++j) {
            size_t ind = i * blockSize + j;
            memdb.update_element(ind, values[ind]);
            to_add.push_back(values[ind]);
        }
        add_values(tree, to_add);
        commit_tree(tree);
    }

    check_block_height(tree, numBlocks);

    index_t blockToFinalise = 8;

    finalise_block(tree, blockToFinalise);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_not_finalise_block_beyond_pending_chain)
{
    std::string name = random_string();
    constexpr uint32_t depth = 10;
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    uint32_t blockSize = 16;
    uint32_t numBlocks = 16;
    std::vector<fr> values = create_values(blockSize * numBlocks);

    // finalising block 1 should fail
    finalise_block(tree, 1, false);

    for (uint32_t i = 0; i < numBlocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < blockSize; ++j) {
            size_t ind = i * blockSize + j;
            memdb.update_element(ind, values[ind]);
            to_add.push_back(values[ind]);
        }
        add_values(tree, to_add);
        commit_tree(tree);
    }

    check_block_height(tree, numBlocks);

    // should fail
    finalise_block(tree, numBlocks + 1, false);

    // finalise the entire chain
    index_t blockToFinalise = numBlocks;

    finalise_block(tree, blockToFinalise);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_not_fork_from_unwound_blocks)
{
    std::string name = random_string();
    uint32_t depth = 20;
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);

    for (uint32_t i = 0; i < 5; i++) {
        std::vector<fr> values = create_values(1024);
        add_values(tree, values);
        commit_tree(tree);
    }

    unwind_block(tree, 5);
    unwind_block(tree, 4);

    EXPECT_THROW(Store(name, depth, 5, db), std::runtime_error);
    EXPECT_THROW(Store(name, depth, 4, db), std::runtime_error);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_not_fork_from_expired_historical_blocks)
{
    std::string name = random_string();
    uint32_t depth = 20;
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);

    for (uint32_t i = 0; i < 5; i++) {
        std::vector<fr> values = create_values(1024);
        add_values(tree, values);
        commit_tree(tree);
    }
    finalise_block(tree, 3);

    remove_historic_block(tree, 1);
    remove_historic_block(tree, 2);

    EXPECT_THROW(Store(name, depth, 1, db), std::runtime_error);
    EXPECT_THROW(Store(name, depth, 2, db), std::runtime_error);
}
TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_fork_from_block_zero_when_not_latest)
{
    std::string name = random_string();
    uint32_t depth = 20;
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    uint32_t numBlocks = 5;

    const fr initialRoot = memdb.root();
    const fr_sibling_path path = memdb.get_sibling_path(0);

    for (uint32_t i = 0; i < numBlocks; i++) {
        std::vector<fr> values = create_values(1024);
        add_values(tree, values);
        commit_tree(tree);
    }

    check_block_height(tree, numBlocks);

    EXPECT_NO_THROW(Store(name, depth, 0, db));

    std::unique_ptr<Store> store2 = std::make_unique<Store>(name, depth, 0, db);
    TreeType tree2(std::move(store2), pool);

    check_root(tree2, initialRoot, false);
    check_sibling_path(tree2, 0, path, false, true);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_not_unwind_finalised_block)
{
    std::string name = random_string();
    constexpr uint32_t depth = 10;
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    uint32_t blockSize = 16;
    uint32_t numBlocks = 16;
    std::vector<fr> values = create_values(blockSize * numBlocks);

    for (uint32_t i = 0; i < numBlocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < blockSize; ++j) {
            size_t ind = i * blockSize + j;
            memdb.update_element(ind, values[ind]);
            to_add.push_back(values[ind]);
        }
        add_values(tree, to_add);
        commit_tree(tree);
    }

    check_block_height(tree, numBlocks);

    index_t blockToFinalise = 8;

    finalise_block(tree, blockToFinalise);

    for (uint32_t i = numBlocks; i > blockToFinalise; i--) {
        unwind_block(tree, i);
    }
    unwind_block(tree, blockToFinalise, false);
}

TEST_F(PersistedContentAddressedAppendOnlyTreeTest, can_not_historically_remove_finalised_block)
{
    std::string name = random_string();
    constexpr uint32_t depth = 10;
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr pool = make_thread_pool(1);
    TreeType tree(std::move(store), pool);
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    uint32_t blockSize = 16;
    uint32_t numBlocks = 16;
    std::vector<fr> values = create_values(blockSize * numBlocks);

    for (uint32_t i = 0; i < numBlocks; i++) {
        std::vector<fr> to_add;

        for (size_t j = 0; j < blockSize; ++j) {
            size_t ind = i * blockSize + j;
            memdb.update_element(ind, values[ind]);
            to_add.push_back(values[ind]);
        }
        add_values(tree, to_add);
        commit_tree(tree);
    }

    check_block_height(tree, numBlocks);

    index_t blockToFinalise = 8;

    finalise_block(tree, blockToFinalise);

    for (uint32_t i = 0; i < blockToFinalise - 1; i++) {
        remove_historic_block(tree, i + 1);
    }
    remove_historic_block(tree, blockToFinalise, false);
}
