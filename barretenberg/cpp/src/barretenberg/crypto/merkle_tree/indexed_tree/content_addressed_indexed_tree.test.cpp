#include "./content_addressed_indexed_tree.hpp"
#include "../fixtures.hpp"
#include "../hash.hpp"
#include "../node_store/array_store.hpp"
#include "../nullifier_tree/nullifier_memory_tree.hpp"
#include "../test_fixtures.hpp"
#include "./fixtures.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_content_addressed_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <future>
#include <memory>
#include <optional>
#include <stdexcept>
#include <vector>

using namespace bb;
using namespace bb::crypto::merkle_tree;

using HashPolicy = Poseidon2HashPolicy;

using Store = ContentAddressedCachedTreeStore<NullifierLeafValue>;
using TreeType = ContentAddressedIndexedTree<Store, HashPolicy>;

using PublicDataStore = ContentAddressedCachedTreeStore<PublicDataLeafValue>;
using PublicDataTreeType = ContentAddressedIndexedTree<PublicDataStore, Poseidon2HashPolicy>;

using CompletionCallback = TreeType::AddCompletionCallbackWithWitness;
using SequentialCompletionCallback = TreeType::AddSequentiallyCompletionCallbackWithWitness;

class PersistedContentAddressedIndexedTreeTest : public testing::Test {
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

std::string PersistedContentAddressedIndexedTreeTest::_directory;
uint64_t PersistedContentAddressedIndexedTreeTest::_maxReaders;
uint64_t PersistedContentAddressedIndexedTreeTest::_mapSize;

std::unique_ptr<TreeType> create_tree(const std::string& rootDirectory,
                                      uint64_t mapSize,
                                      uint64_t maxReaders,
                                      uint32_t depth,
                                      uint32_t batchSize,
                                      ThreadPoolPtr workers)
{
    std::string name = random_string();
    std::filesystem::path directory = rootDirectory;
    directory.append(name);
    std::filesystem::create_directories(directory);
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(directory, name, mapSize, maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    return std::make_unique<TreeType>(std::move(store), workers, batchSize);
}

template <typename TypeOfTree> void check_size(TypeOfTree& tree, index_t expected_size, bool includeUncommitted = true)
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

template <typename TypeOfTree> fr get_root(TypeOfTree& tree, bool includeUncommitted = true)
{
    fr r;
    Signal signal;
    auto completion = [&](const TypedResponse<TreeMetaResponse>& response) -> void {
        r = response.inner.meta.root;
        signal.signal_level();
    };
    tree.get_meta_data(includeUncommitted, completion);
    signal.wait_for_level();
    return r;
}

template <typename TypeOfTree> void check_root(TypeOfTree& tree, fr expected_root, bool includeUncommitted = true)
{
    fr root = get_root(tree, includeUncommitted);
    EXPECT_EQ(root, expected_root);
}

template <typename TypeOfTree>
fr_sibling_path get_historic_sibling_path(TypeOfTree& tree,
                                          block_number_t blockNumber,
                                          index_t index,
                                          bool includeUncommitted = true,
                                          bool expected_success = true)
{
    fr_sibling_path h;
    Signal signal;
    auto completion = [&](const TypedResponse<GetSiblingPathResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            h = response.inner.path;
        }
        signal.signal_level();
    };
    tree.get_sibling_path(index, blockNumber, completion, includeUncommitted);
    signal.wait_for_level();
    return h;
}

template <typename LeafValueType, typename TypeOfTree>
IndexedLeaf<LeafValueType> get_leaf(TypeOfTree& tree,
                                    index_t index,
                                    bool includeUncommitted = true,
                                    bool expected_success = true)
{
    std::optional<IndexedLeaf<LeafValueType>> l;
    Signal signal;
    auto completion = [&](const TypedResponse<GetIndexedLeafResponse<LeafValueType>>& leaf) -> void {
        EXPECT_EQ(leaf.success, expected_success);
        if (leaf.success) {
            l = leaf.inner.indexed_leaf;
        }
        signal.signal_level();
    };
    tree.get_leaf(index, includeUncommitted, completion);
    signal.wait_for_level();
    return l.has_value() ? l.value() : IndexedLeaf<LeafValueType>();
}

template <typename LeafValueType, typename TypeOfTree>
GetLowIndexedLeafResponse get_low_leaf(TypeOfTree& tree, const LeafValueType& leaf, bool includeUncommitted = true)
{
    GetLowIndexedLeafResponse low_leaf_info;
    Signal signal;
    auto completion = [&](const auto& leaf) -> void {
        low_leaf_info = leaf.inner;
        signal.signal_level();
    };
    tree.find_low_leaf(leaf.get_key(), includeUncommitted, completion);
    signal.wait_for_level();
    return low_leaf_info;
}

template <typename LeafValueType, typename TypeOfTree>
GetLowIndexedLeafResponse get_historic_low_leaf(TypeOfTree& tree,
                                                block_number_t blockNumber,
                                                const LeafValueType& leaf,
                                                bool includeUncommitted = true)
{
    GetLowIndexedLeafResponse low_leaf_info;
    Signal signal;
    auto completion = [&](const auto& leaf) -> void {
        low_leaf_info = leaf.inner;
        signal.signal_level();
    };
    tree.find_low_leaf(leaf.get_key(), blockNumber, includeUncommitted, completion);
    signal.wait_for_level();
    return low_leaf_info;
}

template <typename LeafValueType, typename TypeOfTree>
void check_historic_leaf(TypeOfTree& tree,
                         const LeafValueType& leaf,
                         index_t expected_index,
                         block_number_t blockNumber,
                         bool expected_success,
                         bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<GetIndexedLeafResponse<LeafValueType>>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            EXPECT_EQ(response.inner.indexed_leaf.value().leaf, leaf);
        }
        signal.signal_level();
    };

    tree.get_leaf(expected_index, blockNumber, includeUncommitted, completion);
    signal.wait_for_level();
}

template <typename TypeOfTree>
void check_historic_sibling_path(TypeOfTree& tree,
                                 index_t index,
                                 block_number_t blockNumber,
                                 const fr_sibling_path& expected_sibling_path,
                                 bool includeUncommitted = true,
                                 bool expected_success = true)
{
    fr_sibling_path path = get_historic_sibling_path(tree, blockNumber, index, includeUncommitted, expected_success);
    if (expected_success) {
        EXPECT_EQ(path, expected_sibling_path);
    }
}

template <typename TypeOfTree>
void check_sibling_path(TypeOfTree& tree,
                        index_t index,
                        const fr_sibling_path& expected_sibling_path,
                        bool includeUncommitted = true,
                        bool expected_success = true)
{
    fr_sibling_path path = get_sibling_path(tree, index, includeUncommitted, expected_success);
    EXPECT_EQ(path, expected_sibling_path);
}

template <typename TypeOfTree> void check_unfinalised_block_height(TypeOfTree& tree, index_t expected_block_height)
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

template <typename TypeOfTree> void commit_tree(TypeOfTree& tree, bool expectedSuccess = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<CommitResponse>& response) -> void {
        EXPECT_EQ(response.success, expectedSuccess);
        signal.signal_level();
    };
    tree.commit(completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void add_value(TypeOfTree& tree, const LeafValueType& value, bool expectedSuccess = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<AddIndexedDataResponse<LeafValueType>>& response) -> void {
        EXPECT_EQ(response.success, expectedSuccess);
        signal.signal_level();
    };

    tree.add_or_update_value(value, completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void add_value_sequentially(TypeOfTree& tree, const LeafValueType& value, bool expectedSuccess = true)
{
    std::vector<LeafValueType> values = { value };
    Signal signal;
    auto completion = [&](const TypedResponse<AddIndexedDataSequentiallyResponse<LeafValueType>>& response) -> void {
        EXPECT_EQ(response.success, expectedSuccess);
        signal.signal_level();
    };

    tree.add_or_update_values_sequentially(values, completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void add_values(TypeOfTree& tree, const std::vector<LeafValueType>& values, bool expectedSuccess = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<AddIndexedDataResponse<LeafValueType>>& response) -> void {
        EXPECT_EQ(response.success, expectedSuccess);
        signal.signal_level();
    };

    tree.add_or_update_values(values, completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void add_values_sequentially(TypeOfTree& tree, const std::vector<LeafValueType>& values, bool expectedSuccess = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<AddIndexedDataSequentiallyResponse<LeafValueType>>& response) -> void {
        EXPECT_EQ(response.success, expectedSuccess);
        signal.signal_level();
    };

    tree.add_or_update_values_sequentially(values, completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void block_sync_values(TypeOfTree& tree, const std::vector<LeafValueType>& values, bool expectedSuccess = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<AddDataResponse>& response) -> void {
        EXPECT_EQ(response.success, expectedSuccess);
        signal.signal_level();
    };

    tree.add_or_update_values(values, completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void block_sync_values_sequential(TypeOfTree& tree,
                                  const std::vector<LeafValueType>& values,
                                  bool expectedSuccess = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<AddDataResponse>& response) -> void {
        EXPECT_EQ(response.success, expectedSuccess);
        signal.signal_level();
    };

    tree.add_or_update_values_sequentially(values, completion);
    signal.wait_for_level();
}

template <typename TypeOfTree>
void remove_historic_block(TypeOfTree& tree, const block_number_t& blockNumber, bool expected_success = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<RemoveHistoricResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        signal.signal_level();
    };
    tree.remove_historic_block(blockNumber, completion);
    signal.wait_for_level();
}

template <typename TypeOfTree>
void finalise_block(TypeOfTree& tree, const block_number_t& blockNumber, bool expected_success = true)
{
    Signal signal;
    auto completion = [&](const Response& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        signal.signal_level();
    };
    tree.finalise_block(blockNumber, completion);
    signal.wait_for_level();
}

template <typename TypeOfTree>
void unwind_block(TypeOfTree& tree, const block_number_t& blockNumber, bool expected_success = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<UnwindResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        signal.signal_level();
    };
    tree.unwind_block(blockNumber, completion);
    signal.wait_for_level();
}

template <typename TypeOfTree> void check_block_height(TypeOfTree& tree, index_t expected_block_height)
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

TEST_F(PersistedContentAddressedIndexedTreeTest, can_create)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    EXPECT_NO_THROW(std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db));
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    ThreadPoolPtr workers = make_thread_pool(1);
    TreeType tree = TreeType(std::move(store), workers, 2);
    check_size(tree, 2);

    NullifierMemoryTree<HashPolicy> memdb(10);
    check_root(tree, memdb.root());
}

TEST_F(PersistedContentAddressedIndexedTreeTest, can_only_recreate_with_same_name_and_depth)
{
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);

    EXPECT_ANY_THROW(Store("Wrong name", depth, db));
    EXPECT_ANY_THROW(Store(name, depth + 1, db));
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_size)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(1);
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, current_size);

    check_size(tree, current_size);

    // We assume that the first leaf is already filled with (0, 0, 0).
    for (uint32_t i = 0; i < 4; i++) {
        add_value(tree, NullifierLeafValue(VALUES[i]));
        check_size(tree, ++current_size);
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, indexed_tree_must_have_at_least_2_initial_size)
{
    index_t current_size = 1;
    ThreadPoolPtr workers = make_thread_pool(1);
    ;
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    EXPECT_THROW(TreeType(std::move(store), workers, current_size), std::runtime_error);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, reports_an_error_if_tree_is_overfilled)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(1);
    ;
    constexpr size_t depth = 4;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, current_size);

    std::vector<NullifierLeafValue> values;
    for (uint32_t i = 0; i < 14; i++) {
        values.emplace_back(VALUES[i]);
    }
    add_values(tree, values);

    std::stringstream ss;
    ss << "Unable to insert values into tree " << name << " new size: 17 max size: 16";

    Signal signal;
    auto add_completion = [&](const TypedResponse<AddIndexedDataResponse<NullifierLeafValue>>& response) {
        EXPECT_EQ(response.success, false);
        EXPECT_EQ(response.message, ss.str());
        signal.signal_level();
    };
    tree.add_or_update_value(NullifierLeafValue(VALUES[16]), add_completion);
    signal.wait_for_level();
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_get_sibling_path)
{
    constexpr size_t depth = 10;
    index_t current_size = 2;
    NullifierMemoryTree<HashPolicy> memdb(depth, current_size);

    ThreadPoolPtr workers = make_thread_pool(1);

    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, current_size);

    check_size(tree, current_size);
    check_root(tree, memdb.root());
    check_sibling_path(tree, 0, memdb.get_sibling_path(0));

    memdb.update_element(VALUES[1000]);
    add_value(tree, NullifierLeafValue(VALUES[1000]));

    check_size(tree, ++current_size);
    check_sibling_path(tree, 0, memdb.get_sibling_path(0));
    check_sibling_path(tree, 1, memdb.get_sibling_path(1));

    memdb.update_element(VALUES[1001]);
    add_value(tree, NullifierLeafValue(VALUES[1001]));

    check_size(tree, ++current_size);
    check_sibling_path(tree, 0, memdb.get_sibling_path(0));
    check_sibling_path(tree, 1, memdb.get_sibling_path(1));

    uint32_t num_to_append = 512;

    for (uint32_t i = 0; i < num_to_append; i += 2) {
        memdb.update_element(VALUES[i]);
        memdb.update_element(VALUES[i + 1]);
        add_values<NullifierLeafValue>(tree, { NullifierLeafValue(VALUES[i]), NullifierLeafValue(VALUES[i + 1]) });
    }
    check_size(tree, num_to_append + current_size);
    check_sibling_path(tree, 0, memdb.get_sibling_path(0));
    check_sibling_path(tree, 512, memdb.get_sibling_path(512));
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_find_leaf_index)
{
    index_t initial_size = 2;
    ThreadPoolPtr workers = make_thread_pool(1);
    ;
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, initial_size);

    add_value(tree, NullifierLeafValue(30));
    add_value(tree, NullifierLeafValue(10));
    add_value(tree, NullifierLeafValue(20));
    add_value(tree, NullifierLeafValue(40));

    // check the committed state and that the uncommitted state is empty
    check_find_leaf_index(tree, NullifierLeafValue(10), 1 + initial_size, true, true);
    check_find_leaf_index<NullifierLeafValue, TreeType>(
        tree, { NullifierLeafValue(10) }, { std::nullopt }, true, false);

    check_find_leaf_index<NullifierLeafValue, TreeType>(tree, { NullifierLeafValue(15) }, { std::nullopt }, true, true);
    check_find_leaf_index<NullifierLeafValue, TreeType>(
        tree, { NullifierLeafValue(15) }, { std::nullopt }, true, false);

    check_find_leaf_index(tree, NullifierLeafValue(40), 3 + initial_size, true, true);
    check_find_leaf_index(tree, NullifierLeafValue(30), 0 + initial_size, true, true);
    check_find_leaf_index(tree, NullifierLeafValue(20), 2 + initial_size, true, true);

    check_find_leaf_index<NullifierLeafValue, TreeType>(
        tree, { NullifierLeafValue(40) }, { std::nullopt }, true, false);
    check_find_leaf_index<NullifierLeafValue, TreeType>(
        tree, { NullifierLeafValue(30) }, { std::nullopt }, true, false);
    check_find_leaf_index<NullifierLeafValue, TreeType>(
        tree, { NullifierLeafValue(20) }, { std::nullopt }, true, false);

    commit_tree(tree);

    std::vector<NullifierLeafValue> values{ NullifierLeafValue(15),
                                            NullifierLeafValue(18),
                                            NullifierLeafValue(26),
                                            NullifierLeafValue(2),
                                            NullifierLeafValue(48) };
    add_values(tree, values);

    // check the now committed state
    check_find_leaf_index(tree, NullifierLeafValue(40), 3 + initial_size, true, false);
    check_find_leaf_index(tree, NullifierLeafValue(30), 0 + initial_size, true, false);
    check_find_leaf_index(tree, NullifierLeafValue(20), 2 + initial_size, true, false);

    // check the new uncommitted state
    check_find_leaf_index(tree, NullifierLeafValue(18), 5 + initial_size, true, true);
    check_find_leaf_index<NullifierLeafValue, TreeType>(
        tree, { NullifierLeafValue(18) }, { std::nullopt }, true, false);

    commit_tree(tree);

    values = { NullifierLeafValue(16), NullifierLeafValue(4), NullifierLeafValue(22), NullifierLeafValue(101) };
    add_values(tree, values);

    // we now have duplicate leaf 18, one committed the other not
    check_find_leaf_index(tree, NullifierLeafValue(18), 5 + initial_size, true, true);
    check_find_leaf_index(tree, NullifierLeafValue(18), 5 + initial_size, true, false);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, can_commit_and_restore)
{
    NullifierMemoryTree<HashPolicy> memdb(10);
    index_t initial_size = 2;
    index_t current_size = initial_size;
    ThreadPoolPtr workers = make_thread_pool(1);
    ;
    constexpr size_t depth = 10;
    std::string name = random_string();

    {
        LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
        std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
        auto tree = TreeType(std::move(store), workers, initial_size);

        check_size(tree, current_size);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));

        add_value(tree, NullifierLeafValue(VALUES[512]));

        // Committed data should not have changed
        check_size(tree, current_size, false);
        check_root(tree, memdb.root(), false);
        check_sibling_path(tree, 0, memdb.get_sibling_path(0), false);
        check_sibling_path(tree, 1, memdb.get_sibling_path(1), false);

        memdb.update_element(VALUES[512]);

        // Uncommitted data should have changed
        check_size(tree, current_size + 1, true);
        check_root(tree, memdb.root(), true);
        check_sibling_path(tree, 0, memdb.get_sibling_path(0), true);
        check_sibling_path(tree, 1, memdb.get_sibling_path(1), true);

        // Now commit
        commit_tree(tree);

        // Now committed data should have changed
        check_size(tree, ++current_size, false);
        check_root(tree, memdb.root(), false);
        check_sibling_path(tree, 0, memdb.get_sibling_path(0), false);
        check_sibling_path(tree, 1, memdb.get_sibling_path(1), false);
    }

    // Now restore and it should continue from where we left off
    {
        LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
        std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
        auto tree = TreeType(std::move(store), workers, initial_size);

        // check uncommitted state
        check_size(tree, current_size);
        check_root(tree, memdb.root());
        check_sibling_path(tree, 0, memdb.get_sibling_path(0));

        // check committed state
        check_size(tree, current_size, false);
        check_root(tree, memdb.root(), false);
        check_sibling_path(tree, 0, memdb.get_sibling_path(0), false);
    }
}

void test_batch_insert(uint32_t batchSize, std::string directory, uint64_t mapSize, uint64_t maxReaders)
{
    auto& random_engine = numeric::get_randomness();
    const uint32_t batch_size = batchSize;
    const uint32_t num_batches = 16;
    uint32_t depth = 10;
    ThreadPoolPtr workers = make_thread_pool(1);
    ThreadPoolPtr multi_workers = make_thread_pool(8);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    auto tree1 = create_tree(directory, mapSize, maxReaders, depth, batch_size, workers);
    auto tree2 = create_tree(directory, mapSize, maxReaders, depth, batch_size, multi_workers);
    auto tree3 = create_tree(directory, mapSize, maxReaders, depth, batch_size, multi_workers);

    for (uint32_t i = 0; i < num_batches; i++) {

        check_root(*tree1, memdb.root());
        check_root(*tree2, memdb.root());
        check_root(*tree3, memdb.root());
        check_sibling_path(*tree1, 0, memdb.get_sibling_path(0));
        check_sibling_path(*tree2, 0, memdb.get_sibling_path(0));
        check_sibling_path(*tree3, 0, memdb.get_sibling_path(0));

        check_sibling_path(*tree1, 512, memdb.get_sibling_path(512));
        check_sibling_path(*tree2, 512, memdb.get_sibling_path(512));
        check_sibling_path(*tree3, 512, memdb.get_sibling_path(512));

        std::vector<NullifierLeafValue> batch;
        std::vector<fr_sibling_path> memory_tree_sibling_paths;
        for (uint32_t j = 0; j < batch_size; j++) {
            batch.emplace_back(random_engine.get_random_uint256());
            fr_sibling_path path = memdb.update_element(batch[j].nullifier);
            memory_tree_sibling_paths.push_back(path);
        }
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>> tree1_low_leaf_witness_data;
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>> tree2_low_leaf_witness_data;
        {
            Signal signal;
            CompletionCallback completion =
                [&](const TypedResponse<AddIndexedDataResponse<NullifierLeafValue>>& response) {
                    tree1_low_leaf_witness_data = response.inner.low_leaf_witness_data;
                    signal.signal_level();
                };
            tree1->add_or_update_values(batch, completion);
            signal.wait_for_level();
        }

        {
            Signal signal;
            CompletionCallback completion =
                [&](const TypedResponse<AddIndexedDataResponse<NullifierLeafValue>>& response) {
                    tree2_low_leaf_witness_data = response.inner.low_leaf_witness_data;
                    signal.signal_level();
                };
            tree2->add_or_update_values(batch, completion);
            signal.wait_for_level();
        }

        {
            Signal signal;
            auto completion = [&](const TypedResponse<AddDataResponse>&) { signal.signal_level(); };
            tree3->add_or_update_values(batch, completion);
            signal.wait_for_level();
        }
        check_root(*tree1, memdb.root());
        check_root(*tree2, memdb.root());
        check_root(*tree3, memdb.root());

        check_sibling_path(*tree1, 0, memdb.get_sibling_path(0));
        check_sibling_path(*tree2, 0, memdb.get_sibling_path(0));
        check_sibling_path(*tree3, 0, memdb.get_sibling_path(0));

        check_sibling_path(*tree1, 512, memdb.get_sibling_path(512));
        check_sibling_path(*tree2, 512, memdb.get_sibling_path(512));
        check_sibling_path(*tree3, 512, memdb.get_sibling_path(512));

        for (uint32_t j = 0; j < batch_size; j++) {
            EXPECT_EQ(tree1_low_leaf_witness_data->at(j).leaf, tree2_low_leaf_witness_data->at(j).leaf);
            EXPECT_EQ(tree1_low_leaf_witness_data->at(j).index, tree2_low_leaf_witness_data->at(j).index);
            EXPECT_EQ(tree1_low_leaf_witness_data->at(j).path, tree2_low_leaf_witness_data->at(j).path);
        }
    }
}

void test_batch_insert_with_commit_restore(uint32_t batchSize,
                                           std::string directory,
                                           uint64_t mapSize,
                                           uint64_t maxReaders)
{
    auto& random_engine = numeric::get_randomness();
    const uint32_t batch_size = batchSize;
    const uint32_t num_batches = 16;
    uint32_t depth = 10;
    ThreadPoolPtr workers = make_thread_pool(1);
    ThreadPoolPtr multi_workers = make_thread_pool(8);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    for (uint32_t i = 0; i < num_batches; i++) {

        auto tree1 = create_tree(directory, mapSize, maxReaders, depth, batch_size, workers);
        auto tree2 = create_tree(directory, mapSize, maxReaders, depth, batch_size, multi_workers);
        auto tree3 = create_tree(directory, mapSize, maxReaders, depth, batch_size, multi_workers);

        check_root(*tree1, memdb.root());
        check_root(*tree2, memdb.root());
        check_root(*tree3, memdb.root());
        check_sibling_path(*tree1, 0, memdb.get_sibling_path(0));
        check_sibling_path(*tree2, 0, memdb.get_sibling_path(0));
        check_sibling_path(*tree3, 0, memdb.get_sibling_path(0));

        check_sibling_path(*tree1, 512, memdb.get_sibling_path(512));
        check_sibling_path(*tree2, 512, memdb.get_sibling_path(512));
        check_sibling_path(*tree3, 512, memdb.get_sibling_path(512));

        std::vector<NullifierLeafValue> batch;
        std::vector<fr_sibling_path> memory_tree_sibling_paths;
        for (uint32_t j = 0; j < batch_size; j++) {
            batch.emplace_back(random_engine.get_random_uint256());
            fr_sibling_path path = memdb.update_element(batch[j].nullifier);
            memory_tree_sibling_paths.push_back(path);
        }
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>> tree1_low_leaf_witness_data;
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>> tree2_low_leaf_witness_data;
        {
            Signal signal;
            CompletionCallback completion =
                [&](const TypedResponse<AddIndexedDataResponse<NullifierLeafValue>>& response) {
                    tree1_low_leaf_witness_data = response.inner.low_leaf_witness_data;
                    signal.signal_level();
                };
            tree1->add_or_update_values(batch, completion);
            signal.wait_for_level();
        }

        {
            Signal signal;
            CompletionCallback completion =
                [&](const TypedResponse<AddIndexedDataResponse<NullifierLeafValue>>& response) {
                    tree2_low_leaf_witness_data = response.inner.low_leaf_witness_data;
                    signal.signal_level();
                };
            tree2->add_or_update_values(batch, completion);
            signal.wait_for_level();
        }

        {
            Signal signal;
            auto completion = [&](const TypedResponse<AddDataResponse>&) { signal.signal_level(); };
            tree3->add_or_update_values(batch, completion);
            signal.wait_for_level();
        }
        check_root(*tree1, memdb.root());
        check_root(*tree2, memdb.root());
        check_root(*tree3, memdb.root());

        check_sibling_path(*tree1, 0, memdb.get_sibling_path(0));
        check_sibling_path(*tree2, 0, memdb.get_sibling_path(0));
        check_sibling_path(*tree3, 0, memdb.get_sibling_path(0));

        check_sibling_path(*tree1, 512, memdb.get_sibling_path(512));
        check_sibling_path(*tree2, 512, memdb.get_sibling_path(512));
        check_sibling_path(*tree3, 512, memdb.get_sibling_path(512));

        for (uint32_t j = 0; j < batch_size; j++) {
            EXPECT_EQ(tree1_low_leaf_witness_data->at(j).leaf, tree2_low_leaf_witness_data->at(j).leaf);
            EXPECT_EQ(tree1_low_leaf_witness_data->at(j).index, tree2_low_leaf_witness_data->at(j).index);
            EXPECT_EQ(tree1_low_leaf_witness_data->at(j).path, tree2_low_leaf_witness_data->at(j).path);
        }

        commit_tree(*tree1);
        commit_tree(*tree2);
        commit_tree(*tree3);
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_batch_insert)
{
    uint32_t batchSize = 2;
    while (batchSize <= 2) {
        test_batch_insert(batchSize, _directory, _mapSize, _maxReaders);
        batchSize <<= 1;
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_batch_insert_with_commit_restore)
{
    uint32_t batchSize = 2;
    while (batchSize <= 32) {
        test_batch_insert(batchSize, _directory, _mapSize, _maxReaders);
        batchSize <<= 1;
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_compare_batch_inserts_different_sized_thread_pools)
{
    const uint32_t batch_size = 128;
    uint32_t depth = 20;
    ThreadPoolPtr workers = make_thread_pool(1);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    auto tree1 = create_tree(_directory, _mapSize, _maxReaders, depth, batch_size, workers);
    auto tree2 = create_tree(_directory, _mapSize, _maxReaders, depth, batch_size, workers);

    std::vector<std::unique_ptr<TreeType>> trees;
    for (uint32_t i = 1; i <= 12; i++) {
        ThreadPoolPtr multiWorkers = make_thread_pool(i);
        auto tree = create_tree(_directory, _mapSize, _maxReaders, depth, batch_size, multiWorkers);
        trees.emplace_back(std::move(tree));
    }

    std::vector<fr> tree1Roots;
    std::vector<fr> tree2Roots;

    for (uint32_t round = 0; round < 10; round++) {
        std::vector<fr> frValues1 = create_values(3);
        std::vector<fr> frValues2 = create_values(3);
        std::vector<NullifierLeafValue> leaves(128, NullifierLeafValue(fr::zero()));
        for (uint32_t i = 0; i < 3; i++) {
            leaves[i] = frValues1[i];
            leaves[i + 64] = frValues2[i];
        }

        std::vector<NullifierLeafValue> first(leaves.begin(), leaves.begin() + 64);
        std::vector<NullifierLeafValue> second(leaves.begin() + 64, leaves.end());

        add_values(*tree1, first);
        add_values(*tree1, second);

        block_sync_values(*tree2, leaves);

        tree1Roots.push_back(get_root(*tree1));
        tree2Roots.push_back(get_root(*tree2, true));
        EXPECT_EQ(tree1Roots[round], tree2Roots[round]);

        for (const auto& tree : trees) {
            block_sync_values(*tree, leaves);
            const fr treeRoot = get_root(*tree, true);
            EXPECT_EQ(treeRoot, tree1Roots[round]);
        }
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, reports_an_error_if_batch_contains_duplicate)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(1);
    ;
    constexpr size_t depth = 10;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, current_size);

    std::vector<NullifierLeafValue> values;
    for (uint32_t i = 0; i < 16; i++) {
        values.emplace_back(VALUES[i]);
    }
    values[8] = values[0];

    std::stringstream ss;
    ss << "Duplicate key not allowed in same batch, key value: " << values[0].nullifier << ", tree: " << name;

    Signal signal;
    auto add_completion = [&](const TypedResponse<AddIndexedDataResponse<NullifierLeafValue>>& response) {
        EXPECT_EQ(response.success, false);
        EXPECT_EQ(response.message, ss.str());
        signal.signal_level();
    };
    tree.add_or_update_values(values, add_completion);
    signal.wait_for_level();
}

void test_sequential_insert_vs_batch(uint32_t batchSize, std::string directory, uint64_t mapSize, uint64_t maxReaders)
{
    auto& random_engine = numeric::get_randomness();
    const uint32_t batch_size = batchSize;
    const uint32_t num_batches = 16;
    uint32_t depth = 10;
    ThreadPoolPtr workers = make_thread_pool(1);
    ThreadPoolPtr multi_workers = make_thread_pool(8);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    auto sequential_tree_1 = create_tree(directory, mapSize, maxReaders, depth, batch_size, workers);
    auto sequential_tree_2 = create_tree(directory, mapSize, maxReaders, depth, batch_size, multi_workers);
    auto sequential_tree_3 = create_tree(directory, mapSize, maxReaders, depth, batch_size, multi_workers);
    auto batch_tree = create_tree(directory, mapSize, maxReaders, depth, batch_size, multi_workers);

    for (uint32_t i = 0; i < num_batches; i++) {

        check_root(*sequential_tree_1, memdb.root());
        check_root(*sequential_tree_2, memdb.root());
        check_root(*sequential_tree_3, memdb.root());
        check_root(*batch_tree, memdb.root());
        check_sibling_path(*sequential_tree_1, 0, memdb.get_sibling_path(0));
        check_sibling_path(*sequential_tree_2, 0, memdb.get_sibling_path(0));
        check_sibling_path(*sequential_tree_3, 0, memdb.get_sibling_path(0));
        check_sibling_path(*batch_tree, 0, memdb.get_sibling_path(0));

        check_sibling_path(*sequential_tree_1, 512, memdb.get_sibling_path(512));
        check_sibling_path(*sequential_tree_2, 512, memdb.get_sibling_path(512));
        check_sibling_path(*sequential_tree_3, 512, memdb.get_sibling_path(512));
        check_sibling_path(*batch_tree, 512, memdb.get_sibling_path(512));

        std::vector<NullifierLeafValue> batch;
        std::vector<fr_sibling_path> memory_tree_sibling_paths;
        for (uint32_t j = 0; j < batch_size; j++) {
            batch.emplace_back(random_engine.get_random_uint256());
            fr_sibling_path path = memdb.update_element(batch[j].nullifier);
            memory_tree_sibling_paths.push_back(path);
        }
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>> sequential_tree_1_low_leaf_witness_data;
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>>
            sequential_tree_1_insertion_witness_data;
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>> sequential_tree_2_low_leaf_witness_data;
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>>
            sequential_tree_2_insertion_witness_data;

        {
            Signal signal;
            SequentialCompletionCallback completion =
                [&](const TypedResponse<AddIndexedDataSequentiallyResponse<NullifierLeafValue>>& response) {
                    sequential_tree_1_low_leaf_witness_data = response.inner.low_leaf_witness_data;
                    sequential_tree_1_insertion_witness_data = response.inner.insertion_witness_data;
                    signal.signal_level();
                };
            sequential_tree_1->add_or_update_values_sequentially(batch, completion);
            signal.wait_for_level();
        }

        {
            Signal signal;
            SequentialCompletionCallback completion =
                [&](const TypedResponse<AddIndexedDataSequentiallyResponse<NullifierLeafValue>>& response) {
                    sequential_tree_2_low_leaf_witness_data = response.inner.low_leaf_witness_data;
                    sequential_tree_2_insertion_witness_data = response.inner.insertion_witness_data;
                    signal.signal_level();
                };
            sequential_tree_2->add_or_update_values_sequentially(batch, completion);
            signal.wait_for_level();
        }

        {
            Signal signal;
            auto completion = [&](const TypedResponse<AddDataResponse>&) { signal.signal_level(); };
            sequential_tree_3->add_or_update_values_sequentially(batch, completion);
            signal.wait_for_level();
        }

        {
            Signal signal;
            auto completion = [&](const TypedResponse<AddDataResponse>&) { signal.signal_level(); };
            batch_tree->add_or_update_values(batch, completion);
            signal.wait_for_level();
        }
        check_root(*sequential_tree_1, memdb.root());
        check_root(*sequential_tree_2, memdb.root());
        check_root(*sequential_tree_3, memdb.root());
        check_root(*batch_tree, memdb.root());

        check_sibling_path(*sequential_tree_1, 0, memdb.get_sibling_path(0));
        check_sibling_path(*sequential_tree_2, 0, memdb.get_sibling_path(0));
        check_sibling_path(*sequential_tree_3, 0, memdb.get_sibling_path(0));
        check_sibling_path(*batch_tree, 0, memdb.get_sibling_path(0));

        check_sibling_path(*sequential_tree_1, 512, memdb.get_sibling_path(512));
        check_sibling_path(*sequential_tree_2, 512, memdb.get_sibling_path(512));
        check_sibling_path(*sequential_tree_3, 512, memdb.get_sibling_path(512));
        check_sibling_path(*batch_tree, 512, memdb.get_sibling_path(512));

        for (uint32_t j = 0; j < batch_size; j++) {
            EXPECT_EQ(sequential_tree_1_low_leaf_witness_data->at(j).leaf,
                      sequential_tree_2_low_leaf_witness_data->at(j).leaf);
            EXPECT_EQ(sequential_tree_1_low_leaf_witness_data->at(j).index,
                      sequential_tree_2_low_leaf_witness_data->at(j).index);
            EXPECT_EQ(sequential_tree_1_low_leaf_witness_data->at(j).path,
                      sequential_tree_2_low_leaf_witness_data->at(j).path);

            EXPECT_EQ(sequential_tree_1_insertion_witness_data->at(j).leaf,
                      sequential_tree_2_insertion_witness_data->at(j).leaf);
            EXPECT_EQ(sequential_tree_1_insertion_witness_data->at(j).index,
                      sequential_tree_2_insertion_witness_data->at(j).index);
            EXPECT_EQ(sequential_tree_1_insertion_witness_data->at(j).path,
                      sequential_tree_2_insertion_witness_data->at(j).path);
        }
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_sequential_insert_vs_batch)
{
    uint32_t batchSize = 2;
    while (batchSize <= 2) {
        test_sequential_insert_vs_batch(batchSize, _directory, _mapSize, _maxReaders);
        batchSize <<= 1;
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, sequential_insert_allows_multiple_inserts_to_the_same_key)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<ContentAddressedCachedTreeStore<PublicDataLeafValue>> store =
        std::make_unique<ContentAddressedCachedTreeStore<PublicDataLeafValue>>(name, depth, db);
    auto tree = ContentAddressedIndexedTree<ContentAddressedCachedTreeStore<PublicDataLeafValue>, Poseidon2HashPolicy>(
        std::move(store), workers, current_size);

    std::vector<PublicDataLeafValue> values{ PublicDataLeafValue(42, 27), PublicDataLeafValue(42, 28) };
    add_values_sequentially(tree, values);

    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2).leaf.value, values[1].value);
    check_size(tree, 3);
}

template <typename LeafValueType> fr hash_leaf(const IndexedLeaf<LeafValueType>& leaf)
{
    return HashPolicy::hash(leaf.get_hash_inputs());
}

bool verify_sibling_path(TreeType& tree, const IndexedNullifierLeafType& leaf_value, const uint32_t idx)
{
    fr root = get_root(tree, true);
    fr_sibling_path path = get_sibling_path(tree, idx, true);
    auto current = hash_leaf(leaf_value);
    uint32_t depth_ = static_cast<uint32_t>(path.size());
    uint32_t index = idx;
    for (uint32_t i = 0; i < depth_; ++i) {
        fr left = (index & 1) ? path[i] : current;
        fr right = (index & 1) ? current : path[i];
        current = HashPolicy::hash_pair(left, right);
        index >>= 1;
    }
    return current == root;
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_indexed_memory)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, current_size);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       1       1       0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   0       0       0       0        0       0       0       0
     */
    IndexedNullifierLeafType zero_leaf(NullifierLeafValue(0), 1, 1);
    IndexedNullifierLeafType one_leaf(NullifierLeafValue(1), 0, 0);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 0), zero_leaf);
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 1), one_leaf);

    /**
     * Add new value 30:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       1       30      0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value(tree, NullifierLeafValue(30));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 0), create_indexed_nullifier_leaf(0, 1, 1));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 1), create_indexed_nullifier_leaf(1, 2, 30));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 2), create_indexed_nullifier_leaf(30, 0, 0));

    /**
     * Add new value 10:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       1       30      10       0       0       0       0
     *  nextIdx   1       3       0       2        0       0       0       0
     *  nextVal   1       10      0       30       0       0       0       0
     */
    add_value(tree, NullifierLeafValue(10));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 0), create_indexed_nullifier_leaf(0, 1, 1));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 1), create_indexed_nullifier_leaf(1, 3, 10));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 2), create_indexed_nullifier_leaf(30, 0, 0));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 3), create_indexed_nullifier_leaf(10, 2, 30));

    /**
     * Add new value 20:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       1       30      10       20      0       0       0
     *  nextIdx   1       3       0       4        2       0       0       0
     *  nextVal   1       10      0       20       30      0       0       0
     */
    add_value(tree, NullifierLeafValue(20));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 0), create_indexed_nullifier_leaf(0, 1, 1));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 1), create_indexed_nullifier_leaf(1, 3, 10));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 2), create_indexed_nullifier_leaf(30, 0, 0));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 3), create_indexed_nullifier_leaf(10, 4, 20));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 4), create_indexed_nullifier_leaf(20, 2, 30));

    // Adding the same value must not affect anything
    // tree.update_element(20);
    // EXPECT_EQ(tree.get_leaves().size(), 4);
    // EXPECT_EQ(tree.get_leaves()[0], hash_leaf({ 0, 2, 10 }));
    // EXPECT_EQ(tree.get_leaves()[1], hash_leaf({ 30, 0, 0 }));
    // EXPECT_EQ(tree.get_leaves()[2], hash_leaf({ 10, 3, 20 }));
    // EXPECT_EQ(tree.get_leaves()[3], hash_leaf({ 20, 1, 30 }));

    /**
     * Add new value 50:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       1       30      10       20      50      0       0
     *  nextIdx   1       3       5       4        2       0       0       0
     *  nextVal   1       10      50      20       30      0       0       0
     */
    add_value(tree, NullifierLeafValue(50));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 0), create_indexed_nullifier_leaf(0, 1, 1));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 1), create_indexed_nullifier_leaf(1, 3, 10));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 2), create_indexed_nullifier_leaf(30, 5, 50));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 3), create_indexed_nullifier_leaf(10, 4, 20));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 4), create_indexed_nullifier_leaf(20, 2, 30));
    EXPECT_EQ(get_leaf<NullifierLeafValue>(tree, 5), create_indexed_nullifier_leaf(50, 0, 0));

    // Manually compute the node values
    auto e000 = hash_leaf(get_leaf<NullifierLeafValue>(tree, 0));
    auto e001 = hash_leaf(get_leaf<NullifierLeafValue>(tree, 1));
    auto e010 = hash_leaf(get_leaf<NullifierLeafValue>(tree, 2));
    auto e011 = hash_leaf(get_leaf<NullifierLeafValue>(tree, 3));
    auto e100 = hash_leaf(get_leaf<NullifierLeafValue>(tree, 4));
    auto e101 = hash_leaf(get_leaf<NullifierLeafValue>(tree, 5));
    auto e110 = fr::zero();
    auto e111 = fr::zero();

    auto e00 = HashPolicy::hash_pair(e000, e001);
    auto e01 = HashPolicy::hash_pair(e010, e011);
    auto e10 = HashPolicy::hash_pair(e100, e101);
    auto e11 = HashPolicy::hash_pair(e110, e111);

    auto e0 = HashPolicy::hash_pair(e00, e01);
    auto e1 = HashPolicy::hash_pair(e10, e11);
    auto root = HashPolicy::hash_pair(e0, e1);

    // Check the hash path at index 2 and 3
    // Note: This merkle proof would also serve as a non-membership proof of values in (10, 20) and (20, 30)
    fr_sibling_path expected = {
        e001,
        e01,
        e1,
    };
    check_sibling_path(tree, 0, expected);
    expected = {
        e000,
        e01,
        e1,
    };
    check_sibling_path(tree, 1, expected);
    expected = {
        e011,
        e00,
        e1,
    };
    check_sibling_path(tree, 2, expected);
    expected = {
        e010,
        e00,
        e1,
    };
    check_sibling_path(tree, 3, expected);
    check_root(tree, root);

    // Check the hash path at index 6 and 7
    expected = {
        e111,
        e10,
        e0,
    };
    check_sibling_path(tree, 6, expected);
    expected = {
        e110,
        e10,
        e0,
    };
    check_sibling_path(tree, 7, expected);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_indexed_tree)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(1);
    ;
    // Create a depth-8 indexed merkle tree
    constexpr uint32_t depth = 8;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, current_size);

    IndexedNullifierLeafType zero_leaf = create_indexed_nullifier_leaf(0, 1, 1);
    check_size(tree, current_size);
    EXPECT_EQ(hash_leaf(get_leaf<NullifierLeafValue>(tree, 0)), hash_leaf(zero_leaf));

    // Add 20 random values to the tree
    for (uint32_t i = 0; i < 20; i++) {
        auto value = fr::random_element();
        add_value(tree, NullifierLeafValue(value));
        ++current_size;
    }

    auto abs_diff = [](uint256_t a, uint256_t b) {
        if (a > b) {
            return (a - b);
        } else {
            return (b - a);
        }
    };

    check_size(tree, current_size);

    // Check if a new random value is not a member of this tree.
    fr new_member = fr::random_element();
    std::vector<uint256_t> differences;
    for (uint32_t i = 0; i < uint32_t(21); i++) {
        uint256_t diff_hi =
            abs_diff(uint256_t(new_member), uint256_t(get_leaf<NullifierLeafValue>(tree, i).leaf.get_key()));
        uint256_t diff_lo =
            abs_diff(uint256_t(new_member), uint256_t(get_leaf<NullifierLeafValue>(tree, i).leaf.get_key()));
        differences.push_back(diff_hi + diff_lo);
    }
    auto it = std::min_element(differences.begin(), differences.end());
    auto index = static_cast<uint32_t>(it - differences.begin());

    // Merkle proof at `index` proves non-membership of `new_member`
    EXPECT_TRUE(verify_sibling_path(tree, get_leaf<NullifierLeafValue>(tree, index), index));
}

TEST_F(PersistedContentAddressedIndexedTreeTest, can_add_single_whilst_reading)
{
    constexpr size_t depth = 10;
    NullifierMemoryTree<HashPolicy> memdb(10);
    fr_sibling_path initial_path = memdb.get_sibling_path(0);
    memdb.update_element(VALUES[0]);
    fr_sibling_path final_sibling_path = memdb.get_sibling_path(0);

    uint32_t num_reads = 16 * 1024;
    std::vector<fr_sibling_path> paths(num_reads);

    {
        std::string name = random_string();
        LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
        std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
        ThreadPoolPtr pool = make_thread_pool(8);
        TreeType tree(std::move(store), pool, 2);

        check_size(tree, 2);

        Signal signal(1 + num_reads);

        auto add_completion = [&](const TypedResponse<AddIndexedDataResponse<NullifierLeafValue>>&) {
            auto commit_completion = [&](const TypedResponse<CommitResponse>&) { signal.signal_decrement(); };
            tree.commit(commit_completion);
        };
        tree.add_or_update_value(VALUES[0], add_completion);

        for (size_t i = 0; i < num_reads; i++) {
            auto completion = [&, i](const TypedResponse<GetSiblingPathResponse>& response) {
                paths[i] = response.inner.path;
                signal.signal_decrement();
            };
            tree.get_sibling_path(0, completion, false);
        }
        signal.wait_for_level();
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_indexed_memory_with_public_data_writes)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<ContentAddressedCachedTreeStore<PublicDataLeafValue>> store =
        std::make_unique<ContentAddressedCachedTreeStore<PublicDataLeafValue>>(name, depth, db);
    auto tree = ContentAddressedIndexedTree<ContentAddressedCachedTreeStore<PublicDataLeafValue>, Poseidon2HashPolicy>(
        std::move(store), workers, current_size);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       0       0        0       0       0       0
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   1       0       0       0        0       0       0       0
     */
    IndexedPublicDataLeafType zero_leaf = create_indexed_public_data_leaf(0, 0, 1, 1);
    IndexedPublicDataLeafType one_leaf = create_indexed_public_data_leaf(1, 0, 0, 0);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), zero_leaf);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), one_leaf);

    /**
     * Add new slot:value 30:5:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      0        0       0       0       0
     *  val       0       0       5       0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value(tree, PublicDataLeafValue(30, 5));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));

    /**
     * Add new slot:value 10:20:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10        0       0       0       0
     *  val       0       0       5       20        0       0       0       0
     *  nextIdx   1       3       0       2         0       0       0       0
     *  nextVal   1       10      0       30        0       0       0       0
     */
    add_value(tree, PublicDataLeafValue(10, 20));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

    /**
     * Update value at slot 30 to 6:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       0       0       0       0
     *  val       0       0       6       20       0       0       0       0
     *  nextIdx   1       3       0       2        0       0       0       0
     *  nextVal   1       10      0       30       0       0       0       0
     */
    add_value(tree, PublicDataLeafValue(30, 6));
    // The size still increases as we pad with an empty leaf
    check_size(tree, ++current_size);

    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 4), create_indexed_public_data_leaf(0, 0, 0, 0));

    /**
     * Add new value slot:value 50:8:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       0       50      0       0
     *  val       0       0       6       20       0       8       0       0
     *  nextIdx   1       3       5       2        0       0       0       0
     *  nextVal   1       10      50      30       0       0       0       0
     */
    add_value(tree, PublicDataLeafValue(50, 8));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 5, 50));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 4), create_indexed_public_data_leaf(0, 0, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 5), create_indexed_public_data_leaf(50, 8, 0, 0));

    // Manually compute the node values
    auto e000 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 0));
    auto e001 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 1));
    auto e010 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 2));
    auto e011 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 3));
    auto e100 = fr::zero(); // tree doesn't hash 0 leaves!
    auto e101 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 5));
    auto e110 = fr::zero();
    auto e111 = fr::zero();

    auto e00 = HashPolicy::hash_pair(e000, e001);
    auto e01 = HashPolicy::hash_pair(e010, e011);
    auto e10 = HashPolicy::hash_pair(e100, e101);
    auto e11 = HashPolicy::hash_pair(e110, e111);

    auto e0 = HashPolicy::hash_pair(e00, e01);
    auto e1 = HashPolicy::hash_pair(e10, e11);
    auto root = HashPolicy::hash_pair(e0, e1);

    fr_sibling_path expected = {
        e001,
        e01,
        e1,
    };
    check_sibling_path(tree, 0, expected);
    expected = {
        e000,
        e01,
        e1,
    };
    check_sibling_path(tree, 1, expected);
    expected = {
        e011,
        e00,
        e1,
    };
    check_sibling_path(tree, 2, expected);
    expected = {
        e010,
        e00,
        e1,
    };
    check_sibling_path(tree, 3, expected);
    check_root(tree, root);

    // Check the hash path at index 6 and 7
    expected = {
        e111,
        e10,
        e0,
    };
    check_sibling_path(tree, 6, expected);
    expected = {
        e110,
        e10,
        e0,
    };
    check_sibling_path(tree, 7, expected);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_indexed_memory_with_sequential_public_data_writes)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<ContentAddressedCachedTreeStore<PublicDataLeafValue>> store =
        std::make_unique<ContentAddressedCachedTreeStore<PublicDataLeafValue>>(name, depth, db);
    auto tree = ContentAddressedIndexedTree<ContentAddressedCachedTreeStore<PublicDataLeafValue>, Poseidon2HashPolicy>(
        std::move(store), workers, current_size);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       0       0        0       0       0       0
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   1       0       0       0        0       0       0       0
     */
    IndexedPublicDataLeafType zero_leaf = create_indexed_public_data_leaf(0, 0, 1, 1);
    IndexedPublicDataLeafType one_leaf = create_indexed_public_data_leaf(1, 0, 0, 0);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), zero_leaf);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), one_leaf);

    /**
     * Add new slot:value 30:5:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      0        0       0       0       0
     *  val       0       0       5       0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 5));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));

    /**
     * Add new slot:value 10:20:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10        0       0       0       0
     *  val       0       0       5       20        0       0       0       0
     *  nextIdx   1       3       0       2         0       0       0       0
     *  nextVal   1       10      0       30        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(10, 20));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

    /**
     * Update value at slot 30 to 6:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       0       0       0       0
     *  val       0       0       6       20       0       0       0       0
     *  nextIdx   1       3       0       2        0       0       0       0
     *  nextVal   1       10      0       30       0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 6));
    // The size does not increase since sequential insertion doesn't pad
    check_size(tree, current_size);

    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

    /**
     * Add new value slot:value 50:8:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       50      0       0       0
     *  val       0       0       6       20       8       0       0       0
     *  nextIdx   1       3       4       2        0       0       0       0
     *  nextVal   1       10      50      30       0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(50, 8));
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 4, 50));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));

    // Manually compute the node values
    auto e000 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 0));
    auto e001 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 1));
    auto e010 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 2));
    auto e011 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 3));
    auto e100 = hash_leaf(get_leaf<PublicDataLeafValue>(tree, 4));
    auto e101 = fr::zero();
    auto e110 = fr::zero();
    auto e111 = fr::zero();

    auto e00 = HashPolicy::hash_pair(e000, e001);
    auto e01 = HashPolicy::hash_pair(e010, e011);
    auto e10 = HashPolicy::hash_pair(e100, e101);
    auto e11 = HashPolicy::hash_pair(e110, e111);

    auto e0 = HashPolicy::hash_pair(e00, e01);
    auto e1 = HashPolicy::hash_pair(e10, e11);
    auto root = HashPolicy::hash_pair(e0, e1);

    fr_sibling_path expected = {
        e001,
        e01,
        e1,
    };
    check_sibling_path(tree, 0, expected);
    expected = {
        e000,
        e01,
        e1,
    };
    check_sibling_path(tree, 1, expected);
    expected = {
        e011,
        e00,
        e1,
    };
    check_sibling_path(tree, 2, expected);
    expected = {
        e010,
        e00,
        e1,
    };
    check_sibling_path(tree, 3, expected);
    check_root(tree, root);

    // Check the hash path at index 6 and 7
    expected = {
        e111,
        e10,
        e0,
    };
    check_sibling_path(tree, 6, expected);
    expected = {
        e110,
        e10,
        e0,
    };
    check_sibling_path(tree, 7, expected);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, returns_low_leaves)
{
    // Create a depth-8 indexed merkle tree
    constexpr uint32_t depth = 8;

    ThreadPoolPtr workers = make_thread_pool(1);
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, 2);

    auto predecessor = get_low_leaf(tree, NullifierLeafValue(42));

    EXPECT_EQ(predecessor.is_already_present, false);
    EXPECT_EQ(predecessor.index, 1);

    add_value(tree, NullifierLeafValue(42));

    predecessor = get_low_leaf(tree, NullifierLeafValue(42));
    // returns the current leaf since it exists already. Inserting 42 again would modify the existing leaf
    EXPECT_EQ(predecessor.is_already_present, true);
    EXPECT_EQ(predecessor.index, 2);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, duplicates)
{
    // Create a depth-8 indexed merkle tree
    constexpr uint32_t depth = 8;

    ThreadPoolPtr workers = make_thread_pool(1);
    ;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, 2);

    add_value(tree, NullifierLeafValue(42));
    check_size(tree, 3);

    commit_tree(tree);

    add_value(tree, NullifierLeafValue(42), false);
    // expect this to fail as no data is present
    commit_tree(tree);
    check_size(tree, 3);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_historic_sibling_path_retrieval)
{
    auto& random_engine = numeric::get_randomness();
    const uint32_t batch_size = 16;
    const uint32_t num_batches = 8;
    std::string name1 = random_string();
    std::string name2 = random_string();
    uint32_t depth = 10;
    ThreadPoolPtr multi_workers = make_thread_pool(8);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    LMDBTreeStore::SharedPtr db1 = std::make_shared<LMDBTreeStore>(_directory, name1, _mapSize, _maxReaders);
    std::unique_ptr<Store> store1 = std::make_unique<Store>(name1, depth, db1);
    auto tree1 = TreeType(std::move(store1), multi_workers, batch_size);

    std::vector<fr_sibling_path> memory_tree_sibling_paths_index_0;

    auto check = [&]() {
        check_root(tree1, memdb.root());
        check_sibling_path(tree1, 0, memdb.get_sibling_path(0));
        check_sibling_path(tree1, 512, memdb.get_sibling_path(512));

        for (uint32_t i = 0; i < memory_tree_sibling_paths_index_0.size(); i++) {
            check_historic_sibling_path(tree1, 0, i + 1, memory_tree_sibling_paths_index_0[i]);
        }
    };

    for (uint32_t i = 0; i < num_batches; i++) {

        check_root(tree1, memdb.root());
        check_sibling_path(tree1, 0, memdb.get_sibling_path(0));
        check_sibling_path(tree1, 512, memdb.get_sibling_path(512));

        std::vector<NullifierLeafValue> batch;

        for (uint32_t j = 0; j < batch_size; j++) {
            batch.emplace_back(random_engine.get_random_uint256());
            memdb.update_element(batch[j].get_key());
        }
        memory_tree_sibling_paths_index_0.push_back(memdb.get_sibling_path(0));
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>> tree1_low_leaf_witness_data;
        std::shared_ptr<std::vector<LeafUpdateWitnessData<NullifierLeafValue>>> tree2_low_leaf_witness_data;
        {
            Signal signal;
            CompletionCallback completion =
                [&](const TypedResponse<AddIndexedDataResponse<NullifierLeafValue>>& response) {
                    tree1_low_leaf_witness_data = response.inner.low_leaf_witness_data;
                    signal.signal_level();
                };
            tree1.add_or_update_values(batch, completion);
            signal.wait_for_level();
        }
        check_root(tree1, memdb.root());
        check_sibling_path(tree1, 0, memdb.get_sibling_path(0));
        check_sibling_path(tree1, 512, memdb.get_sibling_path(512));
        commit_tree(tree1);
        check();
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_historical_leaves)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<ContentAddressedCachedTreeStore<PublicDataLeafValue>> store =
        std::make_unique<ContentAddressedCachedTreeStore<PublicDataLeafValue>>(name, depth, db);
    using LocalTreeType =
        ContentAddressedIndexedTree<ContentAddressedCachedTreeStore<PublicDataLeafValue>, Poseidon2HashPolicy>;
    auto tree = LocalTreeType(std::move(store), workers, current_size);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       0       0        0       0       0       0
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   1       0       0       0        0       0       0       0
     */
    IndexedPublicDataLeafType zero_leaf = create_indexed_public_data_leaf(0, 0, 1, 1);
    IndexedPublicDataLeafType one_leaf = create_indexed_public_data_leaf(1, 0, 0, 0);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), zero_leaf);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), one_leaf);

    /**
     * Add new slot:value 30:5:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      0        0       0       0       0
     *  val       0       0       5       0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 5));
    commit_tree(tree);
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));

    auto leaf1AtBlock1 = PublicDataLeafValue(1, 0);

    /**
     * Add new slot:value 10:20:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10        0       0       0       0
     *  val       0       0       5       20        0       0       0       0
     *  nextIdx   1       3       0       2         0       0       0       0
     *  nextVal   1       10      0       30        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(10, 20));
    check_size(tree, ++current_size);
    commit_tree(tree);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

    auto leaf2AtBlock2 = PublicDataLeafValue(30, 5);
    check_historic_leaf(tree, leaf1AtBlock1, 1, 1, true);

    // should find this leaf at both blocks 1 and 2 as it looks for the slot which doesn't change
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 1, 1, true);
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 2, 1, true);

    /**
     * Update value at slot 30 to 6:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       0       0       0       0
     *  val       0       0       6       20       0       0       0       0
     *  nextIdx   1       3       0       2        0       0       0       0
     *  nextVal   1       10      0       30       0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 6));
    // The size does not increase since sequential insertion doesn't pad
    check_size(tree, current_size);
    commit_tree(tree);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

    auto leaf2AtBlock3 = PublicDataLeafValue(30, 6);
    check_historic_leaf(tree, leaf2AtBlock2, 2, 2, true);

    // should find this leaf at both blocks 1 and 2 as it looks for the slot which doesn't change
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 1, 1, true);
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 2, 1, true);

    /**
     * Add new value slot:value 50:8:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       50      0       0       0
     *  val       0       0       6       20       8       0       0       0
     *  nextIdx   1       3       4       2        0       0       0       0
     *  nextVal   1       10      50      30       0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(50, 8));
    check_size(tree, ++current_size);
    commit_tree(tree);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 4, 50));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));

    check_historic_leaf(tree, leaf2AtBlock3, 2, 3, true);

    // should not be found at block 1
    check_historic_find_leaf_index_from<PublicDataLeafValue, LocalTreeType>(
        tree, { PublicDataLeafValue(10, 20) }, 1, 0, { std::nullopt }, true);
    // should be found at block
    check_historic_find_leaf_index_from(tree, PublicDataLeafValue(10, 20), 2, 0, 3, true);

    GetLowIndexedLeafResponse lowLeaf = get_historic_low_leaf(tree, 1, PublicDataLeafValue(20, 0));
    EXPECT_EQ(lowLeaf.index, 1);

    lowLeaf = get_historic_low_leaf(tree, 2, PublicDataLeafValue(20, 0));
    EXPECT_EQ(lowLeaf.index, 3);

    lowLeaf = get_historic_low_leaf(tree, 2, PublicDataLeafValue(60, 0));
    EXPECT_EQ(lowLeaf.index, 2);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_inserting_a_duplicate_committed_nullifier_should_fail)
{
    const uint32_t batch_size = 16;
    uint32_t depth = 10;
    ThreadPoolPtr multi_workers = make_thread_pool(1);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    std::string name1 = random_string();
    LMDBTreeStore::SharedPtr db1 = std::make_shared<LMDBTreeStore>(_directory, name1, _mapSize, _maxReaders);
    std::unique_ptr<Store> store1 = std::make_unique<Store>(name1, depth, db1);
    auto tree = TreeType(std::move(store1), multi_workers, batch_size);

    std::vector<fr> values = create_values(batch_size);
    std::vector<NullifierLeafValue> nullifierValues(batch_size);
    std::transform(
        values.begin(), values.end(), nullifierValues.begin(), [](const fr& v) { return NullifierLeafValue(v); });

    add_values(tree, nullifierValues);
    commit_tree(tree);

    // create a new set of values
    std::vector<fr> values2 = create_values(batch_size);

    // copy one of the previous values into the middle of the batch
    values2[batch_size / 2] = values[0];
    std::vector<NullifierLeafValue> nullifierValues2(batch_size);
    std::transform(
        values2.begin(), values2.end(), nullifierValues2.begin(), [](const fr& v) { return NullifierLeafValue(v); });
    add_values(tree, nullifierValues2, false);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_inserting_a_duplicate_uncommitted_nullifier_should_fail)
{
    const uint32_t batch_size = 16;
    uint32_t depth = 10;
    ThreadPoolPtr multi_workers = make_thread_pool(1);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    std::string name1 = random_string();
    LMDBTreeStore::SharedPtr db1 = std::make_shared<LMDBTreeStore>(_directory, name1, _mapSize, _maxReaders);
    std::unique_ptr<Store> store1 = std::make_unique<Store>(name1, depth, db1);
    auto tree = TreeType(std::move(store1), multi_workers, batch_size);

    std::vector<fr> values = create_values(batch_size);
    std::vector<NullifierLeafValue> nullifierValues(batch_size);
    std::transform(
        values.begin(), values.end(), nullifierValues.begin(), [](const fr& v) { return NullifierLeafValue(v); });

    add_values(tree, nullifierValues);

    // create a new set of values
    std::vector<fr> values2 = create_values(batch_size);

    // copy one of the previous values into the middle of the batch
    values2[batch_size / 2] = values[0];
    std::vector<NullifierLeafValue> nullifierValues2(batch_size);
    std::transform(
        values2.begin(), values2.end(), nullifierValues2.begin(), [](const fr& v) { return NullifierLeafValue(v); });
    add_values(tree, nullifierValues2, false);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_can_create_forks_at_historic_blocks)
{
    auto& random_engine = numeric::get_randomness();
    const uint32_t batch_size = 16;
    uint32_t depth = 10;
    ThreadPoolPtr multi_workers = make_thread_pool(8);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    std::string name1 = random_string();
    LMDBTreeStore::SharedPtr db1 = std::make_shared<LMDBTreeStore>(_directory, name1, _mapSize, _maxReaders);
    std::unique_ptr<Store> store1 = std::make_unique<Store>(name1, depth, db1);
    auto tree1 = TreeType(std::move(store1), multi_workers, batch_size);

    check_root(tree1, memdb.root());
    check_sibling_path(tree1, 0, memdb.get_sibling_path(0));

    check_sibling_path(tree1, 512, memdb.get_sibling_path(512));

    std::vector<NullifierLeafValue> batch1;
    for (uint32_t j = 0; j < batch_size; j++) {
        batch1.emplace_back(random_engine.get_random_uint256());
        memdb.update_element(batch1[j].nullifier);
    }

    fr_sibling_path block1SiblingPathIndex3 = memdb.get_sibling_path(3 + batch_size);

    add_values(tree1, batch1);
    commit_tree(tree1, true);

    std::vector<NullifierLeafValue> batch2;
    for (uint32_t j = 0; j < batch_size; j++) {
        batch2.emplace_back(random_engine.get_random_uint256());
        memdb.update_element(batch2[j].nullifier);
    }

    add_values(tree1, batch2);
    commit_tree(tree1, true);

    fr block2Root = memdb.root();

    fr_sibling_path block2SiblingPathIndex19 = memdb.get_sibling_path(19 + batch_size);
    fr_sibling_path block2SiblingPathIndex3 = memdb.get_sibling_path(3 + batch_size);

    std::vector<NullifierLeafValue> batch3;
    for (uint32_t j = 0; j < batch_size; j++) {
        batch3.emplace_back(random_engine.get_random_uint256());
        memdb.update_element(batch3[j].nullifier);
    }

    add_values(tree1, batch3);
    commit_tree(tree1, true);

    fr_sibling_path block3SiblingPathIndex35 = memdb.get_sibling_path(35 + batch_size);
    fr_sibling_path block3SiblingPathIndex19 = memdb.get_sibling_path(19 + batch_size);
    fr_sibling_path block3SiblingPathIndex3 = memdb.get_sibling_path(3 + batch_size);

    std::unique_ptr<Store> storeAtBlock2 = std::make_unique<Store>(name1, depth, 2, db1);
    auto treeAtBlock2 = TreeType(std::move(storeAtBlock2), multi_workers, batch_size);

    check_root(treeAtBlock2, block2Root);
    check_sibling_path(treeAtBlock2, 3 + batch_size, block2SiblingPathIndex3, false, true);
    auto block2TreeLeaf10 = get_leaf<NullifierLeafValue>(treeAtBlock2, 7 + batch_size);
    EXPECT_EQ(block2TreeLeaf10.leaf.nullifier, batch1[7].nullifier);

    check_find_leaf_index(treeAtBlock2, batch1[5], 5 + batch_size, true);
    check_find_leaf_index_from(treeAtBlock2, batch1[5], 0, 5 + batch_size, true);

    // should not exist in our image
    get_leaf<NullifierLeafValue>(treeAtBlock2, 35 + batch_size, false, false);
    check_find_leaf_index<NullifierLeafValue, TreeType>(treeAtBlock2, { batch3[4] }, { std::nullopt }, true);

    // now add the same values to our image
    add_values(treeAtBlock2, batch3);

    // the state of our image should match the original tree
    check_sibling_path(tree1, 3 + batch_size, block3SiblingPathIndex3, false, true);
    check_sibling_path(tree1, 19 + batch_size, block3SiblingPathIndex19, false, true);
    check_sibling_path(tree1, 35 + batch_size, block3SiblingPathIndex35, false, true);

    // needs to use uncommitted for this check
    check_sibling_path(treeAtBlock2, 3 + batch_size, block3SiblingPathIndex3, true, true);
    check_sibling_path(treeAtBlock2, 19 + batch_size, block3SiblingPathIndex19, true, true);
    check_sibling_path(treeAtBlock2, 35 + batch_size, block3SiblingPathIndex35, true, true);

    // now check historic data
    auto historicSiblingPath = get_historic_sibling_path(treeAtBlock2, 1, 3 + batch_size);
    EXPECT_EQ(historicSiblingPath, block1SiblingPathIndex3);
    check_historic_find_leaf_index(treeAtBlock2, batch1[3], 1, 3 + batch_size, true);
    check_historic_find_leaf_index(treeAtBlock2, batch3[3], 2, 35 + batch_size, true, true);
    check_historic_find_leaf_index<NullifierLeafValue, TreeType>(
        treeAtBlock2, { batch3[3] }, 2, { std::nullopt }, true, false);

    check_historic_find_leaf_index_from(treeAtBlock2, batch1[3], 2, 0, 3 + batch_size, true, false);
    check_historic_find_leaf_index_from<NullifierLeafValue, TreeType>(
        treeAtBlock2, { batch3[3] }, 2, 20 + batch_size, { std::nullopt }, true, false);
    check_historic_find_leaf_index_from(treeAtBlock2, batch3[3], 2, 20 + batch_size, 35 + batch_size, true, true);

    check_unfinalised_block_height(treeAtBlock2, 2);

    // It should be impossible to commit using the image
    commit_tree(treeAtBlock2, false);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_remove_historical_blocks)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<ContentAddressedCachedTreeStore<PublicDataLeafValue>> store =
        std::make_unique<ContentAddressedCachedTreeStore<PublicDataLeafValue>>(name, depth, db);
    using LocalTreeType =
        ContentAddressedIndexedTree<ContentAddressedCachedTreeStore<PublicDataLeafValue>, Poseidon2HashPolicy>;
    auto tree = LocalTreeType(std::move(store), workers, current_size);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       0       0        0       0       0       0
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   1       0       0       0        0       0       0       0
     */
    IndexedPublicDataLeafType zero_leaf = create_indexed_public_data_leaf(0, 0, 1, 1);
    IndexedPublicDataLeafType one_leaf = create_indexed_public_data_leaf(1, 0, 0, 0);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), zero_leaf);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), one_leaf);

    /**
     * Add new slot:value 30:5:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      0        0       0       0       0
     *  val       0       0       5       0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 5));
    commit_tree(tree);
    check_size(tree, ++current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));

    auto leaf1AtBlock1 = PublicDataLeafValue(1, 0);
    check_block_and_size_data(db, 1, current_size, true);

    /**
     * Add new slot:value 10:20:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10        0       0       0       0
     *  val       0       0       5       20        0       0       0       0
     *  nextIdx   1       3       0       2         0       0       0       0
     *  nextVal   1       10      0       30        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(10, 20));
    check_size(tree, ++current_size);
    commit_tree(tree);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

    check_block_and_size_data(db, 2, current_size, true);

    auto leaf2AtBlock2 = PublicDataLeafValue(30, 5);
    check_historic_leaf(tree, leaf1AtBlock1, 1, 1, true);

    // shoudl find this leaf at both blocks 1 and 2 as it looks for the slot which doesn't change
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 1, 1, true);
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 2, 1, true);

    /**
     * Update value at slot 30 to 6:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       0       0       0       0
     *  val       0       0       6       20       0       0       0       0
     *  nextIdx   1       3       0       2        0       0       0       0
     *  nextVal   1       10      0       30       0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 6));
    check_size(tree, current_size);
    commit_tree(tree);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

    check_block_and_size_data(db, 3, current_size, true);

    auto leaf2AtBlock3 = PublicDataLeafValue(30, 6);
    check_historic_leaf(tree, leaf2AtBlock2, 2, 2, true);

    // should find this leaf at both blocks 1 and 2 as it looks for the slot which doesn't change
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 1, 1, true);
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 2, 1, true);

    /**
     * Add new value slot:value 50:8:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       50      0      0       0
     *  val       0       0       6       20       8       0       0       0
     *  nextIdx   1       3       4       2        0       0       0       0
     *  nextVal   1       10      50      30       0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(50, 8));
    check_size(tree, ++current_size);
    commit_tree(tree);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 4, 50));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));

    check_block_and_size_data(db, 4, current_size, true);

    check_historic_leaf(tree, leaf2AtBlock3, 2, 3, true);

    // should not be found at block 1
    check_historic_find_leaf_index_from<PublicDataLeafValue, LocalTreeType>(
        tree, { PublicDataLeafValue(10, 20) }, 1, 0, { std::nullopt }, true);
    // should be found at block
    check_historic_find_leaf_index_from(tree, PublicDataLeafValue(10, 20), 2, 0, 3, true);

    GetLowIndexedLeafResponse lowLeaf = get_historic_low_leaf(tree, 1, PublicDataLeafValue(20, 0));
    EXPECT_EQ(lowLeaf.index, 1);

    lowLeaf = get_historic_low_leaf(tree, 2, PublicDataLeafValue(20, 0));
    EXPECT_EQ(lowLeaf.index, 3);

    lowLeaf = get_historic_low_leaf(tree, 2, PublicDataLeafValue(60, 0));
    EXPECT_EQ(lowLeaf.index, 2);

    finalise_block(tree, 3);

    // remove historical block 1
    remove_historic_block(tree, 1);

    // Historic queries against block 1 should no longer work
    check_historic_leaf(tree, leaf1AtBlock1, 1, 1, false);
    check_historic_find_leaf_index<PublicDataLeafValue, LocalTreeType>(
        tree, { leaf1AtBlock1 }, 1, { std::nullopt }, false);

    // Queries against block 2 should work
    check_historic_leaf(tree, leaf2AtBlock2, 2, 2, true);
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 2, 1, true);

    // now remove block 2 and queries against it should no longer work
    remove_historic_block(tree, 2);
    check_historic_leaf(tree, leaf2AtBlock2, 2, 2, false);

    // size doesn't matter, should fail to find the data
    check_block_and_size_data(db, 1, current_size, false);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_unwind_blocks)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<ContentAddressedCachedTreeStore<PublicDataLeafValue>> store =
        std::make_unique<ContentAddressedCachedTreeStore<PublicDataLeafValue>>(name, depth, db);
    using LocalTreeType =
        ContentAddressedIndexedTree<ContentAddressedCachedTreeStore<PublicDataLeafValue>, Poseidon2HashPolicy>;
    auto tree = LocalTreeType(std::move(store), workers, current_size);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       0       0        0       0       0       0
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   1       0       0       0        0       0       0       0
     */
    IndexedPublicDataLeafType zero_leaf = create_indexed_public_data_leaf(0, 0, 1, 1);
    IndexedPublicDataLeafType one_leaf = create_indexed_public_data_leaf(1, 0, 0, 0);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), zero_leaf);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), one_leaf);

    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);

    check_indices_data(db, 0, 0, true, true);
    check_indices_data(db, 1, 1, true, true);

    /**
     * Add new slot:value 30:5:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      0        0       0       0       0
     *  val       0       0       5       0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 5));
    commit_tree(tree);
    check_size(tree, ++current_size);

    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));

    check_block_and_size_data(db, 1, current_size, true);

    // All historical pre-images should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 2, 30), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);

    check_indices_data(db, 30, 2, true, true);

    auto leaf1AtBlock1 = PublicDataLeafValue(1, 0);

    /**
     * Add new slot:value 10:20:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10        0       0       0       0
     *  val       0       0       5       20        0       0       0       0
     *  nextIdx   1       3       0       2         0       0       0       0
     *  nextVal   1       10      0       30        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(10, 20));
    check_size(tree, ++current_size);
    commit_tree(tree);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

    // All historical pre-images should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 3, 10), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(10, 20, 2, 30), true);

    check_indices_data(db, 10, 3, true, true);

    check_block_and_size_data(db, 2, current_size, true);

    auto leaf2AtBlock2 = PublicDataLeafValue(30, 5);
    check_historic_leaf(tree, leaf1AtBlock1, 1, 1, true);

    // shoudl find this leaf at both blocks 1 and 2 as it looks for the slot which doesn't change
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 1, 1, true);
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 2, 1, true);

    /**
     * Update value at slot 30 to 6:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       0       0       0       0
     *  val       0       0       6       20       0       0       0       0
     *  nextIdx   1       3       0       2        0       0       0       0
     *  nextVal   1       10      0       30       0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 6));
    check_size(tree, current_size);
    commit_tree(tree);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 0, 0));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

    // All historical pre-images should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 3, 10), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(10, 20, 2, 30), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 6, 0, 0), true);

    // Zero leaves should not have their indices added
    check_indices_data(db, 0, 4, true, false);

    check_block_and_size_data(db, 3, current_size, true);

    auto leaf2AtBlock3 = PublicDataLeafValue(30, 6);
    check_historic_leaf(tree, leaf2AtBlock2, 2, 2, true);

    // should find this leaf at both blocks 1 and 2 as it looks for the slot which doesn't change
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 1, 1, true);
    check_historic_find_leaf_index(tree, leaf1AtBlock1, 2, 1, true);

    /**
     * Add new value slot:value 50:8:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       50      0      0       0
     *  val       0       0       6       20       8       0       0       0
     *  nextIdx   1       3       4       2        0       0       0       0
     *  nextVal   1       10      50      30       0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(50, 8));
    check_size(tree, ++current_size);
    commit_tree(tree);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 4, 50));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));

    check_indices_data(db, 50, 4, true, true);
    // All historical pre-images should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 3, 10), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(10, 20, 2, 30), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 6, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(50, 8, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 6, 4, 50), true);

    check_block_and_size_data(db, 4, current_size, true);

    check_historic_leaf(tree, leaf2AtBlock3, 2, 3, true);

    // should not be found at block 1
    check_historic_find_leaf_index_from<PublicDataLeafValue, LocalTreeType>(
        tree, { PublicDataLeafValue(10, 20) }, 1, 0, { std::nullopt }, true);
    // should be found at block
    check_historic_find_leaf_index_from(tree, PublicDataLeafValue(10, 20), 2, 0, 3, true);

    GetLowIndexedLeafResponse lowLeaf = get_historic_low_leaf(tree, 1, PublicDataLeafValue(20, 0));
    EXPECT_EQ(lowLeaf.index, 1);

    lowLeaf = get_historic_low_leaf(tree, 2, PublicDataLeafValue(20, 0));
    EXPECT_EQ(lowLeaf.index, 3);

    lowLeaf = get_historic_low_leaf(tree, 2, PublicDataLeafValue(60, 0));
    EXPECT_EQ(lowLeaf.index, 2);

    unwind_block(tree, 4);

    // Index 4 should be removed
    check_indices_data(db, 50, 4, false, false);
    // The pre-images created before block 4 should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 3, 10), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(10, 20, 2, 30), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 6, 0, 0), true);

    // The pre-images created in block 4 should be gone
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(50, 8, 0, 0), false);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 6, 4, 50), false);

    check_size(tree, --current_size);

    // should fail to find block 4
    check_block_and_size_data(db, 4, current_size, false);

    // block 3 should work
    check_block_and_size_data(db, 3, current_size, true);

    // should fail to find the leaf at index 4
    check_find_leaf_index<PublicDataLeafValue, LocalTreeType>(
        tree, { PublicDataLeafValue(50, 8) }, { std::nullopt }, true);
    check_find_leaf_index_from<PublicDataLeafValue, LocalTreeType>(
        tree, { PublicDataLeafValue(50, 8) }, 0, { std::nullopt }, true);

    // the leaf at index 2 should no longer be as it was after block 5
    EXPECT_NE(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 4, 50));

    // it should be as it was after block 4
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 0, 0));

    unwind_block(tree, 3);

    // The pre-images created before block 3 should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 3, 10), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(10, 20, 2, 30), true);

    check_size(tree, current_size);

    // the leaf at index 2 should no longer be as it was after block 4
    EXPECT_NE(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 6, 0, 0));

    // it should be as it was after block 3
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_unwind_duplicate_block)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<ContentAddressedCachedTreeStore<PublicDataLeafValue>> store =
        std::make_unique<ContentAddressedCachedTreeStore<PublicDataLeafValue>>(name, depth, db);
    auto tree = ContentAddressedIndexedTree<ContentAddressedCachedTreeStore<PublicDataLeafValue>, Poseidon2HashPolicy>(
        std::move(store), workers, current_size);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       0       0        0       0       0       0
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   1       0       0       0        0       0       0       0
     */
    IndexedPublicDataLeafType zero_leaf = create_indexed_public_data_leaf(0, 0, 1, 1);
    IndexedPublicDataLeafType one_leaf = create_indexed_public_data_leaf(1, 0, 0, 0);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), zero_leaf);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), one_leaf);

    /**
     * Add new slot:value 30:5:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      0        0       0       0       0
     *  val       0       0       5       0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 5));
    commit_tree(tree);
    check_size(tree, ++current_size);
    fr rootAfterBlock1 = get_root(tree, false);
    fr_sibling_path pathAfterBlock1 = get_sibling_path(tree, 0, false);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));

    check_block_and_size_data(db, 1, current_size, true);

    // All historical pre-images should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 2, 30), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);

    check_indices_data(db, 30, 2, true, true);

    /**
     * Update slot:value 30:8:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      0        0       0       0       0
     *  val       0       0       8       0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 8));
    commit_tree(tree);
    check_size(tree, current_size);
    fr rootAfterBlock2 = get_root(tree, false);
    fr_sibling_path pathAfterBlock2 = get_sibling_path(tree, 0, false);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 8, 0, 0));

    // All historical pre-images should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 2, 30), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 8, 0, 0), true);

    check_indices_data(db, 30, 2, true, true);

    /**
     * Revert slot:value 30:5:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      0        0       0       0       0
     *  val       0       0       5       0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 5));
    commit_tree(tree);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));

    // All historical pre-images should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 2, 30), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 8, 0, 0), true);

    check_indices_data(db, 30, 2, true, true);

    // Unwind block 3 and the state should be reverted back to block 2
    unwind_block(tree, 3);

    check_root(tree, rootAfterBlock2);
    check_sibling_path(tree, 0, pathAfterBlock2, false);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 8, 0, 0));

    // All historical pre-images should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 2, 30), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 8, 0, 0), true);

    check_indices_data(db, 30, 2, true, true);

    // Unwind block 2 and the state should be reverted back to block 1
    unwind_block(tree, 2);

    check_root(tree, rootAfterBlock1);
    check_sibling_path(tree, 0, pathAfterBlock1, false);
    check_size(tree, current_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 5, 0, 0));

    // All historical pre-images should be present
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, zero_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, one_leaf, true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(1, 0, 2, 30), true);
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 5, 0, 0), true);

    // Check the pre-image was removed
    check_leaf_by_hash<PublicDataLeafValue, HashPolicy>(db, create_indexed_public_data_leaf(30, 8, 0, 0), false);

    check_indices_data(db, 30, 2, true, true);

    // Now apply block 2 again and it should be moved forward back tot where it was
    add_value(tree, PublicDataLeafValue(30, 8));
    commit_tree(tree);
    check_size(tree, ++current_size);
    check_root(tree, rootAfterBlock2);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), create_indexed_public_data_leaf(1, 0, 2, 30));
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), create_indexed_public_data_leaf(30, 8, 0, 0));
}

void test_nullifier_tree_unwind(std::string directory,
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
    ThreadPoolPtr pool = make_thread_pool(8);
    TreeType tree(std::move(store), pool, blockSize);
    NullifierMemoryTree<Poseidon2HashPolicy> memdb(depth, blockSize);

    auto it = std::find_if(values.begin(), values.end(), [&](const fr& v) { return v != fr::zero(); });
    bool emptyBlocks = it == values.end();

    uint32_t batchSize = blockSize;

    std::vector<fr_sibling_path> historicPathsZeroIndex;
    std::vector<fr_sibling_path> historicPathsMaxIndex;
    std::vector<fr> roots;

    fr initialRoot = memdb.root();
    fr_sibling_path initialPath = memdb.get_sibling_path(0);

    std::vector<NullifierLeafValue> leafValues;
    leafValues.reserve(values.size());
    for (const fr& v : values) {
        leafValues.emplace_back(v);
    }

    for (uint32_t i = 0; i < numBlocks; i++) {
        std::vector<NullifierLeafValue> to_add;

        for (size_t j = 0; j < batchSize; ++j) {
            size_t ind = i * batchSize + j;
            memdb.update_element(values[ind]);
            to_add.push_back(leafValues[ind]);
        }
        // Indexed trees have an initial 'batch' inserted at startup
        index_t expected_size = (i + 2) * batchSize;
        add_values(tree, to_add);
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
        const block_number_t blockNumber = numBlocks - i;

        check_block_and_root_data(db, blockNumber, roots[blockNumber - 1], true);
        unwind_block(tree, blockNumber);
        if (emptyBlocks) {
            // with empty blocks, we should not find the block data but we do find the root
            check_block_and_root_data(db, blockNumber, roots[blockNumber - 1], false, true);
        } else {
            // if blocks are not empty, this query should fail
            check_block_and_root_data(db, blockNumber, roots[blockNumber - 1], false);
        }

        const index_t previousValidBlock = blockNumber - 1;
        // Indexed trees have an initial 'batch' inserted at startup
        index_t deletedBlockStartIndex = (1 + previousValidBlock) * batchSize;
        index_t deletedBlockStartIndexIntoLocalValues = previousValidBlock * batchSize;

        check_block_height(tree, previousValidBlock);
        check_size(tree, deletedBlockStartIndex);
        check_root(tree, previousValidBlock == 0 ? initialRoot : roots[previousValidBlock - 1]);

        // The zero index sibling path should be as it was at the previous block
        check_sibling_path(tree,
                           0,
                           previousValidBlock == 0 ? initialPath : historicPathsZeroIndex[previousValidBlock - 1],
                           false,
                           true);

        if (!emptyBlocks) {
            // Trying to find leaves appended in the block that was removed should fail
            get_leaf<NullifierLeafValue>(tree, 1 + deletedBlockStartIndex, false, false);

            check_find_leaf_index<NullifierLeafValue, TreeType>(
                tree, { leafValues[1 + deletedBlockStartIndexIntoLocalValues] }, { std::nullopt }, true);
        }

        for (index_t j = 0; j < numBlocks; j++) {
            block_number_t historicBlockNumber = static_cast<block_number_t>(j + 1);
            bool expectedSuccess = historicBlockNumber <= previousValidBlock;
            check_historic_sibling_path(
                tree, 0, historicBlockNumber, historicPathsZeroIndex[j], false, expectedSuccess);
            index_t maxSizeAtBlock = ((j + 2) * batchSize) - 1;
            check_historic_sibling_path(
                tree, maxSizeAtBlock, historicBlockNumber, historicPathsMaxIndex[j], false, expectedSuccess);

            if (emptyBlocks) {
                continue;
            }
            const index_t leafIndex = 1;
            const index_t expectedIndexInTree = leafIndex + batchSize;
            check_historic_leaf(
                tree, leafValues[leafIndex], expectedIndexInTree, historicBlockNumber, expectedSuccess, false);

            std::vector<std::optional<index_t>> expectedResults;
            if (expectedSuccess) {
                expectedResults.emplace_back(std::make_optional(expectedIndexInTree));
            }
            check_historic_find_leaf_index<NullifierLeafValue, TreeType>(
                tree, { leafValues[leafIndex] }, historicBlockNumber, expectedResults, expectedSuccess, true);
            check_historic_find_leaf_index_from<NullifierLeafValue, TreeType>(
                tree, { leafValues[leafIndex] }, historicBlockNumber, 0, expectedResults, expectedSuccess, true);
        }
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, can_sync_and_unwind_blocks)
{

    constexpr uint32_t numBlocks = 8;
    constexpr uint32_t numBlocksToUnwind = 4;
    std::vector<uint32_t> blockSizes = { 2, 4, 8, 16, 32 };
    for (const uint32_t& size : blockSizes) {
        uint32_t actualSize = size;
        std::vector<fr> values = create_values(actualSize * numBlocks);
        std::stringstream ss;
        ss << "DB " << actualSize;
        test_nullifier_tree_unwind(
            _directory, ss.str(), _mapSize, _maxReaders, 20, actualSize, numBlocks, numBlocksToUnwind, values);
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, can_sync_and_unwind_empty_blocks)
{

    constexpr uint32_t numBlocks = 8;
    constexpr uint32_t numBlocksToUnwind = 4;
    std::vector<uint32_t> blockSizes = { 2, 4, 8, 16, 32 };
    for (const uint32_t& size : blockSizes) {
        uint32_t actualSize = size;
        std::vector<fr> values = std::vector<fr>(actualSize * numBlocks, fr::zero());
        std::stringstream ss;
        ss << "DB " << actualSize;
        test_nullifier_tree_unwind(
            _directory, ss.str(), _mapSize, _maxReaders, 20, actualSize, numBlocks, numBlocksToUnwind, values);
    }
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_prefilled_public_data)
{
    ThreadPoolPtr workers = make_thread_pool(1);
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<PublicDataStore> store = std::make_unique<PublicDataStore>(name, depth, db);

    index_t initial_size = 4;
    std::vector<PublicDataLeafValue> prefilled_values = { PublicDataLeafValue(3, 9), PublicDataLeafValue(5, 7) };
    auto tree = PublicDataTreeType(std::move(store), workers, initial_size, prefilled_values);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       3       5        0       0       0       0
     *  val       0       0       9       7        0       0       0       0
     *  nextIdx   1       2       3       0        0       0       0       0
     *  nextVal   1       3       5       0        0       0       0       0
     */
    IndexedPublicDataLeafType leaf_0 = create_indexed_public_data_leaf(0, 0, 1, 1);
    IndexedPublicDataLeafType leaf_1 = create_indexed_public_data_leaf(1, 0, 2, 3);
    IndexedPublicDataLeafType leaf_2 = create_indexed_public_data_leaf(3, 9, 3, 5);
    IndexedPublicDataLeafType leaf_3 = create_indexed_public_data_leaf(5, 7, 0, 0);
    check_size(tree, initial_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), leaf_0);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), leaf_1);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), leaf_2);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), leaf_3);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_full_prefilled_public_data)
{
    ThreadPoolPtr workers = make_thread_pool(1);
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<PublicDataStore> store = std::make_unique<PublicDataStore>(name, depth, db);

    index_t initial_size = 4;
    std::vector<PublicDataLeafValue> prefilled_values = {
        PublicDataLeafValue(1, 2), PublicDataLeafValue(3, 4), PublicDataLeafValue(5, 6), PublicDataLeafValue(7, 8)
    };
    auto tree = PublicDataTreeType(std::move(store), workers, initial_size, prefilled_values);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       3       5        0       0       0       0
     *  val       0       0       9       7        0       0       0       0
     *  nextIdx   1       2       3       0        0       0       0       0
     *  nextVal   1       3       5       0        0       0       0       0
     */
    IndexedPublicDataLeafType leaf_0 = create_indexed_public_data_leaf(1, 2, 1, 3);
    IndexedPublicDataLeafType leaf_1 = create_indexed_public_data_leaf(3, 4, 2, 5);
    IndexedPublicDataLeafType leaf_2 = create_indexed_public_data_leaf(5, 6, 3, 7);
    IndexedPublicDataLeafType leaf_3 = create_indexed_public_data_leaf(7, 8, 0, 1);
    check_size(tree, initial_size);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 0), leaf_0);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 1), leaf_1);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 2), leaf_2);
    EXPECT_EQ(get_leaf<PublicDataLeafValue>(tree, 3), leaf_3);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_prefilled_unsorted_public_data_should_fail)
{
    ThreadPoolPtr workers = make_thread_pool(1);
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<PublicDataStore> store = std::make_unique<PublicDataStore>(name, depth, db);

    index_t initial_size = 4;
    // The prefilled values are not sorted: 5 > 3.
    std::vector<PublicDataLeafValue> prefilled_values = { PublicDataLeafValue(5, 7), PublicDataLeafValue(3, 9) };
    EXPECT_THROW(PublicDataTreeType(std::move(store), workers, initial_size, prefilled_values), std::runtime_error);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_prefilled_default_public_data_should_fail)
{
    ThreadPoolPtr workers = make_thread_pool(1);
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<PublicDataStore> store = std::make_unique<PublicDataStore>(name, depth, db);

    index_t initial_size = 4;
    // The first prefilled value is the same as one of the default values (1).
    std::vector<PublicDataLeafValue> prefilled_values = { PublicDataLeafValue(1, 9), PublicDataLeafValue(5, 7) };
    EXPECT_THROW(PublicDataTreeType(std::move(store), workers, initial_size, prefilled_values), std::runtime_error);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, test_can_commit_and_revert_checkpoints)
{
    index_t initial_size = 2;
    index_t current_size = initial_size;
    ThreadPoolPtr workers = make_thread_pool(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = random_string();
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<ContentAddressedCachedTreeStore<PublicDataLeafValue>> store =
        std::make_unique<ContentAddressedCachedTreeStore<PublicDataLeafValue>>(name, depth, db);
    auto tree = ContentAddressedIndexedTree<ContentAddressedCachedTreeStore<PublicDataLeafValue>, Poseidon2HashPolicy>(
        std::move(store), workers, current_size);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       0       0        0       0       0       0
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   1       0       0       0        0       0       0       0
     */

    /**
     * Add new slot:value 30:5:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      0        0       0       0       0
     *  val       0       0       5       0        0       0       0       0
     *  nextIdx   1       2       0       0        0       0       0       0
     *  nextVal   1       30      0       0        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 5));
    check_size(tree, ++current_size);

    /**
     * Add new slot:value 10:20:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10        0       0       0       0
     *  val       0       0       5       20        0       0       0       0
     *  nextIdx   1       3       0       2         0       0       0       0
     *  nextVal   1       10      0       30        0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(10, 20));
    check_size(tree, ++current_size);

    /**
     * Update value at slot 30 to 6:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  slot      0       1       30      10       0       0       0       0
     *  val       0       0       6       20       0       0       0       0
     *  nextIdx   1       3       0       2        0       0       0       0
     *  nextVal   1       10      0       30       0       0       0       0
     */
    add_value_sequentially(tree, PublicDataLeafValue(30, 6));
    // The size does not increase since sequential insertion doesn't pad
    check_size(tree, current_size);
    commit_tree(tree);

    {
        index_t fork_size = current_size;
        std::unique_ptr<ContentAddressedCachedTreeStore<PublicDataLeafValue>> forkStore =
            std::make_unique<ContentAddressedCachedTreeStore<PublicDataLeafValue>>(name, depth, db);
        auto forkTree =
            ContentAddressedIndexedTree<ContentAddressedCachedTreeStore<PublicDataLeafValue>, Poseidon2HashPolicy>(
                std::move(forkStore), workers, initial_size);

        // Find the low leaf of slot 60
        auto predecessor = get_low_leaf(forkTree, PublicDataLeafValue(60, 5));

        // It should be at index 2
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 2);

        // checkpoint the fork
        checkpoint_tree(forkTree);

        /**
         * Add new value slot:value 50:8:
         *
         *  index     0       1       2       3        4       5       6       7
         *  ---------------------------------------------------------------------
         *  slot      0       1       30      10       50      0       0       0
         *  val       0       0       6       20       8       0       0       0
         *  nextIdx   1       3       4       2        0       0       0       0
         *  nextVal   1       10      50      30       0       0       0       0
         */
        add_value_sequentially(forkTree, PublicDataLeafValue(50, 8));
        check_size(forkTree, ++fork_size);
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 2), create_indexed_public_data_leaf(30, 6, 4, 50));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));

        // Find the low leaf of slot 60
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(60, 5));

        // It should be at index 4
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 4);

        // Now revert the fork and see that it is rolled back to the checkpoint
        revert_checkpoint_tree(forkTree);
        check_size(forkTree, --fork_size);
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 2), create_indexed_public_data_leaf(30, 6, 0, 0));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));

        // Find the low leaf of slot 60
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(60, 5));

        // It should be back at index 2
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 2);

        // checkpoint the fork again
        checkpoint_tree(forkTree);

        // We now advance the fork again by a few checkpoints

        /**
         * Add new value slot:value 50:8:
         *
         *  index     0       1       2       3        4       5       6       7
         *  ---------------------------------------------------------------------
         *  slot      0       1       30      10       50      0       0       0
         *  val       0       0       6       20       8       0       0       0
         *  nextIdx   1       3       4       2        0       0       0       0
         *  nextVal   1       10      50      30       0       0       0       0
         */

        // Make the same change again, commit the checkpoint and see that the changes remain
        add_value_sequentially(forkTree, PublicDataLeafValue(50, 8));
        check_size(forkTree, ++fork_size);
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 2), create_indexed_public_data_leaf(30, 6, 4, 50));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));

        // Find the low leaf of slot 60
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(60, 5));

        // It should be back at index 4
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 4);

        // Checkpoint again
        checkpoint_tree(forkTree);

        /**
         * Update the value in slot 30 to 12:
         *
         *  index     0       1       2       3        4       5       6       7
         *  ---------------------------------------------------------------------
         *  slot      0       1       30      10       50      0       0       0
         *  val       0       0       12      20       8       0       0       0
         *  nextIdx   1       3       4       2        0       0       0       0
         *  nextVal   1       10      50      30       0       0       0       0
         */
        add_value_sequentially(forkTree, PublicDataLeafValue(30, 12));
        check_size(forkTree, fork_size);
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 2), create_indexed_public_data_leaf(30, 12, 4, 50));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));

        // Find the low leaf of slot 60
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(60, 5));

        // It should be back at index 4
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 4);

        // Checkpoint again
        checkpoint_tree(forkTree);

        /**
         * Add a value at slot 45:15
         *
         *  index     0       1       2       3        4       5       6       7
         *  ---------------------------------------------------------------------
         *  slot      0       1       30      10       50      45      0       0
         *  val       0       0       12      20       8       15      0       0
         *  nextIdx   1       3       5       2        0       4       0       0
         *  nextVal   1       10      45      30       0       50      0       0
         */
        add_value_sequentially(forkTree, PublicDataLeafValue(45, 15));

        check_size(forkTree, ++fork_size);
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 2), create_indexed_public_data_leaf(30, 12, 5, 45));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 5), create_indexed_public_data_leaf(45, 15, 4, 50));

        // Find the low leaf of slot 60
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(60, 5));

        // It should be back at index 4
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 4);

        // Find the low leaf of slot 46
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(46, 5));

        // It should be back at index 4
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 5);

        // Now commit the last checkpoint
        commit_checkpoint_tree(forkTree);

        // The state should be identical
        check_size(forkTree, fork_size);
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 2), create_indexed_public_data_leaf(30, 12, 5, 45));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 5), create_indexed_public_data_leaf(45, 15, 4, 50));

        // Find the low leaf of slot 60
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(60, 5));

        // It should be back at index 4
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 4);

        // Find the low leaf of slot 46
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(46, 5));

        // It should be back at index 4
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 5);

        // Now revert the fork and we should remove both the new slot 45 and the update to slot 30

        /**
         * We should revert to this state:
         *
         *  index     0       1       2       3        4       5       6       7
         *  ---------------------------------------------------------------------
         *  slot      0       1       30      10       50      0       0       0
         *  val       0       0       6       20       8       0       0       0
         *  nextIdx   1       3       4       2        0       0       0       0
         *  nextVal   1       10      50      30       0       0       0       0
         */

        revert_checkpoint_tree(forkTree);

        check_size(forkTree, --fork_size);
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 0), create_indexed_public_data_leaf(0, 0, 1, 1));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 1), create_indexed_public_data_leaf(1, 0, 3, 10));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 2), create_indexed_public_data_leaf(30, 6, 4, 50));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 3), create_indexed_public_data_leaf(10, 20, 2, 30));
        EXPECT_EQ(get_leaf<PublicDataLeafValue>(forkTree, 4), create_indexed_public_data_leaf(50, 8, 0, 0));

        // Find the low leaf of slot 60
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(60, 5));

        // It should be back at index 4
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 4);

        // Find the low leaf of slot 46
        predecessor = get_low_leaf(forkTree, PublicDataLeafValue(46, 5));

        // It should be back at index 4
        EXPECT_EQ(predecessor.is_already_present, false);
        EXPECT_EQ(predecessor.index, 2);
    }
}

void advance_state(TreeType& fork, uint32_t size)
{
    std::vector<fr> values = create_values(size);
    std::vector<NullifierLeafValue> leaves;
    for (uint32_t j = 0; j < size; j++) {
        leaves.emplace_back(values[j]);
    }
    add_values(fork, leaves);
}

TEST_F(PersistedContentAddressedIndexedTreeTest, nullifiers_can_be_inserted_after_revert)
{
    index_t current_size = 2;
    ThreadPoolPtr workers = make_thread_pool(1);
    constexpr size_t depth = 10;
    std::string name = "Nullifier Tree";
    LMDBTreeStore::SharedPtr db = std::make_shared<LMDBTreeStore>(_directory, name, _mapSize, _maxReaders);
    std::unique_ptr<Store> store = std::make_unique<Store>(name, depth, db);
    auto tree = TreeType(std::move(store), workers, current_size);

    {
        std::unique_ptr<Store> forkStore = std::make_unique<Store>(name, depth, db);
        auto forkTree = TreeType(std::move(forkStore), workers, current_size);

        check_size(tree, current_size);

        uint32_t size_to_insert = 8;
        uint32_t num_insertions = 5;

        for (uint32_t i = 0; i < num_insertions - 1; i++) {
            advance_state(forkTree, size_to_insert);
            current_size += size_to_insert;
            check_size(forkTree, current_size);
            checkpoint_tree(forkTree);
        }

        advance_state(forkTree, size_to_insert);
        current_size += size_to_insert;
        check_size(forkTree, current_size);
        revert_checkpoint_tree(forkTree);

        current_size -= size_to_insert;
        check_size(forkTree, current_size);

        commit_checkpoint_tree(forkTree);

        check_size(forkTree, current_size);

        advance_state(forkTree, size_to_insert);

        current_size += size_to_insert;
        check_size(forkTree, current_size);
    }
}
