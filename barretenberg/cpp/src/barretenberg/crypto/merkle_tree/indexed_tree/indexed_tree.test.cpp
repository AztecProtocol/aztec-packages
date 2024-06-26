#include "indexed_tree.hpp"
#include "../fixtures.hpp"
#include "../hash.hpp"
#include "../node_store/array_store.hpp"
#include "../nullifier_tree/nullifier_memory_tree.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_tree_store.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <cstdint>
#include <filesystem>
#include <memory>
#include <vector>

using namespace bb;
using namespace bb::crypto::merkle_tree;

using HashPolicy = Poseidon2HashPolicy;

using Store = CachedTreeStore<LMDBStore, nullifier_leaf_value>;
using TreeType = IndexedTree<Store, HashPolicy>;
using IndexedLeafType = indexed_leaf<nullifier_leaf_value>;

using CompletionCallback = TreeType::add_completion_callback;

class PersistedIndexedTreeTest : public testing::Test {
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

std::string PersistedIndexedTreeTest::_directory;

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

fr get_root(TreeType& tree, bool includeUncommitted = true)
{
    fr r;
    Signal signal(1);
    auto completion = [&](const std::string&, uint32_t, const index_t&, const fr& root) -> void {
        r = root;
        signal.signal_level(0);
    };
    tree.get_meta_data(includeUncommitted, completion);
    signal.wait_for_level(0);
    return r;
}

void check_root(TreeType& tree, fr expected_root, bool includeUncommitted = true)
{
    fr root = get_root(tree, includeUncommitted);
    EXPECT_EQ(root, expected_root);
}

fr_hash_path get_hash_path(TreeType& tree, index_t index, bool includeUncommitted = true)
{
    fr_hash_path h;
    Signal signal(1);
    auto completion = [&](const fr_hash_path& path) -> void {
        h = path;
        signal.signal_level(0);
    };
    tree.get_hash_path(index, completion, includeUncommitted);
    signal.wait_for_level(0);
    return h;
}

IndexedLeafType get_leaf(TreeType& tree, index_t index, bool includeUncommitted = true)
{
    IndexedLeafType l;
    Signal signal(1);
    auto completion = [&](const IndexedLeafType& leaf) -> void {
        l = leaf;
        signal.signal_level(0);
    };
    tree.get_leaf(index, includeUncommitted, completion);
    signal.wait_for_level(0);
    return l;
}

void check_hash_path(TreeType& tree, index_t index, fr_hash_path expected_hash_path, bool includeUncommitted = true)
{
    fr_hash_path path = get_hash_path(tree, index, includeUncommitted);
    EXPECT_EQ(path, expected_hash_path);
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
    auto completion = [&](const std::vector<fr_hash_path>&, fr&, index_t) -> void { signal.signal_level(0); };

    tree.add_or_update_value(value, completion);
    signal.wait_for_level(0);
}

void add_values(TreeType& tree, const std::vector<nullifier_leaf_value>& values)
{
    Signal signal(1);
    auto completion = [&](const std::vector<fr_hash_path>&, fr&, index_t) -> void { signal.signal_level(0); };

    tree.add_or_update_values(values, completion);
    signal.wait_for_level(0);
}

TEST_F(PersistedIndexedTreeTest, can_create)
{
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    EXPECT_NO_THROW(Store store(name, depth, db));
    Store store(name, depth, db);
    ThreadPool workers(1);
    TreeType tree = TreeType(store, workers, 1);
    check_size(tree, 1);

    NullifierMemoryTree<HashPolicy> memdb(10);
    check_root(tree, memdb.root());
}

TEST_F(PersistedIndexedTreeTest, can_only_recreate_with_same_name_and_depth)
{
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);

    EXPECT_ANY_THROW(Store store_wrong_name("Wrong name", depth, db));
    EXPECT_ANY_THROW(Store store_wrong_depth(name, depth + 1, db));
}

TEST_F(PersistedIndexedTreeTest, test_size)
{
    ThreadPool workers(1);
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);
    auto tree = TreeType(store, workers, 1);

    check_size(tree, 1);

    // We assume that the first leaf is already filled with (0, 0, 0).
    for (uint32_t i = 0; i < 4; i++) {
        add_value(tree, VALUES[i]);
        check_size(tree, i + 2);
    }
}

TEST_F(PersistedIndexedTreeTest, test_get_hash_path)
{
    NullifierMemoryTree<HashPolicy> memdb(10);

    ThreadPool workers(1);
    constexpr size_t depth = 10;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);
    auto tree = TreeType(store, workers, 1);

    check_size(tree, 1);
    check_root(tree, memdb.root());
    check_hash_path(tree, 0, memdb.get_hash_path(0));

    memdb.update_element(VALUES[512]);
    add_value(tree, VALUES[512]);

    check_size(tree, 2);
    check_hash_path(tree, 0, memdb.get_hash_path(0));
    check_hash_path(tree, 1, memdb.get_hash_path(1));

    uint32_t num_to_append = 512;

    for (uint32_t i = 0; i < num_to_append; ++i) {
        memdb.update_element(VALUES[i]);
        add_value(tree, VALUES[i]);
    }
    check_size(tree, num_to_append + 2);
    check_hash_path(tree, 0, memdb.get_hash_path(0));
    check_hash_path(tree, 512, memdb.get_hash_path(512));
}

TEST_F(PersistedIndexedTreeTest, can_commit_and_restore)
{
    NullifierMemoryTree<HashPolicy> memdb(10);

    ThreadPool workers(1);
    constexpr size_t depth = 10;
    std::string name = randomString();

    {
        LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
        Store store(name, depth, db);
        auto tree = TreeType(store, workers, 1);

        check_size(tree, 1);
        check_root(tree, memdb.root());
        check_hash_path(tree, 0, memdb.get_hash_path(0));

        add_value(tree, VALUES[512]);

        // Committed data should not have changed
        check_size(tree, 1, false);
        check_root(tree, memdb.root(), false);
        check_hash_path(tree, 0, memdb.get_hash_path(0), false);
        check_hash_path(tree, 1, memdb.get_hash_path(1), false);

        memdb.update_element(VALUES[512]);

        // Uncommitted data should have changed
        check_size(tree, 2, true);
        check_root(tree, memdb.root(), true);
        check_hash_path(tree, 0, memdb.get_hash_path(0), true);
        check_hash_path(tree, 1, memdb.get_hash_path(1), true);

        // Now commit
        commit_tree(tree);

        // Now committed data should have changed
        check_size(tree, 2, false);
        check_root(tree, memdb.root(), false);
        check_hash_path(tree, 0, memdb.get_hash_path(0), false);
        check_hash_path(tree, 1, memdb.get_hash_path(1), false);
    }

    // Now restore and it should continue from where we left off
    {
        LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
        Store store(name, depth, db);
        auto tree = TreeType(store, workers, 1);

        // check uncommitted state
        check_size(tree, 2);
        check_root(tree, memdb.root());
        check_hash_path(tree, 0, memdb.get_hash_path(0));

        // check committed state
        check_size(tree, 2, false);
        check_root(tree, memdb.root(), false);
        check_hash_path(tree, 0, memdb.get_hash_path(0), false);
    }
}

TEST_F(PersistedIndexedTreeTest, test_batch_insert)
{
    auto& random_engine = numeric::get_randomness();
    const uint32_t batch_size = 16;
    const uint32_t num_batches = 16;
    uint32_t depth = 10;
    ThreadPool workers(1);
    ThreadPool multi_workers(8);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    std::string name1 = randomString();
    LMDBStore db1(*_environment, name1, false, false, IntegerKeyCmp);
    Store store1(name1, depth, db1);
    auto tree1 = TreeType(store1, workers, batch_size);

    std::string name2 = randomString();
    LMDBStore db2(*_environment, name2, false, false, IntegerKeyCmp);
    Store store2(name2, depth, db2);
    auto tree2 = TreeType(store2, workers, batch_size);

    check_root(tree1, memdb.root());
    check_root(tree2, memdb.root());

    check_hash_path(tree1, 0, memdb.get_hash_path(0));
    check_hash_path(tree2, 0, memdb.get_hash_path(0));

    check_hash_path(tree1, 512, memdb.get_hash_path(512));
    check_hash_path(tree2, 512, memdb.get_hash_path(512));

    for (uint32_t i = 0; i < num_batches; i++) {
        std::vector<nullifier_leaf_value> batch;
        std::vector<fr_hash_path> memory_tree_hash_paths;
        for (uint32_t j = 0; j < batch_size; j++) {
            batch.emplace_back(random_engine.get_random_uint256());
            fr_hash_path path = memdb.update_element(batch[j].value);
            memory_tree_hash_paths.push_back(path);
        }
        std::vector<fr_hash_path> tree1_hash_paths;
        std::vector<fr_hash_path> tree2_hash_paths;
        {
            Signal signal(1);
            CompletionCallback completion = [&](std::vector<fr_hash_path>& hash_paths, fr&, index_t) {
                tree1_hash_paths = hash_paths;
                signal.signal_level(0);
            };
            tree1.add_or_update_values(batch, completion);
            signal.wait_for_level(0);
        }
        {
            Signal signal(1);
            CompletionCallback completion = [&](std::vector<fr_hash_path>& hash_paths, fr&, index_t) {
                tree2_hash_paths = hash_paths;
                signal.signal_level(0);
            };
            tree2.add_or_update_values(batch, completion);
            signal.wait_for_level(0);
        }
        check_root(tree1, memdb.root());
        check_root(tree2, memdb.root());

        check_hash_path(tree1, 0, memdb.get_hash_path(0));
        check_hash_path(tree2, 0, memdb.get_hash_path(0));

        check_hash_path(tree1, 512, memdb.get_hash_path(512));
        check_hash_path(tree2, 512, memdb.get_hash_path(512));

        for (uint32_t j = 0; j < batch_size; j++) {
            EXPECT_EQ(tree1_hash_paths[j], tree2_hash_paths[j]);
        }
    }
}

fr hash_leaf(const IndexedLeafType& leaf)
{
    return HashPolicy::hash(leaf.get_hash_inputs());
}

bool verify_hash_path(TreeType& tree, const IndexedLeafType& leaf_value, const uint32_t idx)
{
    fr root = get_root(tree, true);
    fr_hash_path path = get_hash_path(tree, idx, true);
    auto current = hash_leaf(leaf_value);
    uint32_t depth_ = static_cast<uint32_t>(path.size());
    uint32_t index = idx;
    for (uint32_t i = 0; i < depth_; ++i) {
        fr left = (index & 1) ? path[i].first : current;
        fr right = (index & 1) ? current : path[i].second;
        current = HashPolicy::hash_pair(left, right);
        index >>= 1;
    }
    return current == root;
}

IndexedLeafType create_indexed_nullifier_leaf(const fr& value, index_t nextIndex, const fr& nextValue)
{
    return IndexedLeafType(nullifier_leaf_value(value), nextIndex, nextValue);
}

TEST_F(PersistedIndexedTreeTest, test_indexed_memory)
{
    ThreadPool workers(8);
    // Create a depth-3 indexed merkle tree
    constexpr size_t depth = 3;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);
    auto tree = TreeType(store, workers, 1);

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   0       0       0       0        0       0       0       0
     *  nextVal   0       0       0       0        0       0       0       0
     */
    IndexedLeafType zero_leaf(nullifier_leaf_value(0), 0, 0);
    check_size(tree, 1);
    EXPECT_EQ(get_leaf(tree, 0), zero_leaf);

    /**
     * Add new value 30:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       30      0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   30      0       0       0        0       0       0       0
     */
    add_value(tree, 30);
    check_size(tree, 2);
    EXPECT_EQ(hash_leaf(get_leaf(tree, 0)), hash_leaf(create_indexed_nullifier_leaf(0, 1, 30)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 1)), hash_leaf(create_indexed_nullifier_leaf(30, 0, 0)));

    /**
     * Add new value 10:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       30      10      0        0       0       0       0
     *  nextIdx   2       0       1       0        0       0       0       0
     *  nextVal   10      0       30      0        0       0       0       0
     */
    add_value(tree, 10);
    check_size(tree, 3);
    EXPECT_EQ(hash_leaf(get_leaf(tree, 0)), hash_leaf(create_indexed_nullifier_leaf(0, 2, 10)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 1)), hash_leaf(create_indexed_nullifier_leaf(30, 0, 0)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 2)), hash_leaf(create_indexed_nullifier_leaf(10, 1, 30)));

    /**
     * Add new value 20:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       30      10      20       0       0       0       0
     *  nextIdx   2       0       3       1        0       0       0       0
     *  nextVal   10      0       20      30       0       0       0       0
     */
    add_value(tree, 20);
    check_size(tree, 4);
    EXPECT_EQ(hash_leaf(get_leaf(tree, 0)), hash_leaf(create_indexed_nullifier_leaf(0, 2, 10)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 1)), hash_leaf(create_indexed_nullifier_leaf(30, 0, 0)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 2)), hash_leaf(create_indexed_nullifier_leaf(10, 3, 20)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 3)), hash_leaf(create_indexed_nullifier_leaf(20, 1, 30)));

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
     *  val       0       30      10      20       50      0       0       0
     *  nextIdx   2       4       3       1        0       0       0       0
     *  nextVal   10      50      20      30       0       0       0       0
     */
    add_value(tree, 50);
    check_size(tree, 5);
    EXPECT_EQ(hash_leaf(get_leaf(tree, 0)), hash_leaf(create_indexed_nullifier_leaf(0, 2, 10)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 1)), hash_leaf(create_indexed_nullifier_leaf(30, 4, 50)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 2)), hash_leaf(create_indexed_nullifier_leaf(10, 3, 20)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 3)), hash_leaf(create_indexed_nullifier_leaf(20, 1, 30)));
    EXPECT_EQ(hash_leaf(get_leaf(tree, 4)), hash_leaf(create_indexed_nullifier_leaf(50, 0, 0)));

    // Manually compute the node values
    auto e000 = hash_leaf(get_leaf(tree, 0));
    auto e001 = hash_leaf(get_leaf(tree, 1));
    auto e010 = hash_leaf(get_leaf(tree, 2));
    auto e011 = hash_leaf(get_leaf(tree, 3));
    auto e100 = hash_leaf(get_leaf(tree, 4));
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

    // Check the hash path at index 2 and 3
    // Note: This merkle proof would also serve as a non-membership proof of values in (10, 20) and (20, 30)
    fr_hash_path expected = {
        std::make_pair(e000, e001),
        std::make_pair(e00, e01),
        std::make_pair(e0, e1),
    };
    check_hash_path(tree, 0, expected);
    check_hash_path(tree, 1, expected);
    expected = {
        std::make_pair(e010, e011),
        std::make_pair(e00, e01),
        std::make_pair(e0, e1),
    };
    check_hash_path(tree, 2, expected);
    check_hash_path(tree, 3, expected);
    check_root(tree, root);

    // Check the hash path at index 6 and 7
    expected = {
        std::make_pair(e110, e111),
        std::make_pair(e10, e11),
        std::make_pair(e0, e1),
    };
    check_hash_path(tree, 6, expected);
    check_hash_path(tree, 7, expected);
}

TEST_F(PersistedIndexedTreeTest, test_indexed_tree)
{
    ThreadPool workers(1);
    // Create a depth-8 indexed merkle tree
    constexpr uint32_t depth = 8;
    std::string name = randomString();
    LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
    Store store(name, depth, db);
    auto tree = TreeType(store, workers, 1);

    IndexedLeafType zero_leaf = create_indexed_nullifier_leaf(0, 0, 0);
    check_size(tree, 1);
    EXPECT_EQ(hash_leaf(get_leaf(tree, 0)), hash_leaf(zero_leaf));

    // Add 20 random values to the tree
    for (uint32_t i = 0; i < 20; i++) {
        auto value = fr::random_element();
        add_value(tree, value);
    }

    auto abs_diff = [](uint256_t a, uint256_t b) {
        if (a > b) {
            return (a - b);
        } else {
            return (b - a);
        }
    };

    check_size(tree, 21);

    // Check if a new random value is not a member of this tree.
    fr new_member = fr::random_element();
    std::vector<uint256_t> differences;
    for (uint32_t i = 0; i < uint32_t(21); i++) {
        uint256_t diff_hi = abs_diff(uint256_t(new_member), uint256_t(get_leaf(tree, i).value.get_fr_value()));
        uint256_t diff_lo = abs_diff(uint256_t(new_member), uint256_t(get_leaf(tree, i).value.get_fr_value()));
        differences.push_back(diff_hi + diff_lo);
    }
    auto it = std::min_element(differences.begin(), differences.end());
    auto index = static_cast<uint32_t>(it - differences.begin());

    // Merkle proof at `index` proves non-membership of `new_member`
    EXPECT_TRUE(verify_hash_path(tree, get_leaf(tree, index), index));
}

TEST_F(PersistedIndexedTreeTest, can_add_single_whilst_reading)
{
    constexpr size_t depth = 10;
    NullifierMemoryTree<HashPolicy> memdb(10);
    fr_hash_path initial_path = memdb.get_hash_path(0);
    memdb.update_element(VALUES[0]);
    fr_hash_path final_hash_path = memdb.get_hash_path(0);

    uint32_t num_reads = 16 * 1024;
    std::vector<fr_hash_path> paths(num_reads);

    {
        std::string name = randomString();
        LMDBStore db(*_environment, name, false, false, IntegerKeyCmp);
        Store store(name, depth, db);
        ThreadPool pool(8);
        TreeType tree(store, pool, 1);

        check_size(tree, 1);

        Signal signal(2);

        auto add_completion = [&](const std::vector<fr_hash_path>&, fr&, index_t) {
            signal.signal_level(1);
            auto commit_completion = [&]() { signal.signal_level(0); };
            tree.commit(commit_completion);
        };
        tree.add_or_update_value(VALUES[0], add_completion);

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